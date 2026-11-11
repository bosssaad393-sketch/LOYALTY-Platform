import "server-only";
import { must } from "./must";
import { db } from "./supabase";
import { cardNames } from "./table/points";
import { feedbackView, type FeedbackView } from "./feedbackRules";

// Feedback from the counter page (migration 0018). Only a guest holding this venue's card can send it; the route checks that.

type Row = { id: string; card_id: string; rating: number; message: string | null; created_at: string };

export async function addFeedback(venueId: string, cardId: string, rating: number, message: string): Promise<void> {
  must(await db().from("feedback").insert({ venue_id: venueId, card_id: cardId, rating, message: message || null }));
}

/** The latest 200, with the guest's first name only (never a phone or email). */
export async function listFeedback(venueId: string): Promise<FeedbackView> {
  const rows = must(await db().from("feedback").select("id, card_id, rating, message, created_at").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(200)) as Row[];
  const names = await cardNames(venueId, [...new Set(rows.map((r) => r.card_id))]);
  return feedbackView(rows.map((r) => ({ id: r.id, rating: r.rating, message: r.message ?? "", firstName: names.get(r.card_id) ?? null, createdAt: r.created_at })));
}
