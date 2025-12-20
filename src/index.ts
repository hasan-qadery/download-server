// src/index.ts (excerpt)
import express from "express";
import bodyParser from "body-parser";
import morgan from "morgan";
import router from "./routs";
import { stream } from "./logger";
import { config } from "./config";

const app = express();
app.use(morgan("combined", { stream }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/api/v1", router);

app.listen(config.port, () => {
  console.log(`Download server listening on ${config.port}`);
});



// import { storageService } from "./services/storage.service";
// import imageService from "./services/image.service";

// // simple hook: if source is image (png/jpg) convert to webp and generate thumbnail
// storageService.processHook = async ({ srcAbsolutePath, destAbsolutePath, filename, tempIndex }) => {
//   // simple extension check
//   const ext = filename.toLowerCase().split(".").pop() || "";
//   // if file is PNG/JPEG/GIF etc -> process
//   const imageExts = ["png", "jpg", "jpeg", "webp", "gif", "tiff", "bmp"];
//   if (imageExts.includes(ext)) {
//     // generate a thumbnail path (same folder, filename.thumb.webp)
//     const thumbPath = destAbsolutePath + ".thumb.webp";
//     try {
//       const res = await imageService.processImage({
//         srcAbsolutePath,
//         destAbsolutePath,
//         thumbnailPath: thumbPath,
//         quality: 80,
//         maxWidth: 2000,
//       });
//       return { mime: res.mime, width: res.width, height: res.height, metadata: res.metadata };
//     } catch (err) {
//       // if processing fails, log and return null so storageService uses raw copy
//       logger.warn("imageService.processImage failed: " + String(err));
//       return null;
//     }
//   }
//   // For other files, do nothing (storageService will copy raw buffer)
//   return null;
// };
