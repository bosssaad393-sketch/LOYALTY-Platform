import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";

export async function GET() {
  return withOwner(async (staff) => {
    const { data, error } = await db().from("staff_users").select("id, name, role, active, auth_user").eq("venue_id", staff.venueId).order("created_at");
    if (error) throw error;
    const team = await Promise.all((data ?? []).map(async (s) => {
      const u = s.auth_user ? await db().auth.admin.getUserById(s.auth_user) : null;
      return { id: s.id, name: s.name, role: s.role, active: s.active, email: u?.data.user?.email ?? "", me: s.id === staff.id };
    }));
    return Response.json({ team });
  }, true);
}

const Invite = z.object({ name: z.string().trim().min(1).max(60), email: z.email().max(160), role: z.enum(["staff", "manager"]) });

/** Adds a team member and returns a one-time password to hand over in person. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Invite.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Enter a name, a valid email and a role.");
    const { name, role } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    const password = randomBytes(9).toString("base64url");
    const created = await db().auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) return fail("That email already has a login. Use another email.", 409);
    const { error } = await db().from("staff_users").insert({ auth_user: created.data.user.id, venue_id: staff.venueId, name, role });
    if (error) { await db().auth.admin.deleteUser(created.data.user.id); throw error; }
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "staff_added", detail: { name, role } });
    return Response.json({ name, email, role, password });
  }, true);
}

const Toggle = z.object({ id: z.uuid(), active: z.boolean() });

export async function PATCH(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Toggle.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Team member missing.");
    if (parsed.data.id === staff.id) return fail("You can't deactivate yourself.");
    const { error } = await db().from("staff_users").update({ active: parsed.data.active }).eq("id", parsed.data.id).eq("venue_id", staff.venueId).neq("role", "owner");
    if (error) throw error;
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: parsed.data.active ? "staff_activated" : "staff_deactivated", detail: { staff: parsed.data.id } });
    return Response.json({ ok: true });
  }, true);
}
