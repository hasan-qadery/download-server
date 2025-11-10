// src/middleware/validateAndDispatchPure.ts
import { Request, Response, NextFunction } from "express";
import { fileTypeFromBuffer, fileTypeFromFile } from "file-type";
import Jimp from "jimp";
import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { promisify } from "util";
import { execFile as execFileCb } from "child_process";
const execFile = promisify(execFileCb);

// Try optional ffprobe-static & fluent-ffmpeg
let ffprobeStaticPath: string | null = null;
try {
  ffprobeStaticPath = require("ffprobe-static").path;
} catch {
  ffprobeStaticPath = null;
}
let ffmpegProbeAvailable = false;
try {
  require("fluent-ffmpeg");
  ffmpegProbeAvailable = true;
} catch {
  ffmpegProbeAvailable = false;
}

/**
 * Configuration: tune these via env if you like
 */
const RULES = {
  image: {
    maxBytes: Number(process.env.MAX_IMAGE_BYTES || 10 * 1024 * 1024),
    maxWidth: Number(process.env.MAX_IMAGE_WIDTH || 8000),
    maxHeight: Number(process.env.MAX_IMAGE_HEIGHT || 10000),
    maxFiles: Number(process.env.MAX_IMAGE_FILES || 100),
  },
  document: {
    maxBytes: Number(process.env.MAX_DOCUMENT_BYTES || 200 * 1024 * 1024),
    maxPages: Number(process.env.MAX_DOCUMENT_PAGES || 200),
    maxFiles: Number(process.env.MAX_DOCUMENT_FILES || 10),
  },
  audio: {
    maxBytes: Number(process.env.MAX_AUDIO_BYTES || 50 * 1024 * 1024),
    maxDuration: Number(process.env.MAX_AUDIO_DURATION || 600), // seconds, fallback if probe available
    maxFiles: Number(process.env.MAX_AUDIO_FILES || 20),
  },
  video: {
    maxBytes: Number(process.env.MAX_VIDEO_BYTES || 500 * 1024 * 1024),
    maxDuration: Number(process.env.MAX_VIDEO_DURATION || 1800),
    maxWidth: Number(process.env.MAX_VIDEO_WIDTH || 3840),
    maxHeight: Number(process.env.MAX_VIDEO_HEIGHT || 2160),
    maxFiles: Number(process.env.MAX_VIDEO_FILES || 10),
  },
  general: {
    maxTotalFiles: Number(process.env.MAX_TOTAL_FILES || 200),
  },
};

/* ================= helpers ================= */

async function detectFileType(file: Express.Multer.File) {
  try {
    if (file.buffer) {
      const r = await fileTypeFromBuffer(file.buffer);
      return r ? { mime: r.mime, ext: r.ext } : null;
    }
    if ((file as any).path) {
      const r = await fileTypeFromFile((file as any).path);
      return r ? { mime: r.mime, ext: r.ext } : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function probeWithFfprobe(filePath: string) {
  // try ffprobe-static first
  if (ffprobeStaticPath) {
    try {
      const { stdout } = await execFile(
        ffprobeStaticPath,
        [
          "-v",
          "quiet",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          filePath,
        ],
        { timeout: 120000 }
      );
      return JSON.parse(stdout);
    } catch {
      // fallthrough
    }
  }
  // try fluent-ffmpeg.ffprobe if available
  if (ffmpegProbeAvailable) {
    try {
      const ffmpeg = require("fluent-ffmpeg");
      return await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err: any, info: any) =>
          err ? reject(err) : resolve(info)
        );
      });
    } catch {
      // fallthrough
    }
  }
  return null;
}

async function deleteIfOnDisk(file: Express.Multer.File) {
  const p = (file as any).path;
  if (p) {
    try {
      await fs.unlink(p);
    } catch {
      /* ignore */
    }
  }
}

/* ================= per-type validators ================= */

