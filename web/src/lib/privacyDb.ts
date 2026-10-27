import "server-only";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { requestView, type RequestView } from "./privacy";

/**
 * A guest asks for their data to be deleted. The card id is the credential (it is unguessable).
 * "created" = new pending request, "exists" = one is already pending, "unknown" = no such card.
 * The request row holds no name, phone or email.
 */
export async function createDeleteRequest(cardId: string): Promise<"created" | "exists" | "unknown"> {
  const { data: card, error } = await db().from("cards").select("id, venue_id, members(deleted_at)").eq("id", cardId).maybeSingle();
  if (error) throw error;
  const member = card?.members as unknown as { deleted_at: string | null } | { deleted_at: string | null }[] | null | undefined;
  const m = Array.isArray(member) ? member[0] : member;
  if (!card || !m || m.deleted_at) return "unknown";

  const { data: row, error: e2 } = await db().from("deletion_requests").insert({ venue_id: card.venue_id, card_id: card.id }).select("id").single();
  if (e2) {
    if (e2.code === "23505") return "exists"; // the one-pending-per-card index
    throw e2;
  }
  await db().from("audit_log").insert({ venue_id: card.venue_id, actor: "guest", action: "deletion_requested", detail: { request: row.id } });
  return "created";
}

export async function listDeletionRequests(venueId: string): Promise<RequestView[]> {
  const { data, error } = await db()
    .from("deletion_requests")
    .select("id, card_id, requested_at, status")
    .eq("venue_id", venueId)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(requestView);
}

/**
 * Erases a guest for good: the member row goes, and the card and points history go with it (cascade).
 * Shared by DELETE /api/owner/guests and the privacy screen. Any pending request for the card is closed.
 * Returns false when this venue has no such card.
 */
export async function eraseCard(venueId: string, cardId: string): Promise<boolean> {
  const { data: card, error } = await db().from("cards").select("member_id").eq("id", cardId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  if (!card) return false;
  const { error: e2 } = await db().from("members").delete().eq("id", card.member_id);
  if (e2) throw e2;
  // Best effort: the erase itself is done. If this fails the owner can close the request from the privacy screen.
  const { error: e3 } = await db()
    .from("deletion_requests")
    .update({ status: "erased", erased_at: new Date().toISOString() })
    .eq("venue_id", venueId)
    .eq("card_id", cardId)
    .eq("status", "pending");
  if (e3) console.error("closing deletion request failed", e3.message);
  return true;
}

/** Erases the guest behind a deletion request and closes it. Asking again for a closed request is fine. */
export async function eraseRequest(staff: Staff, requestId: string): Promise<"erased" | "unknown"> {
  const { data: req, error } = await db()
    .from("deletion_requests")
    .select("id, card_id, status")
    .eq("id", requestId)
    .eq("venue_id", staff.venueId)
    .maybeSingle();
  if (error) throw error;
  if (!req) return "unknown";
  if (req.status === "erased") return "erased";

  // The card may already be gone (erased from the guest list): then there is nothing left to delete.
  if (req.card_id) await eraseCard(staff.venueId, req.card_id);
  const { error: e2 } = await db()
    .from("deletion_requests")
    .update({ status: "erased", erased_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("venue_id", staff.venueId);
  if (e2) throw e2;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "guest_erased", detail: { request: req.id } });
  return "erased";
}
