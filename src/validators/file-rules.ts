export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "json"
  | "text"
  | "zip";

export interface FileRule {
  category: FileCategory;
  mimeTypes: string[];
  extensions: RegExp;
  maxSize: number; // bytes
}

export const FILE_RULES: FileRule[] = [
  {
    category: "image",
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    extensions: /\.(jpe?g|png|webp|gif)$/i,
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  {
    category: "video",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: /\.(mp4|webm|mov)$/i,
    maxSize: 150 * 1024 * 1024, // 150MB
  },
  {
    category: "audio",
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/ogg"],
    extensions: /\.(mp3|wav|ogg)$/i,
    maxSize: 20 * 1024 * 1024, // 20MB
  },
  {
    category: "json",
    mimeTypes: ["application/json"],
    extensions: /\.json$/i,
    maxSize: 2 * 1024 * 1024, // 2MB
  },
  {
    category: "text",
    mimeTypes: ["text/plain"],
    extensions: /\.txt$/i,
    maxSize: 1 * 1024 * 1024, // 1MB
  },
  {
    category: "zip",
    mimeTypes: ["application/zip", "application/x-zip-compressed"],
    extensions: /\.zip$/i,
    maxSize: 50 * 1024 * 1024, // 50MB
  },
];
