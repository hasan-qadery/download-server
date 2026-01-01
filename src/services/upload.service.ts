// src/services/upload.service.ts
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { STORAGE_ROOT } from "../configs/storage.config";

interface UploadInput {
    files: Express.Multer.File[];
    uploadPath?: string;
    keepOriginalName: boolean;
}

export class UploadService {
    static async upload({
        files,
        uploadPath,
        keepOriginalName,
    }: UploadInput) {
        const targetDir = this.resolvePath(uploadPath);

        await fs.mkdir(targetDir, { recursive: true });

        const results = [];

        for (const file of files) {
            const filename = keepOriginalName
                ? this.sanitizeFilename(file.originalname)
                : this.generateFilename(file.originalname);

            const fullPath = path.join(targetDir, filename);

            await fs.writeFile(fullPath, file.buffer);

            results.push({
                originalName: file.originalname,
                filename,
                size: file.size,
                path: path.relative(STORAGE_ROOT, fullPath),
                mimeType: file.mimetype,
            });
        }

        return results;
    }

    // ---------------- helpers ----------------

    private static resolvePath(uploadPath?: string) {
        const safePath = uploadPath
            ? uploadPath.replace(/^\/*/, "")
            : ""; // 👈 default to root

        const resolved = path.resolve(
            STORAGE_ROOT,
            safePath
        );

        if (!resolved.startsWith(STORAGE_ROOT)) {
            throw new Error("Invalid upload path");
        }

        return resolved;
    }

    private static generateFilename(original: string) {
        const ext = path.extname(original);
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const uuid = crypto.randomUUID();

        return `${date}_${uuid}${ext}`;
    }


    private static sanitizeFilename(name: string) {
        return name.replace(/[^a-zA-Z0-9._-]/g, "_");
    }
}
