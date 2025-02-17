import express from 'express'
import { spawn } from 'child_process'
import fs from 'fs';
import path from 'path';

const server = express()
const streamkey = 'wk7s-yxz0-ama6-amsm-8ygh';

// Video and audio files
const videoFile = 'girl.mp4';
const audioFiles = ['1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3' ,'7.mp3'];
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
    // Get a random index different from the current one
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
        '-re',
        '-stream_loop', '-1',  // Loop video indefinitely
        '-i', videoFile,       // Video input
        '-stream_loop', '-1',  // Loop audio indefinitely
        '-i', audioFile,       // Audio input
        '-c:v', 'libx264',     // Video codec
        '-pix_fmt', 'yuvj420p',
        '-maxrate', '2048k',
        '-preset', 'ultrafast',
        '-r', '30',            // Frame rate
        '-g', '60',
        '-c:a', 'aac',         // Audio codec
        '-b:a', '128k',        // Audio bitrate
        '-strict', 'experimental',
        '-shortest',           // End when shortest input ends
        '-map', '0:v:0',       // Map video from first input
        '-map', '1:a:0',       // Map audio from second input
        '-b:v', '1500k',
        '-f', 'flv',
        `rtmp://a.rtmp.youtube.com/live2/${streamkey}`
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

        child.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        child.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
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