async function validateImage(file: Express.Multer.File) {
  const rule = RULES.image;
  if (rule.maxBytes && file.size > rule.maxBytes)
    return { ok: false, reason: `file too large (${file.size})` };

  try {
    const image = file.buffer
      ? await Jimp.read(file.buffer)
      : await Jimp.read((file as any).path);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    if (rule.maxWidth && w > rule.maxWidth)
      return { ok: false, reason: `width ${w} > ${rule.maxWidth}` };
    if (rule.maxHeight && h > rule.maxHeight)
      return { ok: false, reason: `height ${h} > ${rule.maxHeight}` };
    return { ok: true, meta: { width: w, height: h } };
  } catch (err: any) {
    return {
      ok: false,
      reason: `image metadata failed: ${String(err?.message || err)}`,
    };
  }
}

async function validateDocument(file: Express.Multer.File) {
  const rule = RULES.document;
  if (rule.maxBytes && file.size > rule.maxBytes)
    return { ok: false, reason: `document too large (${file.size})` };

  // Must be PDF (we detect mime earlier)
  try {
    const buf = file.buffer
      ? file.buffer
      : await fs.readFile((file as any).path);
    const pdf = await PDFDocument.load(buf);
    const pages = pdf.getPageCount();
    if (rule.maxPages && pages > rule.maxPages)
      return { ok: false, reason: `too many pages (${pages})` };
    return { ok: true, meta: { pages } };
  } catch (err: any) {
    return {
      ok: false,
      reason: `pdf parse failed: ${String(err?.message || err)}`,
    };
  }
}

