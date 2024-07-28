# Use a specific version of Node.js as the base image
FROM node:22.5.1

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY package*.json ./

# Copy tsconfig.json
COPY tsconfig.json ./

# Install dependencies locally
RUN npm install

# Copy the rest of the application code
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
CMD ["npm", "start"]
