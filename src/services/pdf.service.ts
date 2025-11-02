// src/services/pdf.service.ts
/**
 * pdf.service.ts
 *
 * - Extracts pages from a PDF file using the external `pdftoppm` command (part of Poppler).
 * - Writes PNG images named as indices into the same temp folder so the rest of your pipeline
 *   (storageService.commitTempToFinal) can treat them as normal temp files.
 *
 * Requirements:
 *  - `pdftoppm` must be available in the runtime (install `poppler-utils` in Alpine/Debian).
 *    Example (Alpine): `apk add --no-cache poppler-utils`
 *    Example (Debian): `apt-get update && apt-get install -y poppler-utils`
 *
 * Behavior:
 *  - Input: absolute path to PDF temp file (e.g. data/temp/<tempId>/0)
 *  - Output: writes files into the same temp folder named "0", "1", "2", ...
 *    (If existing files exist they will be overwritten.)
 *  - Returns: array of created temp file indexes and their filenames.
 *
 * Usage example:
 *   const result = await pdfService.extractPdfToTemp(tempFileAbsPath, tempFolderAbs);
 *   // result.pages -> [ { index: 0, path: '/abs/temp/123/0' }, ... ]
 */

import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";

const execFileAsync = promisify(execFile);

export type PdfExtractResult = Array<{ index: number; path: string; filename: string }>;

async function pdftoppmAvailable(): Promise<boolean> {
  try {
    await execFileAsync("pdftoppm", ["-v"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract PDF pages into PNG images inside `outputDir`.
 * - pdfPath: absolute path to PDF
 * - outputDir: absolute directory where outputs will be placed
 * - outputPrefix: basename prefix for outputs (we'll read them and re-name to indices)
 *
 * Returns pages as array of { index, path, filename }.
 */
export async function extractPdfPagesToDir(pdfPath: string, outputDir: string, outputPrefix = "page"): Promise<PdfExtractResult> {
  const available = await pdftoppmAvailable();
  if (!available) {
    throw new Error("pdftoppm is not available in the container. Install poppler-utils (apk/apt: poppler-utils).");
  }

  // Ensure output dir exists
  await fs.mkdir(outputDir, { recursive: true });

  // We'll call:
  //   pdftoppm -png -r 150 input.pdf outputPrefix
  // This produces files like outputPrefix-1.png, outputPrefix-2.png, ...
  const args = ["-png", "-r", "150", pdfPath, path.join(outputDir, outputPrefix)];
  try {
    await execFileAsync("pdftoppm", args, { timeout: 1000 * 60 * 5 }); // 5 min timeout
  } catch (err: any) {
    // pdftoppm returns non-zero code sometimes; capture stderr if available
    logger.error("pdftoppm failed: " + String(err?.stderr || err?.message || err));
    throw new Error("PDF extraction failed: " + String(err?.stderr || err?.message || err));
  }

  // Now read directory for files named prefix-1.png, prefix-2.png, ...
  const files = await fs.readdir(outputDir);
  // Filter those matching prefix-*.png
  const pngs = files.filter((f) => f.startsWith(outputPrefix + "-") && f.endsWith(".png"));
  // Sort by page number
  pngs.sort((a, b) => {
    const aNum = Number(a.slice(outputPrefix.length + 1, -4));
    const bNum = Number(b.slice(outputPrefix.length + 1, -4));
    return aNum - bNum;
  });

  const results: PdfExtractResult = [];
  // For each png, rename/move it into an index-only filename inside outputDir: 0, 1, 2, ...
  for (let i = 0; i < pngs.length; i++) {
    const png = pngs[i];
    const oldPath = path.join(outputDir, png);
    const newFilename = String(i);
    const newPath = path.join(outputDir, newFilename);
    // Move/rename over
    await fs.rename(oldPath, newPath);
    results.push({ index: i, path: newPath, filename: newFilename });
  }

  return results;
}

/**
 * Convenience wrapper: given a tempId dir and a tempIndex for the PDF file inside it,
 * extract pages into the same temp dir and return the created indices.
 */
export async function extractPdfFromTemp(tempDir: string, tempIndex: number): Promise<PdfExtractResult> {
  const pdfPath = path.join(tempDir, String(tempIndex));
  // Simple sanity check
  await fs.access(pdfPath);
  // Extract to a subdir under temp (pdftoppm creates many files); we can extract into tempDir directly
  // but to avoid naming collisions, use a working subdir
  const workDir = path.join(tempDir, `pdf_extract_${Date.now()}`);
  const pages = await extractPdfPagesToDir(pdfPath, workDir, "p");
  // Move extracted pages from workDir into tempDir root as index files 0..N-1
  for (const p of pages) {
    const src = p.path;
    const dest = path.join(tempDir, String(p.index));
    await fs.rename(src, dest);
  }
  // cleanup workDir (empty)
  try {
    await fs.rmdir(workDir);
  } catch {
    // ignore if non-empty (should be empty)
  }
  // return list as indices relative to tempDir
  return pages.map((p) => ({ index: p.index, path: path.join(tempDir, String(p.index)), filename: String(p.index) }));
}

export default { extractPdfPagesToDir, extractPdfFromTemp };
