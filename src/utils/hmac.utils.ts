import crypto from "crypto";

const PEPPER = process.env.API_KEY_PEPPER!;
if (!PEPPER) {
  throw new Error("API_KEY_PEPPER is not defined");
}

export function hmacSecret(value: string): string {
  return crypto.createHmac("sha256", PEPPER).update(value).digest("hex");
}
