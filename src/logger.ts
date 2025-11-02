// src/logger.ts
/**
 * Logger module with runtime enable/disable and TTL-based cleanup for log files.
 *
 * Features:
 *  - Console logging always available (unless logging is disabled at runtime).
 *  - Optional file logging via `winston-daily-rotate-file` (enable with LOG_TO_FILE=true).
 *  - Log retention (TTL) via `maxFiles` on the rotate transport; fallback GC removes files older than TTL days.
 *  - Runtime controls: enableLogging(), disableLogging(), setLogLevel(), rotateNow().
 *  - stream for morgan integration.
 *
 * Env vars (see .env.example):
 *  - LOGGING_ENABLED (true|false)   -> overall logger enabled by default
 *  - LOG_TO_FILE      (true|false)  -> enable file transport
 *  - LOG_TTL_DAYS     (number)      -> number of days to keep old logs (default 30)
 *  - LOG_LEVEL        (info|debug|warn|error) -> default log level
 *
 * Notes:
 *  - Install dependencies: `npm i winston winston-daily-rotate-file`
 *  - If winston-daily-rotate-file isn't available the code falls back to a simple file GC.
 */

import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { createLogger, format, transports, Logger } from "winston";
import { config } from "./config";

const { combine, timestamp, printf, errors, json } = format;

// Optional rotate transport - require dynamically to avoid hard crash if not installed.
let DailyRotateFile: any | null = null;
try {
  // Use require to avoid TS/ESM interop pitfalls in some setups.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DailyRotateFile = require("winston-daily-rotate-file");
} catch (err) {
  DailyRotateFile = null;
}

// Where logs are written when LOG_TO_FILE is enabled.
// Use host storage path when configured (so nginx/host can access them easily).
const hostLogsDir =
  config.storageDriver === "host" || config.storageDriver === "both"
    ? path.join(config.hostStoragePath, "logs")
    : path.join(process.cwd(), "data", "logs");

// ensure folder exists (best-effort)
try {
  fs.mkdirSync(hostLogsDir, { recursive: true });
} catch (err) {
  // ignore
}

// Human-friendly console formatter
const consoleFormat = printf(
  ({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${stack || message}${metaStr}`;
  }
);

// JSON format for files
const fileFormat = combine(timestamp(), errors({ stack: true }), json());

/**
 * Internal state
 */
let logger: Logger;
let fileTransportInstance: any | null = null;
let loggingEnabled =
  (process.env.LOGGING_ENABLED || "true").toLowerCase() === "true";

/**
 * Initialize base logger (console transport).
 * We keep a single logger instance and add/remove transports at runtime.
 */
function createBaseLogger() {
  const transportsList: any[] = [];

  // Console transport (always present unless logging is disabled)
  transportsList.push(
    new transports.Console({
      level: process.env.LOG_LEVEL || config.logLevel,
      format: combine(timestamp(), errors({ stack: true }), consoleFormat),
    })
  );

  logger = createLogger({
    level: process.env.LOG_LEVEL || config.logLevel,
    transports: transportsList,
    exitOnError: false,
  });
}

createBaseLogger();

/**
 * Create or attach the daily rotate file transport (if requested).
 * Returns the transport instance or null.
 */
function attachFileTransportIfNeeded() {
  const wantFile =
    (process.env.LOG_TO_FILE || "false").toLowerCase() === "true";
  if (!wantFile) return null;

  const ttlDays = Number(process.env.LOG_TTL_DAYS || 30);
  const filename = path.join(hostLogsDir, "app-%DATE%.log");

  if (DailyRotateFile) {
    // Use the rotate transport's maxFiles option to automatically remove old files.
    const transport = new DailyRotateFile({
      filename,
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: `${ttlDays}d`, // e.g., '30d' => keep 30 days
      level: process.env.LOG_LEVEL || config.logLevel,
      format: fileFormat,
    });

    logger.add(transport);
    fileTransportInstance = transport;
    return transport;
  }

  // fallback: create a simple file transport (no rotation support) and rely on manual GC.
  const fallbackPath = path.join(hostLogsDir, "app-fallback.log");
  const fileTransport = new transports.File({
    filename: fallbackPath,
    level: process.env.LOG_LEVEL || config.logLevel,
    format: fileFormat,
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
  });
  logger.add(fileTransport);
  fileTransportInstance = fileTransport;
  return fileTransport;
}

/**
 * Detach file transport (useful when toggling off file logging).
 */
function detachFileTransport() {
  if (!fileTransportInstance) return;
  try {
    logger.remove(fileTransportInstance);
    // close if has close method
    if (typeof fileTransportInstance.close === "function") {
      try {
        fileTransportInstance.close();
      } catch (e) {
        /* ignore */
      }
    }
  } finally {
    fileTransportInstance = null;
  }
}

/**
 * Cleanup old log files older than TTL days (fallback when rotate transport not present
 * or in addition to it). It scans the logs directory and removes files older than threshold.
 */
async function cleanupOldLogs(ttlDays: number) {
  try {
    if (!ttlDays || ttlDays <= 0) return;
    const files = await fsp.readdir(hostLogsDir);
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    await Promise.all(
      files.map(async (f) => {
        try {
          const full = path.join(hostLogsDir, f);
          const stat = await fsp.stat(full);
          const mtime = stat.mtime.getTime();
          // Only remove files (not directories)
          if (!stat.isFile()) return;
          if (now - mtime > ttlMs) {
            await fsp.unlink(full);
            logger.info(`Deleted old log file: ${full}`);
          }
        } catch (err) {
          // ignore per-file errors
          // eslint-disable-next-line no-console
          console.debug(
            `cleanupOldLogs: couldn't process ${f} - ${String(err)}`
          );
        }
      })
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`cleanupOldLogs failed: ${String(err)}`);
  }
}

