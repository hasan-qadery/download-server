// // src/services/storage.service.ts
// /**
//  * StorageService
//  *
//  * Responsibilities:
//  *  - Accept temp uploads (buffers / streams) and store them under a tempId directory.
//  *  - Provide listing of temp files and cleanup helpers.
//  *  - Commit temp files to final storage under a structured path.
//  *  - Provide listing, paging, metadata, delete and replace operations for final storage.
//  *  - Compute basic metadata (size, sha256). For images/videos/audio you can plug in a processor
//  *    (imageService/pdfService/videoService) that produces thumbnails, converts formats, returns width/height, etc.
//  *
//  * Public API:
//  *  - saveTempFiles(files: Express.Multer.File[]) -> { tempId, files[] }
//  *  - saveTempFileStream(stream, originalName, index?) -> { tempId, index, tempPath }
//  *  - getTempFiles(tempId)
//  *  - commitTempToFinal(tempId, targetBase, mappings, options) -> files metadata
//  *  - listFiles(relativeDir, offset, limit)
//  *  - getFileMetadata(relativePath)
//  *  - deletePath(relativePath)
//  *  - replaceFile(relativePath, fileBuffer, originalName)
//  *
//  * Important:
//  *  - All filesystem writes use safeJoin against the finalRoot() / tempDir() from config.
//  *  - Use writeFileAtomic for final writes to avoid partially-written files being served.
//  *  - This module intentionally does not perform heavy processing (image conversion, PDF extraction).
//  *    Instead it exposes hooks (processHook) so you can plug in image.service/pdf.service.
//  */

// import path from "path";
// import fs from "fs";
// import fsp from "fs/promises";
// import { v4 as uuidv4 } from "uuid";
// import { config, paths } from "../config";
// import {
//   ensureDir,
//   sanitizeFilename,
//   writeFileAtomic,
//   safeJoin,
//   computeSha256,
//   streamToBuffer,
//   padNumber,
//   statSafe,
//   absToPublicPath,
//   listFilesPaged,
// } from "../utils/fileUtils";
// import { logger } from "../logger";

// type TempFileRecord = {
//   index: number;
//   originalName: string;
//   mime: string;
//   size: number;
//   tempPath: string; // absolute on disk
// };

// type CommitMapping = {
//   tempIndex: number;
//   filename?: string; // final filename (e.g., "001.webp")
//   // optional metadata
//   page_number?: number;
//   is_cover?: boolean;
// };

// type CommitResultItem = {
//   filename: string;
//   storage_path: string; // posix relative path under finalRoot/media (e.g. books/123/chapters/1/pages/001.webp)
//   url: string;
//   mime?: string;
//   width?: number | null;
//   height?: number | null;
//   size_bytes: number;
//   sha256?: string | null;
//   // optional: metadata from processors
//   metadata?: any;
// };

// const TEMP_ROOT = () => paths.tempDir(); // absolute
// const FINAL_ROOT = () => paths.finalRoot(); // absolute

// export class StorageService {
//   // This hook can be assigned externally to perform media processing (image/webp, thumbnails, etc.)
//   // Example signature:
//   // imageProcessor(absoluteSrcPath, absoluteDestPath, options) => Promise< { mime, width, height, metadata } >
//   // pdfProcessor(tempPdfPath, extractToTempDir) => Promise<array of extracted image tempPaths>
//   public processHook?: (opts: {
//     srcAbsolutePath: string;
//     destAbsolutePath: string;
//     filename: string;
//     tempIndex?: number;
//     extra?: any;
//   }) => Promise<{
//     mime?: string;
//     width?: number | null;
//     height?: number | null;
//     metadata?: any;
//   } | null>;

//   constructor() {
//     // Ensure base dirs exist
//     try {
//       ensureDir(TEMP_ROOT());
//       ensureDir(FINAL_ROOT());
//     } catch (err) {
//       // ignore here; will create on demand
//     }
//   }

//   /**
//    * Save multiple multer files (in-memory) into a tempId directory.
//    * Returns: { tempId, files: TempFileRecord[] }
//    */
//   async saveTempFiles(multerFiles: Express.Multer.File[]) {
//     const tempId = uuidv4();
//     const tempDir = safeJoin(TEMP_ROOT(), tempId);
//     await ensureDir(tempDir);

