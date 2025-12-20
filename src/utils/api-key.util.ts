// import crypto from "crypto";

// export function generateApiKey() {
//   return crypto.randomBytes(32).toString("hex"); // 64 hex chars
// }

// export function hashApiKey(key: string) {
//   return crypto.createHash("sha256").update(key).digest("hex");
// }

// src/utils/apiTokens.ts
import crypto from "crypto";

const KEY_BYTES = 48; // 48 bytes => 96 hex chars

export function generateApiKey(): string {
  return crypto.randomBytes(KEY_BYTES).toString("hex");
}

// use an HMAC/pepper to make the stored hash resilient to DB leaks
const PEPPER = process.env.API_KEY_PEPPER || ""; // keep this secret in env
export function hashApiKey(plain: string): string {
  return crypto.createHmac("sha256", PEPPER).update(plain).digest("hex");
}
