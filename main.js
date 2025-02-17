import express from 'express'
import { spawn } from 'child_process'
import fs from 'fs';
import path from 'path';

const server = express()
const streamkey = 'wk7s-yxz0-ama6-amsm-8ygh';

// Media directory setup
const isDocker = fs.existsSync('/.dockerenv');
const mediaDir = isDocker ? '/usr/src/app/media' : process.cwd();

// Video and audio files
const videoFile = path.join(mediaDir, 'girl.mp4');
const audioFiles = ['1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3', '7.mp3'].map(file => path.join(mediaDir, file));
let currentAudioIndex = Math.floor(Math.random() * audioFiles.length);

// Function to check if files exist
function checkFiles() {
    if (!fs.existsSync(videoFile)) {
        throw new Error(`Video file not found at ${videoFile}`);
    }
    
    const missingAudio = audioFiles.filter(file => !fs.existsSync(file));
    if (missingAudio.length > 0) {
        throw new Error(`Missing audio files: ${missingAudio.join(', ')}`);
    }
    return true;
}

// Function to get next random audio file
function getNextAudio() {
    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * audioFiles.length);
    } while (newIndex === currentAudioIndex && audioFiles.length > 1);
    
    currentAudioIndex = newIndex;
    const audioFile = audioFiles[currentAudioIndex];
    console.log(`Switching to audio: ${path.basename(audioFile)}`);
    return audioFile;
}

// Function to check if ffmpeg is installed
async function checkFFmpeg() {
    try {
        const child = spawn('ffmpeg', ['-version']);
        return new Promise((resolve) => {
            child.on('error', () => resolve(false));
            child.on('close', (code) => resolve(code === 0));
        });
    } catch (error) {
        return false;
    }
}

// Function to create FFmpeg command for video with audio
function createFFmpegCommand(audioFile) {
    // Base FFmpeg options
    const options = [
        '-re',                     // Read input at native frame rate
        '-stream_loop', '-1',      // Loop video indefinitely
        '-i', videoFile,           // Video input
        '-stream_loop', '-1',      // Loop audio indefinitely
        '-i', audioFile,           // Audio input
        
        // Video encoding settings
        '-c:v', 'libx264',         // Video codec
        '-preset', 'veryfast',     // Encoding preset
        '-tune', 'zerolatency',    // Tune for streaming
        '-profile:v', 'baseline',  // H.264 profile (changed to baseline for better compatibility)
        '-level', '3.0',           // H.264 level (changed for better compatibility)
        '-pix_fmt', 'yuv420p',     // Pixel format
        
        // Video quality settings
        '-b:v', '2000k',           // Video bitrate (reduced for stability)
        '-bufsize', '4000k',       // Buffer size
        '-maxrate', '2000k',       // Maximum bitrate
        '-r', '30',                // Frame rate
        '-g', '60',                // Keyframe interval
        '-keyint_min', '60',       // Minimum keyframe interval
        
        // Audio encoding settings
        '-c:a', 'aac',             // Audio codec
        '-b:a', '128k',            // Audio bitrate
        '-ar', '44100',            // Audio sample rate
        '-af', 'aresample=async=1000', // Audio resampling for sync
        
        // Output settings
        '-shortest',               // End when shortest input ends
        '-max_muxing_queue_size', '1024', // Increase muxing queue
        '-f', 'flv',               // Output format
        
        // Map streams
        '-map', '0:v:0',           // Map video from first input
        '-map', '1:a:0',           // Map audio from second input
    ];

    // Add different RTMP endpoints to try
    const rtmpEndpoints = [
        `rtmp://x.rtmp.youtube.com/live2/${streamkey}`,
        `rtmp://a.rtmp.youtube.com/live2/${streamkey}`,
        `rtmp://b.rtmp.youtube.com/live2/${streamkey}`
    ];

    return {
        command: 'ffmpeg',
        args: [...options, rtmpEndpoints[0]], // Start with first endpoint
        endpoints: rtmpEndpoints
    };
}

let currentEndpointIndex = 0;
let retryCount = 0;
const MAX_RETRIES = 3;

// Function to start streaming
async function startStreaming() {
    try {
        // Check if FFmpeg is available
        const ffmpegAvailable = await checkFFmpeg();
        if (!ffmpegAvailable) {
            console.error('FFmpeg is not installed. Please install FFmpeg first.');
            process.exit(1);
        }

        // Check if all files exist
        checkFiles();

        const audioFile = getNextAudio();
        const { command, args, endpoints } = createFFmpegCommand(audioFile);
        
        console.log(`Starting stream with video: ${path.basename(videoFile)} and audio: ${path.basename(audioFile)}`);
        console.log(`Using RTMP endpoint: ${endpoints[currentEndpointIndex]}`);
        
        const child = spawn(command, [...args.slice(0, -1), endpoints[currentEndpointIndex]]);

        let lastErrorTime = 0;
        const errorThrottleMs = 5000;

        child.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        child.stderr.on('data', (data) => {
            const now = Date.now();
            const errorMsg = data.toString();
            
            if (now - lastErrorTime > errorThrottleMs) {
                console.error(`stderr: ${errorMsg}`);
                lastErrorTime = now;
            }
        });

        child.on('close', (code) => {
            console.log(`Stream ended with code ${code}`);
            
            if (code !== 0) {
                // Try next endpoint if current one fails
                currentEndpointIndex = (currentEndpointIndex + 1) % endpoints.length;
                retryCount++;
                
                if (retryCount >= MAX_RETRIES * endpoints.length) {
                    console.error('Max retries reached. Waiting longer before next attempt...');
                    retryCount = 0;
                    setTimeout(startStreaming, 30000); // Wait 30 seconds
                } else {
                    console.log(`Retrying with next endpoint: ${endpoints[currentEndpointIndex]}`);
                    setTimeout(startStreaming, 5000);
                }
            } else {
                // Reset retry count on successful stream
                retryCount = 0;
                setTimeout(startStreaming, 1000);
            }
        });

        child.on('error', (err) => {
            console.error(`Child process error: ${err}`);
            setTimeout(startStreaming, 5000);
        });

    } catch (error) {
        console.error(`Streaming error: ${error.message}`);
        setTimeout(startStreaming, 5000);
    }
}

// Initialize streaming
startStreaming();

// Setup express server
server.get('/', (req, res) => {
    res.send('Live Streaming Running - Single Video with Random Audio')
});

server.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        currentAudio: path.basename(audioFiles[currentAudioIndex]),
        video: path.basename(videoFile),
        isDocker: isDocker,
        mediaDir: mediaDir
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Live stream server is ready on port ${PORT}`)
});
