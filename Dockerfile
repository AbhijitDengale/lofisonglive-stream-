FROM node:18-bullseye

# Install FFmpeg and other dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Create media directory
RUN mkdir -p /usr/src/app/media

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Set permissions
RUN chmod -R 755 /usr/src/app

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "main.js"]
