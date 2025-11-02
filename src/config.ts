// src/config.ts
/**
 * Application configuration loader.
 *
 * - Reads values from process.env (dotenv is loaded here).
 * - Exposes a typed `config` object used across the app.
 * - Exposes small helpers for deriving temp/final storage paths so code stays consistent.
 *
 * IMPORTANT:
 *  - Put secrets (INTERNAL_API_KEY etc.) in your .env and never commit .env to git.
 *  - This module intentionally avoids throwing hard errors so the app can start in dev
 *    with defaults; adjust to throw if you want stricter startup validation.
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config();

export type StorageDriver = "local" | "host" | "both";

const env = process.env;

export const config = {
  // Server
  port: Number(env.PORT || 4000),
  nodeEnv: env.NODE_ENV || "development",

  // Internal auth for server->server calls. Replace in production via env.
  internalApiKey: env.INTERNAL_API_KEY || "changeme_replace_me",

  // Storage driver: determines where files are written
  storageDriver: (env.STORAGE_DRIVER || "host") as StorageDriver,

  // When using host storage, this absolute path on the host will be mounted into the container.
  // We resolve it to an absolute path to avoid surprises.
  hostStoragePath: env.HOST_STORAGE_PATH
    ? path.resolve(env.HOST_STORAGE_PATH)
    : path.resolve(process.cwd(), "data", "media"),

  // Public base URL used to build public URLs for files (configure to your nginx domain)
  publicBaseUrl: env.PUBLIC_BASE_URL || `http://localhost:${env.PORT || 4000}`,

  // Time-to-live (seconds) for temporary uploads before GC
  tempTtl: Number(env.TEMP_TTL || 3600),

  // Which media modules are enabled (image, video, audio, document)
  enabledMediaTypes: (env.ENABLED_MEDIA_TYPES || "image")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Simple operational options
  logLevel: (env.LOG_LEVEL as any) || "info",

  // Optional: limit upload size (bytes). Default: 50 MB.
  uploadLimitBytes: Number(env.UPLOAD_LIMIT_BYTES || 50 * 1024 * 1024),
};

/**
 * Derived helpers for storage paths.
 * All functions return absolute paths on the container filesystem.
 *
 * - If STORAGE_DRIVER is "host" (or "both"), we prefer writing into the mounted host path.
 * - Otherwise we use the project-local `data/` folder (inside container).
 *
 * Use these helpers from storage.service so the logic is centralised here.
 */

export const paths = {
  tempDir(): string {
    // temp uploads directory
    if (config.storageDriver === "host" || config.storageDriver === "both") {
      return path.join(config.hostStoragePath, "temp");
    }
    return path.join(process.cwd(), "data", "temp");
  },

  finalRoot(): string {
    // final public media root (where final pages/variants will be placed)
    if (config.storageDriver === "host" || config.storageDriver === "both") {
      return path.join(config.hostStoragePath, "media");
    }
    return path.join(process.cwd(), "data", "media");
  },

  // Build a relative path that will be used for public URLs (posix-style)
  // Example: "books/123-my-book/chapters/45/pages/001.webp"
  publicPathToUrl(publicPath: string) {
    // ensure forward slashes for URLs
    const p = publicPath.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${config.publicBaseUrl}/${p}`;
  },
};

/**
 * Basic runtime checks & warnings (use logger in the real app)
 * - Warn when using the default internal key (helps avoid accidental insecure deployments).
 * - Warn when hostStoragePath resolves to a folder inside the project (you might want an absolute host path).
 */
(function runtimeSanityChecks() {
  if (!process.env.INTERNAL_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️  INTERNAL_API_KEY is not set in .env — running with default insecure key. Set INTERNAL_API_KEY in production!"
    );
  }
  // Warn if host storage path points to project dir (common mistake)
  const hostPath = config.hostStoragePath;
  if (hostPath.startsWith(process.cwd())) {
    // eslint-disable-next-line no-console
    console.info(
      `ℹ️  HOST_STORAGE_PATH resolves to project path: ${hostPath}. This is fine for local dev, but for production consider using an absolute host path outside the project root.`
    );
  }
})();



