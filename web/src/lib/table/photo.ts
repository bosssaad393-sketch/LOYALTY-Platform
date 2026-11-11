import "server-only";
import { randomBytes } from "node:crypto";
import { sampleMode } from "../demo";
import { db } from "../supabase";

// A menu item's photo. The owner's browser shrinks it first, so a good upload is small. The server checks the real file
// type from its first bytes (never the name or the claimed type), and it alone decides the address that gets saved.

const MAX_BYTES = 600 * 1024;
const BUCKET = "menu";

type Kind = { type: string; ext: string };

export function photoKind(b: Uint8Array): Kind | null {
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  return null;
}

/** Reads "data:image/...;base64,...". Null when it is not a WebP or JPEG of an accepted size. */
export function parsePhoto(dataUrl: string): { bytes: Buffer; kind: Kind } | null {
  const m = /^data:image\/(?:webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) return null;
  const kind = photoKind(bytes);
  return kind ? { bytes, kind } : null;
}

/** Stores the file and answers its public address. Sample-data mode keeps the picture inside the record, since there is no storage. */
export async function storePhoto(venueId: string, itemId: string, photo: { bytes: Buffer; kind: Kind }): Promise<string> {
  if (sampleMode()) {
    return `data:${photo.kind.type};base64,${photo.bytes.toString("base64")}`;
  }
  // A new name each time, so a changed photo shows straight away instead of an old copy from a browser's memory.
  const path = `${venueId}/${itemId}-${randomBytes(6).toString("hex")}.${photo.kind.ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, photo.bytes, { contentType: photo.kind.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
