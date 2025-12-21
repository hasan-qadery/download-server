// src/middleware/apiKeyAuth.ts
import { Request, Response, NextFunction } from "express";
import { ApiKeyModel } from "../models/api-key.model";
import { ApiKeyService } from "../services/api-key.service";
import { UserModel } from "../models/user.model";

declare global {
  namespace Express {
    interface Request {
      user?: UserModel;
      apiKeyId?: number;
    }
  }
}

const apiKeyService = new ApiKeyService();

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const raw =
    req.headers["x-api-key"] ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!raw) {
    return res.status(401).json({ message: "API key required" });
  }

  const key = await apiKeyService.validate(raw as string);
  if (!key) {
    return res.status(401).json({ message: "Invalid API key" });
  }

  const user = await UserModel.findByPk(key.user_id);
  if (!user) {
    return res.status(401).json({ message: "Invalid API key" });
  }

  req.user = user;
  next();
}
