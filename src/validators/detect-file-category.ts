import { FILE_RULES, FileRule } from "./file-rules";

export function detectFileRule(file: Express.Multer.File): FileRule | null {
  return (
    FILE_RULES.find(
      (rule) =>
        rule.mimeTypes.includes(file.mimetype) &&
        rule.extensions.test(file.originalname)
    ) || null
  );
}
