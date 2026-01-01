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
import { logger, stream } from "../logger";
import { config } from "../config";
import { authMiddleware } from "../middlewares/auth.middleware";
import { mediaValidationMiddleware } from "../validators/file-validator";
import { Validator } from "../middlewares/validator";
import { UploadFileDto } from "../dtos/files/upload-file.dto";

const router = Router();
router.use(authMiddleware);

router.post(
  "/upload",
  mediaValidationMiddleware,
  Validator.body(UploadFileDto),
  uploadMedia
);

async function uploadMedia(req: Request, res: Response, next: NextFunction) {}

export default router;
