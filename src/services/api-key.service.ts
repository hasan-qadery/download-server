// src/services/apiKey.service.ts
import { generateApiKey, hashApiKey } from "../utils/api-key.util";
import { ApiKeyModel } from "../models/api-key.model";

export async function createApiKeyForUser(
  userId: string,
  label?: string,
  ttlDays?: number
) {
  const plain = generateApiKey();
  const hashed = hashApiKey(plain);

  const expiresAt = ttlDays
    ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
    : null;

  await ApiKeyModel.create({
    userId,
    keyHash: hashed,
    label: label ?? null,
    expiresAt,
  });

  // return the plain token to show to user once
  return plain;
}
