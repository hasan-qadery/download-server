// src/services/image.service.ts
/**
 * image.service.ts
 *
 * - Converts an image file (any input format) to webp using sharp.
 * - Generates a thumbnail variant.
 * - Returns metadata { mime, width, height, metadata }.
 *
 * Usage:
 *   await imageService.processImage({
 *     srcAbsolutePath: '/abs/temp/123/0',
 *     destAbsolutePath: '/abs/media/books/.../001.webp',
 *     thumbnailPath: '/abs/media/books/.../001.thumb.webp',
 *     quality: 80
 *   });
 *
 * Notes:
 *  - Requires `sharp` installed (already in scaffold).
 *  - If destination already exists it will be overwritten.
 */

import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { logger } from "../logger";

export type ImageProcessOpts = {
  srcAbsolutePath: string;
  destAbsolutePath: string;
  thumbnailPath?: string; // optional path for thumb; if omitted no thumb generated
  filename?: string;
  quality?: number; // 0-100
  maxWidth?: number | null; // optional resize
  maxHeight?: number | null;
};

export async function processImage(opts: ImageProcessOpts): Promise<{
  mime: string;
  width: number | null;
  height: number | null;
  metadata?: any;
}> {
  const { srcAbsolutePath, destAbsolutePath, thumbnailPath, quality = 80, maxWidth, maxHeight } = opts;

  // Read input into sharp pipeline
  const img = sharp(srcAbsolutePath, { failOnError: false });

  // Optionally resize preserving aspect ratio
  if (maxWidth || maxHeight) {
    img.resize(maxWidth || undefined, maxHeight || undefined, { fit: "inside" });
  }

  // Convert to webp
  await img.webp({ quality }).toFile(destAbsolutePath);

  // Read metadata of the final file to report accurate dimensions
  const finalMeta = await sharp(destAbsolutePath).metadata();
  const mime = `image/webp`;
  const width = finalMeta.width ?? null;
  const height = finalMeta.height ?? null;

  // Generate thumbnail if requested
  if (thumbnailPath) {
    try {
      const thumbWidth = 400; // default thumb width — you can make this configurable
      // create thumbnail from the just-created webp to preserve final look
      await sharp(destAbsolutePath).resize(thumbWidth).webp({ quality: Math.max(40, Math.floor(quality / 2)) }).toFile(thumbnailPath);
    } catch (err) {
      logger.warn("Thumbnail generation failed: " + String(err));
    }
  }

  return { mime, width, height, metadata: finalMeta };
}

export default { processImage };
