// src/controllers/pdf.controller.ts
/**
 * Controller for PDF extraction.
 *
 * POST /pdf/extract
 * Body JSON:
 *   { temp_id: "tmp_xxx", temp_index: 0 }
 *
 * Behavior:
 *  - Validate inputs
 *  - Use pdfService.extractPdfFromTemp to extract pages into same temp dir
 *  - Returns: { temp_id, pages: [{ index, path, filename, size_bytes }] }
 *
 * Note: this endpoint is protected by the same internal API key (routes must mount with internalApiKeyAuth).
 */
import { Request, Response, NextFunction } from "express";
import { config, paths } from "../config";
import { logger } from "../logger";
import { extractPdfFromTemp } from "../services/pdf.service";
import path from "path";
import fs from "fs/promises";

export async function extractPdfController(req: Request, res: Response) {
  const { temp_id, temp_index } = req.body as any;
  if (!temp_id || typeof temp_index === "undefined") {
    return res.status(400).json({ error: "temp_id and temp_index are required" });
  }

  try {
    const tempDir = path.join(paths.tempDir(), temp_id);
    // sanity check
    await fs.access(tempDir);

    const pages = await extractPdfFromTemp(tempDir, Number(temp_index));
    // collect sizes
    const pagesWithSize = await Promise.all(
      pages.map(async (p) => {
        const st = await fs.stat(p.path);
        return { index: p.index, filename: p.filename, path: p.path, size_bytes: st.size };
      })
    );

    return res.json({ temp_id, pages: pagesWithSize });
  } catch (err: any) {
    logger.error("PDF extract failed: " + String(err));
    return res.status(500).json({ error: String(err.message || err) });
  }
}
