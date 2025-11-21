# Use official node image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Install dependencies first (only package.json + package-lock.json)
COPY package*.json ./

RUN npm install --omit=dev

# Copy source code
COPY . .

# Expose port (important for Cloud Run)
EXPOSE 8080

# Cloud Run looks for PORT env, so set default port
ENV PORT=8080

# Start command
CMD ["npm", "start"]
