import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** POS API keys look like `loy_pos_<43 random characters>`. Only the SHA-256 hash is stored; the key itself is shown once. */
export const KEY_PREFIX = "loy_pos_";

export function newKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashKey(key), prefix: key.slice(0, KEY_PREFIX.length + 4) };
}

export const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** The key from `Authorization: Bearer <key>`, or null when it is missing or does not look like one of ours. */
export function bearerKey(header: string | null): string | null {
  const m = /^Bearer\s+(loy_pos_[A-Za-z0-9_-]{43})$/.exec(header ?? "");
  return m ? m[1] : null;
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