async function validateAudioVideo(
  file: Express.Multer.File,
  kind: "audio" | "video"
) {
  const rule = RULES[kind];
  if (rule.maxBytes && file.size > rule.maxBytes)
    return { ok: false, reason: `file too large (${file.size})` };

  // If probe available, attempt to validate duration/resolution
  const filePath = (file as any).path;
  let wroteTemp = false;
  let tempPath: string | undefined = filePath;
  try {
    if (!filePath && file.buffer) {
      // write small temp file for probing
      const tmpDir = path.join(process.cwd(), "data", "tmp");
      await fs.mkdir(tmpDir, { recursive: true });
      tempPath = path.join(
        tmpDir,
        `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      await fs.writeFile(tempPath, file.buffer);
      wroteTemp = true;
    }
    if (tempPath) {
      const meta = await probeWithFfprobe(tempPath);
      if (meta && meta.format) {
        const duration = meta.format.duration
          ? Number(meta.format.duration)
          : null;
        if (rule.maxDuration && duration && duration > rule.maxDuration)
          return {
            ok: false,
            reason: `duration ${duration}s > ${rule.maxDuration}s`,
          };
        if (kind === "video") {
          const v = (meta.streams || []).find(
            (s: any) => s.codec_type === "video"
          );
          const w = v?.width ?? null;
          const h = v?.height ?? null;
          if (rule.maxWidth && w && w > rule.maxWidth)
            return { ok: false, reason: `width ${w} > ${rule.maxWidth}` };
          if (rule.maxHeight && h && h > rule.maxHeight)
            return { ok: false, reason: `height ${h} > ${rule.maxHeight}` };
          return { ok: true, meta };
        }
        return { ok: true, meta };
      }
    }
  } catch {
    // ignore probe errors and fallback to light checks below
  } finally {
    if (wroteTemp && tempPath) {
      try {
        await fs.unlink(tempPath);
      } catch {
        /* ignore */
      }
    }
  }

  // fallback: accept based on mime prefix only (can't check duration/resolution)
  return { ok: true, meta: null };
}

/* ================= main middleware ================= */

function normalizeFiles(req: Request): Express.Multer.File[] {
  const f = req.files as any;
  if (!f) return [];
  if (Array.isArray(f)) return f as Express.Multer.File[];
  // multer may produce an object when using fields(): { fieldname: [file,...] }
  const arr: Express.Multer.File[] = [];
  for (const val of Object.values(f)) {
    if (Array.isArray(val)) arr.push(...val);
    else if (val) arr.push(val as Express.Multer.File);
  }
  return arr;
}

/**
 * validateAndDispatchPure
 * - runs after multer
 * - attaches req.validatedFiles = [{ index, originalname, size, mime, ext, type, meta, path? }]
 */
export async function validateAndDispatchPure(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const files = normalizeFiles(req);
    if (!files.length)
      return res.status(400).json({ error: "no files uploaded" });

    // enforce general total files limit
    if (
      RULES.general.maxTotalFiles &&
      files.length > RULES.general.maxTotalFiles
    ) {
      return res
        .status(400)
        .json({
          error: `too many files in request (max ${RULES.general.maxTotalFiles})`,
        });
    }

    // If client pre-declares media_type enforce it (optional)
    const requestedType =
      (req.body?.media_type || req.query?.type || "").toLowerCase() || null;

    const errors: { index: number; reason: string }[] = [];
    const validated: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Base size check (multer may have enforced)
      if (file.size == null || typeof file.size !== "number") {
        // attempt to stat if on disk
        if ((file as any).path) {
          try {
            const st = await fs.stat((file as any).path);
            file.size = st.size;
          } catch {
            /* ignore */
          }
        }
      }

      // detect signature
      const dt = await detectFileType(file);
      const mime = dt?.mime ?? file.mimetype ?? "application/octet-stream";
      const ext =
        dt?.ext ??
        ((file.originalname || "").split(".").pop() || "").toLowerCase();

      // decide kind
      let kind: "image" | "video" | "audio" | "document" | "unknown" =
        "unknown";
      if (mime.startsWith("image/")) kind = "image";
      else if (mime.startsWith("video/")) kind = "video";
      else if (mime.startsWith("audio/")) kind = "audio";
      else if (mime === "application/pdf") kind = "document";
      else {
        // fallback heuristic by extension
        if (
          ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"].includes(
            ext
          )
        )
          kind = "image";
        else if (["mp4", "mkv", "mov", "avi", "webm"].includes(ext))
          kind = "video";
        else if (["mp3", "wav", "ogg", "m4a"].includes(ext)) kind = "audio";
        else if (ext === "pdf") kind = "document";
      }

      // If client requested a specific media_type (and not 'mixed') enforce it
      if (
        requestedType &&
        requestedType !== "mixed" &&
        requestedType !== kind
      ) {
        errors.push({
          index: i,
          reason: `expected ${requestedType} but detected ${kind}`,
        });
        // delete file on disk if stored
        await deleteIfOnDisk(file);
        continue;
      }

      // dispatch to validator
      let outcome;
      if (kind === "image") outcome = await validateImage(file);
      else if (kind === "document") outcome = await validateDocument(file);
      else if (kind === "audio")
        outcome = await validateAudioVideo(file, "audio");
      else if (kind === "video")
        outcome = await validateAudioVideo(file, "video");
      else {
        outcome = { ok: false, reason: "unsupported file type" };
      }

      if (!outcome.ok) {
        errors.push({
          index: i,
          reason: outcome.reason || "validation failed",
        });
        await deleteIfOnDisk(file);
        continue;
      }

      validated.push({
        index: i,
        originalname: file.originalname,
        size: file.size,
        mime,
        ext,
        type: kind,
        meta: outcome.meta ?? null,
        path: (file as any).path || null,
      });
    } // end loop

    if (errors.length) {
      return res
        .status(400)
        .json({ error: "validation_failed", details: errors });
    }

    // success
    (req as any).validatedFiles = validated;
    (req as any).media_types = Array.from(
      new Set(validated.map((v: any) => v.type))
    );
    return next();
  } catch (err: any) {
    console.error("validateAndDispatchPure error:", err);
    return res
      .status(500)
      .json({ error: "validation_error", message: String(err.message || err) });
  }
}
