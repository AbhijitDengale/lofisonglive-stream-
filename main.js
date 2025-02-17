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
    // Base FFmpeg options with improved settings
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
        '-profile:v', 'baseline',  // H.264 profile
        '-level', '3.0',           // H.264 level
        '-pix_fmt', 'yuv420p',     // Pixel format
        
        // Video quality settings
        '-b:v', '2500k',           // Video bitrate
        '-minrate', '2500k',       // Minimum bitrate
        '-maxrate', '2500k',       // Maximum bitrate
        '-bufsize', '5000k',       // Buffer size
        '-r', '30',                // Frame rate
        '-g', '60',                // Keyframe interval
        '-keyint_min', '60',       // Minimum keyframe interval
        '-force_key_frames', 'expr:gte(t,n_forced*2)', // Force keyframe every 2 seconds
        
        // Audio encoding settings
        '-c:a', 'aac',             // Audio codec
        '-b:a', '160k',            // Audio bitrate
        '-ar', '44100',            // Audio sample rate
        '-af', 'aresample=async=1000', // Audio resampling for sync
        
        // Output settings
        '-preset', 'veryfast',     // Use very fast preset for lower latency
        '-maxrate', '2500k',       // Ensure consistent bitrate
        '-bufsize', '5000k',       // Double of maxrate for buffer
        '-f', 'flv',               // Output format
        
        // Stream optimization
        '-threads', '4',           // Use 4 threads for encoding
        '-cpu-used', '5',          // CPU usage preset (0-5, higher = faster)
        '-quality', 'realtime',    // Optimize for realtime streaming
        
        // Map streams
        '-map', '0:v:0',           // Map video from first input
        '-map', '1:a:0',           // Map audio from second input
    ];

    // Add RTMP endpoint
    const rtmpUrl = 'rtmp://x.rtmp.youtube.com/live2';
    const endpoint = `${rtmpUrl}/${streamkey}`;

    return {
        command: 'ffmpeg',
        args: [...options, endpoint],
        endpoint: endpoint
    };
}

let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

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
        const { command, args, endpoint } = createFFmpegCommand(audioFile);
        
        console.log(`Starting stream with video: ${path.basename(videoFile)} and audio: ${path.basename(audioFile)}`);
        console.log(`Using RTMP endpoint: ${endpoint}`);
        
        const child = spawn(command, args);

        let lastErrorTime = 0;
        const errorThrottleMs = 5000;
        let isConnected = false;

        child.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`stdout: ${output}`);
            if (output.includes('Connected')) {
                isConnected = true;
                retryCount = 0; // Reset retry count on successful connection
            }
        });

        child.stderr.on('data', (data) => {
            const now = Date.now();
            const errorMsg = data.toString();
            
            if (now - lastErrorTime > errorThrottleMs) {
                console.error(`stderr: ${errorMsg}`);
                lastErrorTime = now;

                // Check for specific error conditions
                if (errorMsg.includes('Connection refused') || 
                    errorMsg.includes('Connection timed out') ||
                    errorMsg.includes('Error connecting')) {
                    child.kill(); // Kill the process to trigger reconnect
                }
            }
        });

        child.on('close', (code) => {
            console.log(`Stream ended with code ${code}`);
            
            if (!isConnected || code !== 0) {
                retryCount++;
                
                if (retryCount >= MAX_RETRIES) {
                    console.error('Max retries reached. Waiting longer before next attempt...');
                    retryCount = 0;
                    setTimeout(startStreaming, RETRY_DELAY * 2);
                } else {
                    console.log(`Retry attempt ${retryCount}/${MAX_RETRIES}`);
                    setTimeout(startStreaming, RETRY_DELAY);
                }
            } else {
                // If we were connected but stream ended, restart immediately
                console.log('Stream ended normally, restarting...');
                setTimeout(startStreaming, 1000);
            }
        });

        child.on('error', (err) => {
            console.error(`Child process error: ${err}`);
            setTimeout(startStreaming, RETRY_DELAY);
        });

    } catch (error) {
        console.error(`Streaming error: ${error.message}`);
        setTimeout(startStreaming, RETRY_DELAY);
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
        mediaDir: mediaDir,
        retryCount: retryCount
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Live stream server is ready on port ${PORT}`)
});
