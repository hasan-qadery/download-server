// src/services/mediaProbe.ts
/**
 * mediaProbe - attempt to return audio/video metadata in pure-JS-friendly way.
 *
 * - Tries ffprobe-static (bundled binary) first.
 * - Falls back to fluent-ffmpeg if available (requires ffmpeg/ffprobe binary in PATH or ffmpeg-static).
 * - If both are not available, returns minimal file stats (size).
 *
 * This wrapper avoids building native modules; ffmpeg-static provides prebuilt ffmpeg binaries.
 */

import { promisify } from "util";
import { execFile as execFileCb } from "child_process";
import fs from "fs/promises";
const execFile = promisify(execFileCb);

let ffprobeStaticPath: string | null = null;
try {
  ffprobeStaticPath = require("ffprobe-static").path;
} catch {
  ffprobeStaticPath = null;
}

export async function probeMedia(filePath: string) {
  // try ffprobe-static
  if (ffprobeStaticPath) {
    try {
      const { stdout } = await execFile(ffprobeStaticPath, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ]);
      return JSON.parse(stdout);
    } catch (e) {
      // fallthrough to fluent-ffmpeg
    }
  }

  // try fluent-ffmpeg if available
  try {
    const ffmpeg = require("fluent-ffmpeg");
    return await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, meta: any) => {
        if (err) return reject(err);
        resolve(meta);
      });
    });
  } catch {
    // fallback
  }

  // fallback: return file stats only
  try {
    const s = await fs.stat(filePath);
    return { format: { filename: filePath, size: s.size }, streams: [] };
  } catch (err) {
    return { format: { filename: filePath }, streams: [] };
  }
}

export default { probeMedia };
