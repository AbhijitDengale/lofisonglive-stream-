import express from 'express'
import { spawn } from 'child_process'
import fs from 'fs';
import path from 'path';

const server = express()
const streamkey = 'wk7s-yxz0-ama6-amsm-8ygh';

// Video and audio files
const videoFile = 'girl.mp4';
const audioFiles = ['1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3', '7.mp3'];
let currentAudioIndex = Math.floor(Math.random() * audioFiles.length);

// Function to check if files exist
function checkFiles() {
    if (!fs.existsSync(path.join(process.cwd(), videoFile))) {
        throw new Error('Video file not found');
    }
    
    const missingAudio = audioFiles.filter(file => !fs.existsSync(path.join(process.cwd(), file)));
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
    console.log(`Switching to audio: ${audioFiles[currentAudioIndex]}`);
    return audioFiles[currentAudioIndex];
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
    return [
        'ffmpeg',
        '-re',                     // Read input at native frame rate
        '-stream_loop', '-1',      // Loop video indefinitely
        '-i', videoFile,           // Video input
        '-stream_loop', '-1',      // Loop audio indefinitely
        '-i', audioFile,           // Audio input
        
        // Video encoding settings
        '-c:v', 'libx264',         // Video codec
        '-preset', 'veryfast',     // Encoding preset (changed from ultrafast for better quality)
        '-tune', 'zerolatency',    // Tune for streaming
        '-profile:v', 'main',      // H.264 profile
        '-level', '4.0',           // H.264 level
        '-pix_fmt', 'yuv420p',     // Pixel format (fixed from yuvj420p)
        '-color_range', '1',       // Force color range
        '-colorspace', 'bt709',    // Color space
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        
        // Video quality settings
        '-b:v', '2500k',           // Video bitrate
        '-bufsize', '5000k',       // Buffer size
        '-maxrate', '2500k',       // Maximum bitrate
        '-r', '30',                // Frame rate
        '-g', '60',                // Keyframe interval
        '-keyint_min', '60',       // Minimum keyframe interval
        
        // Audio encoding settings
        '-c:a', 'aac',             // Audio codec
        '-b:a', '192k',            // Audio bitrate
        '-ar', '44100',            // Audio sample rate
        '-af', 'aresample=async=1000', // Audio resampling for sync
        
        // Output settings
        '-shortest',               // End when shortest input ends
        '-max_muxing_queue_size', '1024', // Increase muxing queue
        '-f', 'flv',               // Output format
        
        // Map streams
        '-map', '0:v:0',           // Map video from first input
        '-map', '1:a:0',           // Map audio from second input
        
        // YouTube RTMP endpoint (using x instead of a)
        `rtmp://x.rtmp.youtube.com/live2/${streamkey}`
    ];
}

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
        const ffmpegCommand = createFFmpegCommand(audioFile);
        
        console.log(`Starting stream with video: ${videoFile} and audio: ${audioFile}`);
        const child = spawn(ffmpegCommand[0], ffmpegCommand.slice(1));

        let lastErrorTime = 0;
        const errorThrottleMs = 5000; // Throttle similar errors

        child.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        child.stderr.on('data', (data) => {
            const now = Date.now();
            const errorMsg = data.toString();
            
            // Only log errors if they're not too frequent
            if (now - lastErrorTime > errorThrottleMs) {
                console.error(`stderr: ${errorMsg}`);
                lastErrorTime = now;
            }
        });

        child.on('close', (code) => {
            console.log(`Stream ended with code ${code}`);
            // Change audio and restart stream
            setTimeout(startStreaming, 1000);
        });

        child.on('error', (err) => {
            console.error(`Child process error: ${err}`);
            // Attempt to restart on error
            setTimeout(startStreaming, 5000);
        });

    } catch (error) {
        console.error(`Streaming error: ${error.message}`);
        // Attempt to restart on error
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
        currentAudio: audioFiles[currentAudioIndex],
        video: videoFile
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Live stream server is ready on port ${PORT}`)
});
