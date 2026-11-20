import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { parseTiers, type StampTier } from "./stamps";

/** The venue's points rules. One place, used by the Rules screen and by the owner assistant. */
export const Rules = z.object({
  pointsPerBhd: z.number().int().min(1).max(100),
  rewardGoal: z.number().int().min(10).max(100000),
  rewardText: z.string().trim().min(2).max(120),
});
export type RulesValue = z.infer<typeof Rules>;

/** Stamp venues (0020) also get their reward ladder. Points venues get stampTiers: null. */
export async function readRules(venueId: string): Promise<RulesValue & { stampTiers?: StampTier[] | null }> {
  const { data, error } = await db().from("venues").select("points_per_bhd, reward_goal, reward_text, stamp_tiers").eq("id", venueId).single();
  if (error || !data) throw error ?? new Error("venue not found");
  return { pointsPerBhd: data.points_per_bhd, rewardGoal: data.reward_goal, rewardText: data.reward_text, stampTiers: parseTiers((data as { stamp_tiers?: unknown }).stamp_tiers) };
}

/** The owner renames the rewards of a stamp venue. The steps (3, 6, 9...) stay as they are; only the words change. Audited. */
export async function saveStampTexts(staff: Staff, texts: string[]): Promise<StampTier[]> {
  const cur = (await readRules(staff.venueId)).stampTiers;
  if (!cur) throw new Error("this venue does not use stamps");
  if (texts.length !== cur.length) throw new Error("one text for each reward");
  // A reward whose English words did not change keeps its Arabic; a renamed one drops it (it would be out of date).
  const next = parseTiers(cur.map((t, i) => {
    const text = String(texts[i] ?? "").trim().slice(0, 60);
    return text === t.text && t.ar ? { at: t.at, text, ar: t.ar } : { at: t.at, text };
  }));
  if (!next) throw new Error("every reward needs a short name");
  const { error } = await db().from("venues").update({ stamp_tiers: next }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "stamp_rewards_changed", detail: { tiers: next } });
  return next;
}

/**
 * Changes some or all of the rules of the SIGNED-IN person's venue (the venue always comes from the session, never from the caller).
 * Changes apply from the next visit; guests keep the points they have. Audited. Throws if the result is not valid.
 */
export async function saveRules(staff: Staff, patch: Partial<RulesValue>): Promise<RulesValue> {
  const next = Rules.parse({ ...(await readRules(staff.venueId)), ...patch });
  const { error } = await db()
    .from("venues")
    .update({ points_per_bhd: next.pointsPerBhd, reward_goal: next.rewardGoal, reward_text: next.rewardText })
    .eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "rules_changed", detail: next });
  return next;
}
