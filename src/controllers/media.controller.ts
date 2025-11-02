/**
 * Media controllers
 *
 * Exposes endpoints:
 *  - POST  /upload/temp         -> multipart upload to temp storage (files[])
 *  - POST  /upload/commit       -> commit temp files to final path (JSON body)
 *  - GET   /files               -> list files under a directory (query: dir, offset, limit)
 *  - DELETE /files              -> delete path (body: { path })
 *  - POST  /files/replace       -> multipart replace a file (fields: path) -> multipart file
 *  - GET   /meta/file           -> get metadata for a file (query: path)
 *
 * Notes:
 *  - Endpoints are protected by internalApiKeyAuth (routes.ts wiring).
 *  - Uses multer.memoryStorage by default. For big uploads you should use streaming to a temp file.
 */

import { Request, Response, NextFunction, Router } from "express";
import multer from "multer";
import { storageService } from "../services/storage.service";
import { logger, stream } from "../logger";
import { config } from "../config";

const router = Router();
// router.use(authMiddleware)

router.post("/upload", uploadMedia);

async function uploadMedia(req: Request, res: Response, next: NextFunction) {
  if (req.fileValidationError) {
    if (req.file)
      unlink(req.file?.path, (err) => {
        if (err) next(err);
      });
    return Resp.error(req.fileValidationError, 403).send(res);
  }

  if (!req.file)
    return Resp.error(req.t("StorageErrorEnum.FILE_REQUIRED"), 400).send(res);
}
