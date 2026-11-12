import "server-only";
import { createHmac } from "node:crypto";

// The keyed hash a PIN is stored under. Kept apart from pin.ts (which reads the database) so the sample data can hash
// its sample PINs without a circular import.

function key(): string {
  const base = process.env.STAFF_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No secret available for PINs.");
  return createHmac("sha256", base).update("loyalty-pin-v1").digest("hex");
}

export const mac = (s: string) => createHmac("sha256", key()).update(s).digest("hex");

export const pinLookup = (pin: string) => mac(`pin:${pin}`);