//     const results: TempFileRecord[] = [];
//     await Promise.all(
//       multerFiles.map(async (f, idx) => {
//         const sanitized = sanitizeFilename(f.originalname || `file-${idx}`);
//         const tempPath = path.join(tempDir, String(idx));
//         // write to tmp then rename (atomic-ish)
//         await writeFileAtomic(tempPath, f.buffer);
//         results.push({
//           index: idx,
//           originalName: sanitized,
//           mime: f.mimetype,
//           size: f.size,
//           tempPath,
//         });
//       })
//     );

//     logger.info(`Saved ${results.length} temp files under ${tempId}`);
//     return { tempId, files: results };
//   }

//   /**
//    * Save a readable stream to a temp file (useful for streaming uploads).
//    * Returns { tempId, index, tempPath }
//    */
//   async saveTempFileStream(
//     stream: NodeJS.ReadableStream,
//     originalName: string,
//     tempId?: string,
//     index?: number
//   ) {
//     const tid = tempId || uuidv4();
//     const tempDir = safeJoin(TEMP_ROOT(), tid);
//     await ensureDir(tempDir);
//     const idx = typeof index === "number" ? index : Date.now(); // fallback index
//     const sanitized = sanitizeFilename(originalName || String(idx));
//     const tempPath = path.join(tempDir, String(idx));
//     // stream to tempPath
//     await pipelineStreamToFile(stream, tempPath);
//     const stat = await fsp.stat(tempPath);
//     return {
//       tempId: tid,
//       index: idx,
//       tempPath,
//       originalName: sanitized,
//       mime: "application/octet-stream",
//       size: stat.size,
//     } as TempFileRecord;
//   }

//   /**
//    * Return a temp files listing for a tempId
//    */
//   async getTempFiles(tempId: string): Promise<TempFileRecord[]> {
//     const tempDir = safeJoin(TEMP_ROOT(), tempId);
//     const exists = await pathExists(tempDir);
//     if (!exists) throw new Error("temp id not found");
//     const entries = await fsp.readdir(tempDir);
//     const files: TempFileRecord[] = await Promise.all(
//       entries.map(async (entry) => {
//         const full = path.join(tempDir, entry);
//         const stat = await fsp.stat(full);
//         return {
//           index: Number(entry),
//           originalName: entry,
//           mime: "application/octet-stream",
//           size: stat.size,
//           tempPath: full,
//         };
//       })
//     );
//     return files;
//   }

//   /**
//    * Commit temp files into the final location.
//    *
//    * - tempId: id returned by saveTempFiles
//    * - targetBase: posix-style relative path under finalRoot, e.g. "books/123-the-.../chapters/45/pages"
//    * - mappings: array of { tempIndex, filename } where filename is the desired final filename
//    *
//    * Returns array of CommitResultItem for each mapping in order.
//    *
//    * Behavior:
//    *  - For each mapping, copy (or move) the temp file to the final path (safeJoin).
//    *  - Uses writeFileAtomic to ensure atomic writes where possible.
//    *  - Computes size and sha256; optionally calls processHook for additional processing (image conversion).
//    *  - Removes the temp dir when done.
//    */
//   async commitTempToFinal(
//     tempId: string,
//     targetBase: string,
//     mappings: CommitMapping[],
//     options?: { visibility?: "pending" | "public"; failIfMissing?: boolean }
//   ): Promise<CommitResultItem[]> {
//     const tempDir = safeJoin(TEMP_ROOT(), tempId);
//     const tempExists = await pathExists(tempDir);
//     if (!tempExists) throw new Error("temp id not found");

//     // Ensure target base directory exists under final root
//     // finalRelativeBase is posix-like; convert to safe join
//     // We don't allow leading slashes.
//     const cleanedTargetBase = targetBase.replace(/^\/+/, "");
//     const finalBaseAbs = safeJoin(FINAL_ROOT(), cleanedTargetBase);
//     await ensureDir(finalBaseAbs);

