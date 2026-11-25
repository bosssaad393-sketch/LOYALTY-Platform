import "server-only";
import { currentStaff, type Staff } from "./staffAuth";
import { db } from "./supabase";
import { updatePoints, googleWalletConfigured } from "./googleWallet";
import { notifyAppleDevices } from "./apns";
import { parseTiers, stampState, type StampState } from "./stamps";
import { cardVouchers } from "./vouchersDb";
import type { CardVoucher } from "./vouchers";

export const fail = (error: string, status = 400) => Response.json({ error }, { status });

/** Runs a staff-only handler; answers 401 when nobody is signed in. */
export async function withStaff(handler: (staff: Staff) => Promise<Response>): Promise<Response> {
  const staff = await currentStaff("staff");
  if (!staff) return fail("Please sign in again.", 401);
  try {
    return await handler(staff);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("staff api failed", msg);
    // Rule violations raised by the ledger functions are safe to show to staff.
    const known = ["not enough points", "undo window", "already undone", "invalid bill", "too small", "only earn and redeem", "below zero", "already stamped", "does not use stamps", "visit already recorded", "daily scan limit", "choose a branch", "not allowed at this branch", "cannot be recorded at this counter", "does not use visit cards", "voucher already used", "voucher is not valid", "voucher has expired", "voucher cannot be used at this branch", "voucher not found", "branch not found"];
    return known.some((k) => msg.includes(k)) ? fail(msg.charAt(0).toUpperCase() + msg.slice(1) + ".") : fail("Something went wrong. Please try again.", 500);
  }
}

export type GuestView = {
  cardId: string; firstName: string; code: string; points: number; visits: number; goal: number; rewardText: string; rewardReady: boolean; pointsPerBhd: number;
  /** Stamp venues (0020): points are stamps, goal/rewardText are the reward due next, plus the ladder for the dots. */
  stampMode?: boolean; stamps?: StampState;
  /** Visit cards (0022): no points; staff record the visit and redeem vouchers. */
  visitMode?: boolean; lastVisit?: string | null; vouchers?: CardVoucher[];
};

/** What staff may see about a guest: first name, points and visits. Never phone or email. */
export async function guestView(cardId: string, staff: Staff): Promise<GuestView | null> {
  const { data, error } = await db()
    .from("cards")
    .select("id, code, points, visits, rewards_given, last_visit, venue_id, members(name, deleted_at), venues(reward_goal, reward_text, points_per_bhd, stamp_tiers, card_mode)")
    .eq("id", cardId)
    .eq("venue_id", staff.venueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const member = data.members as unknown as { name: string; deleted_at: string | null } | null;
  const venue = data.venues as unknown as { reward_goal: number; reward_text: string; points_per_bhd?: number; stamp_tiers?: unknown; card_mode?: string | null } | null;
  if (!member || member.deleted_at || !venue) return null;
  if (venue.card_mode === "visits") {
    return {
      cardId: data.id,
      firstName: member.name.trim().split(/\s+/)[0],
      code: data.code,
      points: 0,
      visits: data.visits,
      goal: 0,
      rewardText: "",
      rewardReady: false,
      pointsPerBhd: 0,
      visitMode: true,
      lastVisit: (data as { last_visit?: string | null }).last_visit ?? null,
      vouchers: await cardVouchers(data.id, staff.venueId),
    };
  }
  const tiers = parseTiers(venue.stamp_tiers);
  if (tiers) {
    const s = stampState(tiers, data.points, Number((data as { rewards_given?: number }).rewards_given ?? 0));
    return {
      cardId: data.id,
      firstName: member.name.trim().split(/\s+/)[0],
      code: data.code,
      points: data.points,
      visits: data.visits,
      goal: s.cost,
      rewardText: s.reward,
      rewardReady: s.ready,
      pointsPerBhd: 0,
      stampMode: true,
      stamps: s,
    };
  }
  return {
    cardId: data.id,
    firstName: member.name.trim().split(/\s+/)[0],
    code: data.code,
    points: data.points,
    visits: data.visits,
    goal: venue.reward_goal,
    rewardText: venue.reward_text,
    rewardReady: data.points >= venue.reward_goal,
    // So the till can say how many points a bill adds before it is sent.
    pointsPerBhd: Number(venue.points_per_bhd ?? 0),
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
