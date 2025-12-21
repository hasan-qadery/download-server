// src/services/apiKey.service.ts
import crypto from "crypto";
import { ApiKeyModel } from "../models/api-key.model";
import { CreateOptions, Transaction, UniqueConstraintError } from "sequelize";
import { hmacSecret } from "../utils/hmac.utils";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
const MAX_RETRIES = 3;

export class ApiKeyService {
  // You could get and set the lable.
  async createForUser(userId: string, options?: CreateOptions) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const clientId = crypto.randomBytes(24).toString("base64url");
      const clientSecret = crypto.randomBytes(32).toString("hex");

      const secretHash = hmacSecret(clientSecret);

      try {
        await ApiKeyModel.create(
          {
            id: clientId,
            user_id: userId,
            secret_hash: secretHash,
            // label: label ?? null,
            revoked: false,
          },
          options
        );

        return {
          client_id: clientId,
          api_key: `upl_live_${clientId}_${clientSecret}`, // SHOW ONCE
        };
      } catch (err: any) {
        // Retry ONLY on primary key collision
        if (err instanceof UniqueConstraintError && attempt < MAX_RETRIES) {
          continue;
        }

        // Real error → bubble up
        throw err;
      }
    }

    // This should realistically never happen
    throw new Error("Failed to generate unique API key");
  }

  async validate(apiKey: string) {
    // Expected: upl_live_clientId_clientSecret
    if (!apiKey.startsWith("upl_live_")) return null;
    const parts = apiKey.split("_");
    if (parts.length < 4) return null;

    const clientId = parts[2];
    const clientSecret = parts.slice(3).join("_");

    const key = await ApiKeyModel.findOne({
      where: { id: clientId, revoked: false },
    });

    if (!key) return null;

    if (key.expires_at && key.expires_at.getTime() <= Date.now()) {
      return null;
    }
    
    const computedHash = hmacSecret(clientSecret);

    // if (computedHash !== key.secret_hash) {
    //   return null;
    // }

    // Same work as commented part, but abit more secure.
    const valid = crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(key.secret_hash, "hex")
    );

    if (!valid) return null;

    return key;
  }

  findByUserId(user_id: string) {
    return ApiKeyModel.findAll({
      where: {
        user_id,
      },
    });
  }

  static async revoke(clientId: string) {
    await ApiKeyModel.update({ revoked: true }, { where: { id: clientId } });
  }
}