/**
 * Public API: enable logging (turn on console + possibly file)
 */
export function enableLogging() {
  if (loggingEnabled) return;
  loggingEnabled = true;
  logger.silent = false;

  // ensure console transport exists
  if (!logger.transports.some((t: any) => t instanceof transports.Console)) {
    logger.add(
      new transports.Console({
        format: combine(timestamp(), errors({ stack: true }), consoleFormat),
      })
    );
  }

  // attach file transport if env requests it
  attachFileTransportIfNeeded();
  logger.info("Logging enabled at runtime");
}

/**
 * Public API: disable logging (silence logger)
 */
export function disableLogging() {
  if (!loggingEnabled) return;
  loggingEnabled = false;
  // silence the logger (winston will skip output)
  logger.silent = true;

  // optionally detach file transport to free file handles
  detachFileTransport();
  // keep logger instance for potential re-enable
}

/**
 * Set log level at runtime (debug|info|warn|error)
 */
export function setLogLevel(level: string) {
  logger.level = level;
  logger.transports.forEach((t: any) => {
    if (t.level) t.level = level;
  });
  logger.info(`Log level set to ${level}`);
}

/**
 * Best-effort rotate logs now (if transport supports it).
 * - For winston-daily-rotate-file, transport has a 'rotate' method.
 */
export function rotateNow() {
  if (
    fileTransportInstance &&
    typeof fileTransportInstance.rotate === "function"
  ) {
    try {
      fileTransportInstance.rotate();
      logger.info("Triggered log rotation");
    } catch (err) {
      logger.warn("rotateNow failed: " + String(err));
    }
  } else {
    logger.info("rotateNow: no rotate-capable transport available");
  }
}

/**
 * stream for morgan (HTTP request logger)
 */
export const stream = {
  write: (message: string) => {
    // morgan includes newline at end
    logger.info(message.trim());
  },
};

// Expose the logger instance for importing modules
export { logger };

/**
 * Boot-time initialization:
 * - Attach file transport if requested and initial logging enabled
 * - Run initial cleanup for TTL if needed (scheduled daily thereafter)
 */
(function initAtBoot() {
  // apply initial enable/disable
  if (!loggingEnabled) {
    // Silence the logger
    logger.silent = true;
  } else {
    // attach file transport if requested
    attachFileTransportIfNeeded();
  }

  const ttlDays = Number(process.env.LOG_TTL_DAYS || 30);
  // run an immediate cleanup (best-effort)
  (async () => {
    if (DailyRotateFile) {
      // If using daily rotate transport with maxFiles, it usually manages removal.
      // Still, run a light GC in case of fallback or leftover files.
      await cleanupOldLogs(ttlDays);
    } else {
      // No rotate transport installed - run cleanup and schedule daily GC.
      await cleanupOldLogs(ttlDays);
    }
  })();

  // schedule daily cleanup (once per 24h)
  const oneDayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    const ttl = Number(process.env.LOG_TTL_DAYS || 30);
    cleanupOldLogs(ttl);
  }, oneDayMs).unref();
})();
