# FROM node:18-alpine
# WORKDIR /usr/src/app


# # Install build deps for sharp
# RUN apk add --no-cache build-base vips-dev fftw-dev


# COPY package.json package-lock.json* ./
# RUN npm ci --only=production || npm ci


# COPY . .


# RUN npm run build


# EXPOSE 4000
# CMD ["node", "dist/index.js"]





# Use Dockerfile syntax v1
# Multi-stage build: build artefacts (TypeScript -> JS) and native modules in the builder,
# then copy only what's needed into a small runtime image.
#
# We use Debian-slim (bullseye) because image processing libraries like libvips
# are easier/stabler to install there than in Alpine in many environments.
# If you prefer Alpine, we can adapt this (but sharp/build deps differ).
################################################################################
# Builder stage: installs build tools, installs all npm deps (including dev),
# compiles TypeScript into /usr/src/app/dist and prunes dev dependencies.
FROM node:18-bullseye-slim AS builder

# Install build-time dependencies required by sharp (and other native modules).
# - build-essential/g++/make/python3 for compiling native modules
# - libvips-dev required by sharp at build time
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    g++ \
    make \
    libvips-dev \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files and install all dependencies (including dev) for build.
COPY package*.json ./
# Use npm ci for reproducible installs; in CI you should have package-lock.json.
RUN npm ci

# Copy source and build
COPY . .
# Build the TypeScript project (expects "build" script in package.json -> tsc)
RUN npm run build

# Remove devDependencies to keep node_modules small in the final image.
# `npm prune --production` removes packages listed in devDependencies.
RUN npm prune --production

################################################################################
# Runtime stage: small image with only runtime deps and compiled code.
# We install runtime libvips package (not dev) so sharp can run.
FROM node:18-bullseye-slim AS runner

# Install runtime dependencies for image processing.
# libvips (runtime) is required by sharp; ca-certificates for HTTPS requests.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libvips \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package.json (keeps metadata), prod node_modules and built JS
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# (Optional) copy any static/default files you want at runtime, e.g. .env.example
COPY --from=builder /usr/src/app/.env.example ./.env.example

# Create a non-root user and take ownership of app directory for safer runtime
RUN groupadd -r app && useradd -r -g app app \
  && chown -R app:app /usr/src/app

USER app

# Expose the port the app listens on (match your config)
EXPOSE 4000

# Default NODE_ENV for runtime
ENV NODE_ENV=production

# Start the compiled Node app
CMD ["node", "dist/index.js"]