//     const results: CommitResultItem[] = [];

//     for (const mapping of mappings) {
//       const tempPath = path.join(tempDir, String(mapping.tempIndex));
//       const tempExistsFile = await pathExists(tempPath);
//       if (!tempExistsFile) {
//         if (options?.failIfMissing) {
//           throw new Error(`temp file index ${mapping.tempIndex} missing`);
//         } else {
//           logger.warn(
//             `temp file index ${mapping.tempIndex} missing — skipping`
//           );
//           continue;
//         }
//       }

//       const filename = mapping.filename
//         ? sanitizeFilename(mapping.filename)
//         : sanitizeFilename(`file-${mapping.tempIndex}`);
//       // compute final absolute path
//       const finalAbs = safeJoin(finalBaseAbs, filename);
//       // perform a copy (preserve original temp file if needed) and atomically write
//       // We'll read temp and write via atomic writer to ensure safe final write
//       const buffer = await fsp.readFile(tempPath);

//       // Optionally: call processHook to transform (e.g., convert to webp).
//       let processResult: {
//         mime?: string;
//         width?: number | null;
//         height?: number | null;
//         metadata?: any;
//       } | null = null;
//       if (this.processHook) {
//         try {
//           // Write to a tmp destination and let the hook decide whether to replace or produce output
//           const tmpDest = `${finalAbs}.proc.tmp-${uuidv4()}`;
//           await ensureDir(path.dirname(tmpDest));
//           await fsp.writeFile(tmpDest, buffer);
//           // call hook
//           processResult = await this.processHook({
//             srcAbsolutePath: tempPath,
//             destAbsolutePath: tmpDest,
//             filename,
//             tempIndex: mapping.tempIndex,
//             extra: mapping,
//           });
//           // If hook wrote to tmpDest and expects it to be final, rename it below; otherwise hook might return metadata and not write
//           // For simplicity we will assume hook writes to tmpDest as final content when provided; otherwise fallback to buffer copy.
//           const tmpExists = await pathExists(tmpDest);
//           if (tmpExists) {
//             // move tmpDest -> finalAbs (atomic rename)
//             await writeFileAtomic(finalAbs, await fsp.readFile(tmpDest));
//             // remove tmpDest if exists
//             try {
//               await fsp.unlink(tmpDest);
//             } catch {
//               // ignore
//             }
//           } else {
//             // hook did not produce an output file: fall back to direct write
//             await writeFileAtomic(finalAbs, buffer);
//           }
//         } catch (err) {
//           logger.warn(
//             "processHook failed; falling back to raw copy: " + String(err)
//           );
//           await writeFileAtomic(finalAbs, buffer);
//         }
//       } else {
//         // No hook: write raw buffer
//         await writeFileAtomic(finalAbs, buffer);
//       }

//       // compute metadata
//       const stat = await fsp.stat(finalAbs);
//       // recompute sha from final file buffer after any processHook output
//       const finalBuffer = await fsp.readFile(finalAbs);
//       const sha = computeSha256(finalBuffer);
//       const publicPath = absToPublicPath(FINAL_ROOT(), finalAbs); // e.g. books/123/...
//       const url = paths.publicPathToUrl(publicPath);

//       results.push({
//         filename,
//         storage_path: publicPath,
//         url,
//         mime: processResult?.mime ?? "application/octet-stream",
//         width: processResult?.width ?? null,
//         height: processResult?.height ?? null,
//         size_bytes: stat.size,
//         sha256: sha,
//         metadata: processResult?.metadata ?? null,
//       });
//     }

//     // Cleanup temp dir after committing
//     await safeRm(tempDir);

//     logger.info(
//       `Committed ${results.length} files from temp ${tempId} to ${cleanedTargetBase}`
//     );
//     return results;
//   }

