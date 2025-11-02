// src/routes.ts
import express from "express";
import * as mediaController from "./controllers/media.controller";
import { internalApiKeyAuth } from "./middleware/auth";

const router = express.Router();

// Public health check
router.get("/health", mediaController.health);

// Protected API: internal API key required
router.post("/upload/temp", internalApiKeyAuth, mediaController.uploadTemp);
router.post("/upload/commit", internalApiKeyAuth, mediaController.commitTempToFinal);

router.use("/medias",mediaController)

// File operations
router.get("/files", internalApiKeyAuth, mediaController.listFiles);
router.delete("/files", internalApiKeyAuth, mediaController.deletePath);
router.post("/files/replace", internalApiKeyAuth, mediaController.replaceFile);

// Metadata
router.get("/meta/file", internalApiKeyAuth, mediaController.getFileMeta);

// Admin-only endpoints (example toggles) - protect with same internal key or stronger auth
// router.post("/admin/logging/enable", internalApiKeyAuth, (req, res) => { ... })

export default router;
