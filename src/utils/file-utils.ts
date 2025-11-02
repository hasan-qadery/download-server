// src/utils/fileUtils.ts
/**
 * File / path utilities used by the download-server.
 *
 * Small, focused helpers:
 *  - ensureDir: create directories recursively (safe)
 *  - sanitizeFilename: remove unsafe chars from filenames
 *  - padNumber: pad integers for page numbering (001)
 *  - computeSha256: compute sha256 for a Buffer or stream (used for dedup / integrity)
 *  - streamToBuffer: collect a Readable stream to a Buffer (careful with large files)
 *  - safeJoin: join paths but prevent path traversal outside root (very important)
 *  - humanFileSize: pretty-print bytes
 *
 * Security notes:
 *  - Always use `safeJoin(root, relativePath)` to avoid directory traversal attacks.
 *  - Avoid collecting extremely large streams into memory with streamToBuffer; prefer streaming to disk for large uploads.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Sanitize a filename to a filesystem-safe form.
 * Keeps alphanumerics, dash, underscore, dot. Collapses spaces to underscore.
 * Truncates to a reasonable length (200 chars).
 */
export function sanitizeFilename(name: string): string {
  if (!name) return "";
  // strip directory separators, only keep base name
  const base = path.basename(name);
  // replace spaces and control chars
  const cleaned = base
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9\-_.]/g, "_")
    .replace(/^_+|_+$/g, ""); // trim leading/trailing underscores
  return cleaned.slice(0, 200);
}

/**
 * Pad a number with leading zeros. Default width = 3 -> 1 -> "001"
 */
export function padNumber(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

/**
 * Compute SHA256 hash of a Buffer (returns hex string).
 */
export function computeSha256(buffer: Buffer): string {
  const h = crypto.createHash("sha256");
  h.update(buffer);
  return h.digest("hex");
}

/**
 * Compute SHA256 hash of a stream (async).
 * Note: this consumes the stream. Caller should pass a fresh stream (e.g. fs.createReadStream).
 */
export async function computeSha256FromStream(
  stream: Readable
): Promise<string> {
  const hash = crypto.createHash("sha256");
  // pipeline stream -> hashing (no output), but easiest is to pipe to a small writable that updates hash
  await pipeline(
    stream,
    // transform that updates hash; implement with a writable stream
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk as Buffer);
        yield chunk; // yield through (not used by caller)
      }
    }
  ).catch(() => {
    // pipeline might error because no consumer; that's ok for hash only
  });

  return hash.digest("hex");
}

/**
 * Collect a readable stream into a Buffer.
 * WARNING: This loads the entire stream into memory. Don't use for very large files
 * unless you are sure sizes are limited (e.g. < upload limit).
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

/**
 * Save a buffer atomically to a file path (write to tmp then rename).
 * Creates the containing directory if needed.
 */
export async function writeFileAtomic(
  targetPath: string,
  buffer: Buffer
): Promise<void> {
  const dir = path.dirname(targetPath);
  await ensureDir(dir);
  const tmp = `${targetPath}.tmp-${crypto.randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmp, buffer);
  // Use rename which is atomic on most POSIX filesystems
  await fs.rename(tmp, targetPath);
}

/**
 * Safe path join: ensures that the resulting path is inside the given root.
 * - root: absolute root directory
 * - relative: a path relative that will be appended (may contain nested folders)
 *
 * Throws if result is outside the root (prevents path traversal).
 */
export function safeJoin(root: string, relative: string): string {
  const normalizedRoot = path.resolve(root);
  const joined = path.resolve(normalizedRoot, relative);
  if (
    !joined.startsWith(normalizedRoot + path.sep) &&
    joined !== normalizedRoot
  ) {
    throw new Error("Invalid path: outside of storage root");
  }
  return joined;
}

/**
 * Return basic file metadata for a path (size, createdAt, modifiedAt).
 * - pathOnDisk: absolute path to the file
 */
export async function statSafe(pathOnDisk: string) {
  const stats = await fs.stat(pathOnDisk);
  return {
    size: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
  };
}

/**
 * List files in a directory with pagination (offset, limit).
 * Returns { total, offset, limit, items: [{ name, path, size, createdAt }] }
 *
 * Note: This reads the directory into memory (file names). For extremely large directories
 * consider streaming approaches or maintaining an index in DB.
 */
export async function listFilesPaged(
  dirAbsolute: string,
  offset = 0,
  limit = 100
) {
  // validate directory exists
  const dirStat = await fs.stat(dirAbsolute);
  if (!dirStat.isDirectory()) throw new Error("Not a directory");

  const all = await fs.readdir(dirAbsolute);
  const total = all.length;
  const slice = all.slice(offset, offset + limit);
  const items = await Promise.all(
    slice.map(async (name) => {
      const full = path.join(dirAbsolute, name);
      const s = await fs.stat(full);
      return {
        name,
        path: full,
        size: s.size,
        createdAt: s.birthtime,
        isFile: s.isFile(),
      };
    })
  );

  return { total, offset, limit, items };
}

/**
 * Pretty bytes -> human string, e.g. 12345 -> "12.06 KB"
 */
export function humanFileSize(bytes: number, si = true, dp = 2) {
  const thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }
  const units = si
    ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  let u = -1;
  const r = 10 ** dp;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return (Math.round(bytes * r) / r).toFixed(dp) + " " + units[u];
}

/**
 * Ensure a directory exists and is writable. Throws if not writable.
 */
export async function ensureWritableDir(dir: string) {
  await ensureDir(dir);
  // Try writing a tiny temp file
  const testPath = path.join(dir, `.perm_test_${Date.now()}`);
  await fs.writeFile(testPath, "ok");
  await fs.unlink(testPath);
}

/**
 * Convert an absolute filesystem path into a public-style relative path
 * used by the app for URLs. Example:
 *  /var/media_store/downloads/media/books/123/... -> books/123/...
 *
 * - If finalRoot is an absolute root, this strips it and any leading separators.
 */
export function absToPublicPath(finalRoot: string, absolutePath: string) {
  const normalizedRoot = path.resolve(finalRoot);
  const normalizedPath = path.resolve(absolutePath);
  if (!normalizedPath.startsWith(normalizedRoot)) {
    throw new Error("Path is not under final root");
  }
  const rel = path.relative(normalizedRoot, normalizedPath);
  // Convert backslashes to forward slashes for URL compatibility
  return rel.split(path.sep).join("/");
}