//   /**
//    * List files under a relative directory (posix-style path under finalRoot) with pagination
//    * Returns { total, offset, limit, items: [{ name, path (public), size, createdAt, isFile }] }
//    */
//   async listFiles(relativeDir: string, offset = 0, limit = 100) {
//     const cleaned = relativeDir.replace(/^\/+/, "");
//     const abs = safeJoin(FINAL_ROOT(), cleaned);
//     return listFilesPaged(abs, offset, limit).then((r) => {
//       // map absolute paths to public relative paths
//       const items = r.items.map((it: any) => {
//         const publicPath = absToPublicPath(FINAL_ROOT(), it.path);
//         return {
//           name: it.name,
//           path: publicPath,
//           size: it.size,
//           createdAt: it.createdAt,
//           isFile: it.isFile,
//           url: paths.publicPathToUrl(publicPath),
//         };
//       });
//       return { total: r.total, offset: r.offset, limit: r.limit, items };
//     });
//   }

//   /**
//    * Get metadata for a final file by relative path (posix-style relative under finalRoot)
//    */
//   async getFileMetadata(relativePath: string) {
//     const cleaned = relativePath.replace(/^\/+/, "");
//     const abs = safeJoin(FINAL_ROOT(), cleaned);
//     const exists = await pathExists(abs);
//     if (!exists) throw new Error("file not found");
//     const s = await fsp.stat(abs);
//     const buffer = await fsp.readFile(abs);
//     const sha = computeSha256(buffer);
//     return {
//       storage_path: cleaned,
//       url: paths.publicPathToUrl(cleaned),
//       size_bytes: s.size,
//       createdAt: s.birthtime,
//       modifiedAt: s.mtime,
//       sha256: sha,
//     };
//   }

//   /**
//    * Delete a file or directory (relative path under finalRoot)
//    * Returns true if removed (or ignored if not exists).
//    */
//   async deletePath(relativePath: string) {
//     const cleaned = relativePath.replace(/^\/+/, "");
//     const abs = safeJoin(FINAL_ROOT(), cleaned);
//     // Use recursive rm to delete both files and folders
//     await safeRm(abs);
//     logger.info(`Deleted path ${abs}`);
//     return true;
//   }

//   /**
//    * Replace a file at relativePath with a new buffer (atomic).
//    * Returns new metadata object similar to getFileMetadata.
//    */
//   async replaceFile(
//     relativePath: string,
//     fileBuffer: Buffer,
//     originalName?: string
//   ) {
//     const cleaned = relativePath.replace(/^\/+/, "");
//     const abs = safeJoin(FINAL_ROOT(), cleaned);
//     // ensure parent dir
//     await ensureDir(path.dirname(abs));
//     // atomic write
//     await writeFileAtomic(abs, fileBuffer);
//     const stat = await fsp.stat(abs);
//     const sha = computeSha256(fileBuffer);
//     logger.info(`Replaced file ${abs}`);
//     return {
//       storage_path: cleaned,
//       url: paths.publicPathToUrl(cleaned),
//       size_bytes: stat.size,
//       sha256: sha,
//     };
//   }
// }

// /* ======= Helper functions ======= */

// /**
//  * Path exists helper
//  */
// async function pathExists(p: string) {
//   try {
//     await fsp.access(p, fs.constants.F_OK);
//     return true;
//   } catch {
//     return false;
//   }
// }

// /**
//  * Remove a file or directory safely (recursive)
//  */
// async function safeRm(p: string) {
//   try {
//     // fs.rm is available on modern Node; use recursive true and force true
//     if ("rm" in fsp) {
//       // @ts-ignore - using rm if available
//       await (fsp as any).rm(p, { recursive: true, force: true });
//     } else {
//       // fallback
//       await fsp.rmdir(p, { recursive: true });
//     }
//   } catch (err) {
//     // ignore
//   }
// }

// /**
//  * Write stream to file using pipeline (returns when finished)
//  */
// async function pipelineStreamToFile(
//   stream: NodeJS.ReadableStream,
//   destPath: string
// ) {
//   await ensureDir(path.dirname(destPath));
//   const w = fs.createWriteStream(destPath);
//   // Promisify pipeline manually
//   await new Promise<void>((resolve, reject) => {
//     stream.pipe(w);
//     w.on("finish", () => resolve());
//     w.on("error", (err) => reject(err));
//     stream.on("error", (err) => reject(err));
//   });
// }

// /* Export a singleton for ease of use */
// export const storageService = new StorageService();
// export default storageService;
