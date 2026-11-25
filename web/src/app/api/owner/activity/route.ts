import { db } from "@/lib/supabase";
import { withOwner } from "@/lib/ownerApi";
import { listBranches } from "@/lib/branchesDb";
import { ACTIVITY_ACTIONS, activityView, type ActivityRow } from "@/lib/activity";

/**
 * Owner only: the last 200 things people did at this venue (visits, vouchers used and cancelled, team and branch
 * changes, guest list downloads), newest first, with the person's name and the branch. Read only.
 */
export async function GET() {
  return withOwner(async (staff) => {
    const { data, error } = await db().from("audit_log").select("id, action, actor, branch_id, created_at, detail")
      .eq("venue_id", staff.venueId).in("action", ACTIVITY_ACTIONS).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const [{ data: team }, branches] = await Promise.all([
      db().from("staff_users").select("id, name").eq("venue_id", staff.venueId),
      listBranches(staff.venueId, { includeInactive: true }),
    ]);
    const names = new Map((team ?? []).map((t) => [String(t.id), String(t.name)]));
    const places = new Map(branches.map((b) => [b.id, b.name]));
    const rows = (data ?? []).map((r) => ({ id: r.id, action: String(r.action), actor: String(r.actor), branchId: (r.branch_id as string | null) ?? null, at: String(r.created_at), detail: (r.detail ?? {}) as Record<string, unknown> }) as ActivityRow);
    return Response.json({ activity: rows.map((r) => activityView(r, names, places)) }, { headers: { "cache-control": "no-store" } });
  }, true);
}
