// src/utils/storage.util.ts
import multer from "multer";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import crypto from "crypto";
import { Request } from "express";
import { StorageBucketEnum } from "../enums/storage/storage-bucket.enum";
// import { sanitizeFilename } from "../utils/fileUtils"; // reuse your helper (or use the impl below)

// Simple sanitize fallback if you don't import fileUtils
function _sanitizeFilenameFallback(name: string) {
  return name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-_.]/g, "_")
    .slice(0, 200);
}

/**
 * Generate a reasonably-unique filename:
 *  TIMESTAMP-RAND4-ORIGINAL (sanitized)
 */
const generateName = (originalName: string): string => {
  const base =
    //     sanitizeFilename
    //   ? sanitizeFilename(originalName):
    _sanitizeFilenameFallback(originalName) || "file";
  const rnd = crypto.randomBytes(3).toString("hex");
  return `${Date.now()}-${rnd}-${base}`;
};

/**
 * Resolve and ensure bucket root; always return an absolute path inside ./storage/
 * This prevents accidental path traversal by sanitizing and resolving paths.
 */
function bucketRoot(bucket: StorageBucketEnum) {
  const root = path.resolve(process.cwd(), "storage");
  const bucketPath = path.join(root, String(bucket));
  // create dir sync if not exists (safe at boot); mkdir in destination also handles it
  if (!fs.existsSync(bucketPath)) {
    try {
      fs.mkdirSync(bucketPath, { recursive: true, mode: 0o775 });
    } catch {
      // best-effort
    }
  }
  return bucketPath;
}

/**
 * Disk storage factory — writes into storage/<bucket>.
 * preserveName: if true, we use sanitized originalname (we still sanitize and avoid traversal)
 */
const makeDiskStorage = (bucket: StorageBucketEnum, preserveName = false) =>
  multer.diskStorage({
    destination: (req: Request, _file: Express.Multer.File, cb) => {
      try {
        const dest = bucketRoot(bucket);
        // Optionally, date-based subfolders can be used here:
        // const dateSub = new Date().toISOString().slice(0,10); // YYYY-MM-DD
        // const final = path.join(dest, dateSub);
        // fs.mkdirSync(final, { recursive: true });
        cb(null, dest);
      } catch (err) {
        cb(err as any, "");
      }
    },
    filename: (_req: Request, file: Express.Multer.File, cb) => {
      try {
        if (preserveName) {
          // Use sanitized original name to avoid path traversal or weird chars
          const safe =
            //   sanitizeFilename
            //     ? sanitizeFilename(file.originalname)
            //     :
            _sanitizeFilenameFallback(file.originalname);
          cb(null, safe);
        } else {
          cb(null, generateName(file.originalname));
        }
      } catch (err) {
        cb(err as any, generateName(file.originalname));
      }
    },
  });

/**
 * Centralized allowed-extensions / mime prefixes per bucket (one place to edit)
 * This is only a shallow filter — use file-signature validation middleware after upload.
 */
const BUCKET_RULES: Record<string, { exts: RegExp; description: string }> = {
  [StorageBucketEnum.CHATS]: {
    exts: /\.(jpe?g|png|gif|webp)$/i,
    description: "images",
  },
  [StorageBucketEnum.DOCUMENTS]: {
    exts: /\.(pdf|docx?|txt|xlsx?|json)$/i,
    description: "documents",
  },
  [StorageBucketEnum.APP_ASSETS]: {
    exts: /\.(jpe?g|png|gif|mp4|mov|avi|svg|json|pdf|webp)$/i,
    description: "assets",
  },
  [StorageBucketEnum.AVATARS]: {
    exts: /\.(jpe?g|png|gif)$/i,
    description: "avatars",
  },
  [StorageBucketEnum.OTHERS]: { exts: /./i, description: "any" },
};

/**
 * Factory for basic fileFilter: quick extension check to reject obviously wrong uploads early.
 * NOTE: This doesn't replace signature validation which should run AFTER multer (validateUpload middleware).
 */
const makeFileFilter = (bucket: StorageBucketEnum) => {
  const rule = BUCKET_RULES[bucket];
  return (
    req: any,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    if (!rule) {
      req.fileValidationError = `Invalid file type`;
      return cb(null, false);
    }
    // Quick check by original name extension
    if (!rule.exts.test(file.originalname)) {
      // Attach a localized error or message to request for controller to read
      req.fileValidationError = `Only ${
        rule.description
      } are allowed for ${String(bucket)}`;
      return cb(null, false);
    }
    // Optionally, also check mime type header (not authoritative)
    // e.g. if bucket is images and file.mimetype.startsWith('image/') -> ok
    return cb(null, true);
  };
};

/**
 * Expose ready-to-use multer instances. Limits are configurable via env vars
 * (fallback to your previous hard-coded values if env not present).
 */
function bytesFromEnv(key: string, fallback: number) {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class StorageUtil {
  static uploadImage = multer({
    storage: makeDiskStorage(StorageBucketEnum.CHATS, false),
    limits: {
      fileSize: bytesFromEnv("MAX_IMAGE_BYTES", 10 * 1024 * 1024),
      files: Number(process.env.MAX_IMAGE_FILES || 50),
    },
    fileFilter: makeFileFilter(StorageBucketEnum.CHATS),
  });

  static uploadDocument = multer({
    storage: makeDiskStorage(StorageBucketEnum.DOCUMENTS, true),
    limits: {
      fileSize: bytesFromEnv("MAX_DOCUMENT_BYTES", 20 * 1024 * 1024),
      files: Number(process.env.MAX_DOCUMENT_FILES || 10),
    },
    fileFilter: makeFileFilter(StorageBucketEnum.DOCUMENTS),
  });

  static uploadVideo = multer({
    storage: makeDiskStorage(StorageBucketEnum.APP_ASSETS, true),
    limits: {
      fileSize: bytesFromEnv("MAX_VIDEO_BYTES", 150 * 1024 * 1024),
      files: Number(process.env.MAX_VIDEO_FILES || 5),
    },
    fileFilter: makeFileFilter(StorageBucketEnum.APP_ASSETS),
  });

  static uploadOther = multer({
    storage: makeDiskStorage(StorageBucketEnum.OTHERS, true),
    limits: {
      fileSize: bytesFromEnv("MAX_OTHER_BYTES", 15 * 1024 * 1024),
      files: Number(process.env.MAX_OTHER_FILES || 20),
    },
    fileFilter: makeFileFilter(StorageBucketEnum.OTHERS),
  });

  static uploadAvatar = multer({
    storage: makeDiskStorage(StorageBucketEnum.AVATARS, false),
    limits: {
      fileSize: bytesFromEnv("MAX_AVATAR_BYTES", 5 * 1024 * 1024),
      files: Number(process.env.MAX_AVATAR_FILES || 1),
    },
    fileFilter: makeFileFilter(StorageBucketEnum.AVATARS),
  });

  static uploadAppAsset = multer({
    storage: makeDiskStorage(StorageBucketEnum.APP_ASSETS, true),
    limits: {
      fileSize: bytesFromEnv("MAX_APP_ASSET_BYTES", 150 * 1024 * 1024),
      files: Number(process.env.MAX_APP_ASSET_FILES || 10),
    },
    fileFilter: makeFileFilter(StorageBucketEnum.APP_ASSETS),
  });
}
