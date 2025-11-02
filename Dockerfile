# Simple single-stage Dockerfile (Alpine). Small and easy to read.
FROM node:18-alpine

WORKDIR /usr/src/app

# Install runtime/build deps required by sharp (libvips). Keep the list small.
# If you don't use sharp or image processing, you can remove this RUN line.
RUN apk add --no-cache build-base vips-dev fftw-dev poppler-utils


# Install dependencies. Prefer reproducible install if package-lock.json exists.
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm ci

# Copy source and build (expects a "build" script in package.json -> tsc)
COPY . .

RUN npm run build

EXPOSE 4000

# Start the compiled app
CMD ["node", "dist/index.js"]
