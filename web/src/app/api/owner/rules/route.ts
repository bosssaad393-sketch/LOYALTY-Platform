import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";

const Rules = z.object({
  pointsPerBhd: z.number().int().min(1).max(100),
  rewardGoal: z.number().int().min(10).max(100000),
  rewardText: z.string().trim().min(2).max(120),
});

export async function GET() {
  return withOwner(async (staff) => {
    const { data, error } = await db().from("venues").select("points_per_bhd, reward_goal, reward_text").eq("id", staff.venueId).single();
    if (error) throw error;
    return Response.json({ pointsPerBhd: data.points_per_bhd, rewardGoal: data.reward_goal, rewardText: data.reward_text });
  });
}

/** Changes apply from the next visit. Guests keep the points they have. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Rules.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the numbers: points per BHD 1–100, reward goal 10 or more, and a short reward text.");
    const r = parsed.data;
    const { error } = await db().from("venues").update({ points_per_bhd: r.pointsPerBhd, reward_goal: r.rewardGoal, reward_text: r.rewardText }).eq("id", staff.venueId);
    if (error) throw error;
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "rules_changed", detail: r });
    return Response.json(r);
  }, true);
}
