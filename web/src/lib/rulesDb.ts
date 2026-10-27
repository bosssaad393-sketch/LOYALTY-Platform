import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";

/** The venue's points rules. One place, used by the Rules screen and by the owner assistant. */
export const Rules = z.object({
  pointsPerBhd: z.number().int().min(1).max(100),
  rewardGoal: z.number().int().min(10).max(100000),
  rewardText: z.string().trim().min(2).max(120),
});
export type RulesValue = z.infer<typeof Rules>;

export async function readRules(venueId: string): Promise<RulesValue> {
  const { data, error } = await db().from("venues").select("points_per_bhd, reward_goal, reward_text").eq("id", venueId).single();
  if (error || !data) throw error ?? new Error("venue not found");
  return { pointsPerBhd: data.points_per_bhd, rewardGoal: data.reward_goal, rewardText: data.reward_text };
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
