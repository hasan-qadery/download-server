// // src/services/image.service.ts
// /**
//  * Pure-JS image processor using Jimp.
//  *
//  * - Converts input image (any supported by Jimp) to an output image format (default: png).
//  * - Optionally produces a thumbnail.
//  * - Returns metadata: { mime, width, height, engine }
//  *
//  * Limitations:
//  * - Jimp is pure JS and slower than sharp.
//  * - WebP support in Jimp may be limited on some platforms; by default this module writes PNG.
//  *   If you want WebP and have `sharp` available, prefer the sharp-based pipeline for production.
//  *
//  * Usage:
//  *  await processImage({
//  *    srcAbsolutePath: '/tmp/123/0',
//  *    destAbsolutePath: '/media/books/1/chapters/1/pages/001.png',
//  *    thumbnailPath: '/media/books/.../001.thumb.png',
//  *    maxWidth: 2000,
//  *    quality: 80, // approximate (Jimp quality influences jpeg/webp)
//  *    outFormat: 'png' // 'png'|'jpeg'|'webp' (webp may be not ideal with Jimp)
//  *  });
//  */

// import Jimp from "jimp";
// import fs from "fs/promises";
// import path from "path";
// import { logger } from "../logger";

// export type ImageProcessOpts = {
//   srcAbsolutePath: string;
//   destAbsolutePath: string;
//   thumbnailPath?: string;
//   filename?: string;
//   quality?: number; // 0-100 (affects JPEG/WebP quality)
//   maxWidth?: number | null;
//   maxHeight?: number | null;
//   outFormat?: "png" | "jpeg" | "webp";
// };

// export async function processImage(opts: ImageProcessOpts): Promise<{
//   mime: string;
//   width: number | null;
//   height: number | null;
//   metadata?: any;
//   engine: "jimp";
// }> {
//   const {
//     srcAbsolutePath,
//     destAbsolutePath,
//     thumbnailPath,
//     quality = 80,
//     maxWidth,
//     maxHeight,
//     outFormat = "png",
//   } = opts;

//   // Ensure parent dir exists
//   await fs.mkdir(path.dirname(destAbsolutePath), { recursive: true });

//   let image: Jimp;
//   try {
//     image = await Jimp.read(srcAbsolutePath);
//   } catch (err) {
//     logger.warn(`Jimp.read failed for ${srcAbsolutePath}: ${String(err)}`);
//     // rethrow to let caller fallback
//     throw err;
//   }

//   // Resize preserving aspect ratio if requested
//   if (maxWidth || maxHeight) {
//     const w = maxWidth ?? Jimp.AUTO;
//     const h = maxHeight ?? Jimp.AUTO;
//     image = image.scaleToFit(w === Jimp.AUTO ? image.bitmap.width : w, h === Jimp.AUTO ? image.bitmap.height : h);
//   }

//   // Jimp quality applies mostly to JPEG/WebP
//   if (outFormat === "jpeg") image.quality(Math.max(0, Math.min(100, quality)));

//   // Write final image. Jimp uses mime constants:
//   let mimeOut = Jimp.MIME_PNG;
//   if (outFormat === "jpeg") mimeOut = Jimp.MIME_JPEG;
//   else if (outFormat === "webp") {
//     // Jimp supports WEBP if the environment supports it (it uses @jimp/plugin-webp)
//     // behavior may vary; if writing webp throws, let the caller catch it.
//     // We still attempt it because many platforms work.
//     // Set mimeOut as webp mime type manually.
//     // @ts-ignore - internal constant may not exist, so set string
//     mimeOut = "image/webp";
//   }

//   // Save dest
//   try {
//     await image.writeAsync(destAbsolutePath);
//   } catch (err) {
//     logger.warn(`Jimp.writeAsync failed for ${destAbsolutePath}: ${String(err)}`);
//     throw err;
//   }

//   // Thumbnail (if requested)
//   if (thumbnailPath) {
//     try {
//       const thumb = image.clone();
//       const thumbWidth = 400;
//       thumb.scaleToFit(thumbWidth, Jimp.AUTO);
//       await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
//       await thumb.writeAsync(thumbnailPath);
//     } catch (err) {
//       logger.warn(`Thumbnail generation failed: ${String(err)}`);
//       // continue without failing the whole operation
//     }
//   }

//   const finalMeta = { width: image.bitmap.width, height: image.bitmap.height };
//   return {
//     mime: mimeOut,
//     width: finalMeta.width,
//     height: finalMeta.height,
//     metadata: finalMeta,
//     engine: "jimp",
//   };
// }

// export default { processImage };
