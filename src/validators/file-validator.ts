import { Request, Response, NextFunction } from "express";
import { detectFileRule } from "./detect-file-category";

export interface ValidatedFile {
  file: Express.Multer.File;
  category: string;
}

export const mediaValidationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const files =
    (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);

  if (!files.length) {
    return res.status(400).json({
      code: "NO_FILES",
      message: "No files uploaded",
    });
  }

  const validatedFiles: ValidatedFile[] = [];

  for (const file of files) {
    // 1. Empty file check
    if (!file.size || file.size === 0) {
      return res.status(400).json({
        code: "EMPTY_FILE",
        message: `Empty file: ${file.originalname}`,
      });
    }

    // 2. Detect category
    const rule = detectFileRule(file);
    if (!rule) {
      return res.status(400).json({
        code: "INVALID_FILE_TYPE",
        message: `File type not allowed: ${file.originalname}`,
      });
    }

    // 3. Size validation
    if (file.size > rule.maxSize) {
      return res.status(400).json({
        code: "FILE_TOO_LARGE",
        message: `${file.originalname} exceeds max size for ${rule.category}`,
      });
    }

    validatedFiles.push({
      file,
      category: rule.category,
    });
  }

  // Attach validated files to request for next steps
  req.validatedFiles = validatedFiles;

  next();
};
