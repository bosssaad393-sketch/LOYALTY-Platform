// Deletion requests (PDPL). Pure helpers: no database, no framework.
import { z } from "zod";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BAHRAIN_OFFSET_MS = 3 * 3600_000;

export type RequestStatus = "pending" | "erased";

/**
 * What the owner sees instead of a name: "Guest from 12 Oct" (the day in Bahrain). The owner can erase without
 * browsing personal data, so this label is built from the date only.
 */
export function requestLabel(requestedAt: string | number | Date): string {
  const t = new Date(requestedAt).getTime();
  if (!Number.isFinite(t)) return "Guest request";
  const d = new Date(t + BAHRAIN_OFFSET_MS);
  return `Guest from ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export type RequestView = { id: string; cardId: string | null; label: string; requestedAt: string; status: RequestStatus };

/** Picks exactly the fields the owner screen needs. Nothing else from the row can leave through this. */
export function requestView(row: { id: string; card_id?: string | null; requested_at: string; status: string }): RequestView {
  const at = Date.parse(row.requested_at);
  return {
    id: row.id,
    cardId: row.card_id ?? null,
    label: requestLabel(row.requested_at),
    requestedAt: Number.isFinite(at) ? new Date(at).toISOString() : row.requested_at,
    status: row.status === "erased" ? "erased" : "pending",
  };
}

export const EraseInput = z.object({ requestId: z.uuid() });
