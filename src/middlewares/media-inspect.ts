// uploadInspect.ts
import { Request, Response, NextFunction } from "express";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { fileTypeFromFile, FileTypeResult } from "file-type";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import { parseFile as parseAudioFile } from "music-metadata";
import { v4 as uuidv4 } from "uuid";

ffmpeg.setFfprobePath(ffprobeStatic.path);

// --- Types attached to req ---
export type MediaKind = "image" | "video" | "audio" | "other";

export interface MediaInfo {
  fieldname: string;
  originalName: string;
  tempPath: string;
  size: number; // bytes
  mime: string | null;
  ext: string | null;
  kind: MediaKind;
  format?: string | null; // codec / container / image format (jpeg, png, mp4, etc)
  width?: number | null;
  height?: number | null;
  duration?: number | null; // seconds (audio/video)
  sampleRate?: number | null; // audio
  channels?: number | null; // audio
  bitrate?: number | null; // bits per second (if available)
  raw?: any; // optional raw metadata from libraries
}

// Extend Express Request to carry mediaInfo and cleanup helper
declare global {
  namespace Express {
    interface Request {
      mediaInfo?: MediaInfo;
      cleanupUploadedFile?: () => Promise<void>;
    }
  }
}

// --- Multer disk storage to OS temp dir ---
const tmpDir = os.tmpdir();
const storage = multer.diskStorage({
  destination: (_req:any, _file:any, cb:any) => cb(null, tmpDir),
  filename: (_req:any, file:any, cb:any) => {
    const unique = `${Date.now()}-${uuidv4()}`;
    // preserve extension if possible
    const ext = path.extname(file.originalname) || "";
    cb(null, `${unique}${ext}`);
  },
});
const uploadSingle = (fieldName: string) =>
  multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }).single(
    fieldName
  ); // 500MB limit, adjust

// --- Helper: classify kind by mime ---
function classifyKind(mime: string | null): MediaKind {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

// --- The combined middleware factory ---
export function uploadAndInspect(fieldName = "file") {
  // returns an express middleware (async)
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. run multer to save file to temp dir
    uploadSingle(fieldName)(req as any, res as any, async (err: any) => {
      if (err) return next(err);

      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const tempPath = file.path as string;
      const originalName = file.originalname;
      const size = file.size;

      try {
        // 2. detect mime & ext via magic bytes where possible
        let ft: FileTypeResult | undefined;
        try {
          ft = await fileTypeFromFile(tempPath); // uses magic bytes
        } catch (e) {
          ft = undefined;
        }
        const mime = ft?.mime ?? file.mimetype ?? null;
        const ext =
          ft?.ext ?? (path.extname(originalName).replace(".", "") || null);

        // 3. classify
        const kind = classifyKind(mime);

        const mediaInfo: MediaInfo = {
          fieldname: file.fieldname,
          originalName,
          tempPath,
          size,
          mime,
          ext,
          kind,
        };

        // 4. extract type-specific metadata
        if (kind === "image") {
          try {
            const meta = await sharp(tempPath).metadata();
            mediaInfo.format = meta.format ?? mediaInfo.format ?? null;
            mediaInfo.width = meta.width ?? null;
            mediaInfo.height = meta.height ?? null;
            mediaInfo.raw = meta;
          } catch (e) {
            // ignore image parse errors but keep basic info
            mediaInfo.raw = { imageError: (e as Error).message };
          }
        } else if (kind === "audio") {
          try {
            const mm = await parseAudioFile(tempPath);
            mediaInfo.duration = mm.format.duration ?? null;
            mediaInfo.format =
              mm.format.container ??
              mm.format.codec ??
              mediaInfo.format ??
              null;
            mediaInfo.sampleRate = mm.format.sampleRate ?? null;
            mediaInfo.channels = mm.format.numberOfChannels ?? null;
            // bitrate may be available in common or format
            mediaInfo.bitrate = (mm.format.bitrate ?? null) as number | null;
            mediaInfo.raw = mm;
          } catch (e) {
            mediaInfo.raw = { audioError: (e as Error).message };
          }
        } else if (kind === "video") {
          try {
            const ffprobeResult: any = await new Promise((resolve, reject) => {
              ffmpeg.ffprobe(tempPath, (err: any, data: any) => {
                if (err) return reject(err);
                resolve(data);
              });
            });

            // parse streams
            const videoStream = (ffprobeResult.streams || []).find(
              (s: any) => s.codec_type === "video"
            );
            const audioStream = (ffprobeResult.streams || []).find(
              (s: any) => s.codec_type === "audio"
            );

            mediaInfo.duration = ffprobeResult.format?.duration
              ? Number(ffprobeResult.format.duration)
              : null;
            mediaInfo.format =
              ffprobeResult.format?.format_name ?? mediaInfo.format ?? null;

            if (videoStream) {
              mediaInfo.width = videoStream.width ?? null;
              mediaInfo.height = videoStream.height ?? null;
            }
            if (audioStream) {
              mediaInfo.sampleRate = audioStream.sample_rate
                ? Number(audioStream.sample_rate)
                : mediaInfo.sampleRate ?? null;
              mediaInfo.channels = audioStream.channels ?? null;
            }
            // bitrate (overall)
            mediaInfo.bitrate = ffprobeResult.format?.bit_rate
              ? Number(ffprobeResult.format.bit_rate)
              : null;

            mediaInfo.raw = ffprobeResult;
          } catch (e) {
            mediaInfo.raw = { ffprobeError: (e as Error).message };
          }
        } else {
          // other: we still have mime/ext/size
        }

        // attach to req and provide cleanup helper
        req.mediaInfo = mediaInfo;
        req.cleanupUploadedFile = async () => {
          try {
            await fs.unlink(tempPath);
          } catch {
            /* ignore */
          }
        };

        return next();
      } catch (e) {
        // on error, try to remove temp file then forward error
        try {
          await fs.unlink(tempPath);
        } catch {
          /* ignore */
        }
        return next(e);
      }
    });
  };
}
