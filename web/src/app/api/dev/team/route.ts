import { db } from "@/lib/supabase";
import { withDeveloper } from "@/lib/devApi";

/** The people of the developer's own business and whether each has a PIN, so the first PINs can be set. Never shows a PIN. */
export async function GET() {
  return withDeveloper(async (staff) => {
    const { data, error } = await db().from("staff_users").select("id, name, role, active, pin_lookup").eq("venue_id", staff.venueId).neq("role", "developer").order("created_at");
    if (error) throw error;
    return Response.json({ team: (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, role: s.role as string, active: s.active as boolean, hasPin: !!s.pin_lookup })) }, { headers: { "cache-control": "no-store" } });
  });
}
