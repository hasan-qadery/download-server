// src/services/pdf.service.ts
/**
 * Pure-JS PDF helper using pdf-lib.
 *
 * - extractPagesAsSeparatePdfs(tempPdfPath, outputDir)
 *   splits the input PDF into separate single-page PDF files named 0.pdf,1.pdf,...
 *
 * Limitations:
 * - This does NOT rasterize pages to PNG/JPEG. It creates single-page PDF files.
 * - If you need rasterized images (for comics displaying as images), you still need a rasterizer
 *   such as `pdftoppm` (poppler) or a headless renderer (not pure-JS reliably).
 *
 * Use-case:
 * - If admin uploads a multi-page PDF, you can split into per-page PDFs, then either:
 *   - serve per-page PDF files to clients, or
 *   - later (on a machine/container with poppler) rasterize per-page PDFs to bitmaps.
 */

import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../logger";

export type PdfExtractResult = { index: number; path: string; filename: string }[];

/**
 * Split PDF into single-page PDFs and write them into outputDir, filenames: 0.pdf,1.pdf,...
 * Returns array with metadata.
 */
export async function extractPagesAsSeparatePdfs(pdfPath: string, outputDir: string): Promise<PdfExtractResult> {
  // load source
  const inputBuf = await fs.readFile(pdfPath);
  const srcDoc = await PDFDocument.load(inputBuf);

  const total = srcDoc.getPageCount();
  await fs.mkdir(outputDir, { recursive: true });

  const result: PdfExtractResult = [];

  for (let i = 0; i < total; i++) {
    const dest = await PDFDocument.create();
    const [copied] = await dest.copyPages(srcDoc, [i]);
    dest.addPage(copied);
    const bytes = await dest.save();
    const filename = `${i}.pdf`;
    const outPath = path.join(outputDir, filename);
    await fs.writeFile(outPath, bytes);
    result.push({ index: i, path: outPath, filename });
  }

  return result;
}

/**
 * Convenience: given a tempDir and tempIndex for the uploaded PDF inside it,
 * split into per-page PDFs in the same tempDir and return created indices.
 */
export async function extractPdfFromTemp(tempDir: string, tempIndex: number) {
  const pdfPath = path.join(tempDir, String(tempIndex));
  // check existence
  await fs.access(pdfPath);
  // produce a working subdir to avoid collisions
  const workDir = path.join(tempDir, `pdf_split_${Date.now()}_${uuidv4().slice(0,6)}`);
  const pages = await extractPagesAsSeparatePdfs(pdfPath, workDir);

  // Move created files into tempDir as 0,1,2... filenames (overwriting if needed)
  const results = [];
  for (const p of pages) {
    const src = p.path;
    const dest = path.join(tempDir, String(p.index));
    await fs.rename(src, dest);
    results.push({ index: p.index, path: dest, filename: String(p.index) });
  }

  // try to remove workDir if empty
  try {
    await fs.rmdir(workDir);
  } catch {
    // ignore
  }

  return results;
}

export default { extractPagesAsSeparatePdfs, extractPdfFromTemp };
