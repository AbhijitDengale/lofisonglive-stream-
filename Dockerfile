FROM node:18-bullseye

# Install FFmpeg and other dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Create media directory
RUN mkdir -p /usr/src/app/media

# Copy app source and media files
COPY . .

# Make sure media files are in the correct location
RUN mv *.mp3 *.mp4 media/ || true

# Set permissions
RUN chmod -R 755 /usr/src/app

# Expose port
EXPOSE 3000

# Start the application
CMD [ "node", "main.js" ]
