import "server-only";
import { currentStaff, type Staff } from "./staffAuth";
import { db } from "./supabase";
import { updatePoints, googleWalletConfigured } from "./googleWallet";
import { notifyAppleDevices } from "./apns";

export const fail = (error: string, status = 400) => Response.json({ error }, { status });

/** Runs a staff-only handler; answers 401 when nobody is signed in. */
export async function withStaff(handler: (staff: Staff) => Promise<Response>): Promise<Response> {
  const staff = await currentStaff();
  if (!staff) return fail("Please sign in again.", 401);
  try {
    return await handler(staff);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("staff api failed", msg);
    // Rule violations raised by the ledger functions are safe to show to staff.
    const known = ["not enough points", "undo window", "already undone", "invalid bill", "too small", "only earn and redeem", "below zero"];
    return known.some((k) => msg.includes(k)) ? fail(msg.charAt(0).toUpperCase() + msg.slice(1) + ".") : fail("Something went wrong. Please try again.", 500);
  }
}

export type GuestView = { cardId: string; firstName: string; code: string; points: number; visits: number; goal: number; rewardText: string; rewardReady: boolean };

/** What staff may see about a guest: first name, points and visits. Never phone or email. */
export async function guestView(cardId: string, staff: Staff): Promise<GuestView | null> {
  const { data, error } = await db()
    .from("cards")
    .select("id, code, points, visits, venue_id, members(name, deleted_at), venues(reward_goal, reward_text)")
    .eq("id", cardId)
    .eq("venue_id", staff.venueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const member = data.members as unknown as { name: string; deleted_at: string | null } | null;
  const venue = data.venues as unknown as { reward_goal: number; reward_text: string } | null;
  if (!member || member.deleted_at || !venue) return null;
  return {
    cardId: data.id,
    firstName: member.name.trim().split(/\s+/)[0],
    code: data.code,
    points: data.points,
    visits: data.visits,
    goal: venue.reward_goal,
    rewardText: venue.reward_text,
    rewardReady: data.points >= venue.reward_goal,
  };
}

/** Best effort: refresh the guest's Wallet cards (Apple by push, Google by API). */
export async function refreshWalletCards(cardId: string, points: number) {
  await notifyAppleDevices(cardId);
  if (!googleWalletConfigured()) return;
  await updatePoints({ id: cardId, points } as Parameters<typeof updatePoints>[0]).catch((e) =>
    console.error("google wallet refresh failed", e instanceof Error ? e.message : e),
  );
}
