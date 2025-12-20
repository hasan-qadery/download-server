// src/middleware/apiKeyAuth.ts
import { Request, Response, NextFunction } from "express";
import { ApiKeyModel } from "../models/api-key.model";
import { hashApiKey } from "../utils/api-key.util";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      apiKeyId?: number;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = req.header("authorization") || "";
  // Accept "ApiKey <token>" or bare token
  const token = auth.includes(" ") ? auth.split(" ")[1] : auth;
  if (!token) return res.status(401).json({ error: "No API key" });

  const hashed = hashApiKey(token);

  const row = await ApiKeyModel.findOne({
    where: {
      keyHash: hashed,
      revoked: false,
      // expiresAt null or in future
      // use sequelize literal or check in JS after finding row
    },
  });

  if (!row) return res.status(401).json({ error: "Invalid API key" });

  if (row.expires_at && row.expires_at < new Date()) {
    return res.status(401).json({ error: "API key expired" });
  }

  // // update lastUsedAt (optional, consider doing this in background)
  // row.last_used_at = new Date();
  // await row.save();

  req.userId = row.user_id;
  req.apiKeyId = row.id;
  return next();
}
