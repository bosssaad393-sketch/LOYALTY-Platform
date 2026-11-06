import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { generatePin, pinProblem, setPin } from "@/lib/pin";
import { waitingIds } from "@/lib/teamInvite";

export async function GET() {
  return withOwner(async (staff) => {
    const { data, error } = await db().from("staff_users").select("id, name, role, active, pin_lookup").eq("venue_id", staff.venueId).neq("role", "developer").order("created_at");
    if (error) throw error;
    const waiting = await waitingIds(staff.venueId);
    const team = (data ?? []).map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active, hasPin: !!s.pin_lookup, me: s.id === staff.id, waiting: waiting.has(s.id as string) }));
    return Response.json({ team });
  }, true);
}

const Invite = z.object({ name: z.string().trim().min(1).max(60), role: z.enum(["staff", "manager"]), pin: z.string().max(8).optional() });

/** Adds a team member and returns a one-time PIN to hand over in person. No email or password. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Invite.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Enter a name and a role.");
    const { name, role } = parsed.data;
    const chosen = parsed.data.pin?.trim();
    if (chosen) {
      const problem = pinProblem(chosen, role);
      if (problem) return fail(problem);
    }
    const { data, error } = await db().from("staff_users").insert({ venue_id: staff.venueId, name, role, active: true }).select("id").single();
    if (error || !data) throw error ?? new Error("insert failed");
    let pin = "";
    if (chosen) {
      if ((await setPin(staff.venueId, data.id as string, chosen, staff.id)) !== true) {
        await db().from("staff_users").delete().eq("id", data.id as string).eq("venue_id", staff.venueId);
        return fail("That PIN is already in use. Choose another.", 409);
      }
      pin = chosen;
    }
    for (let i = 0; i < 5 && !pin; i++) {
      pin = generatePin(role);
      if ((await setPin(staff.venueId, data.id as string, pin, staff.id)) === true) break;
      pin = "";
    }
    if (!pin) throw new Error("could not make a free PIN");
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "staff_added", detail: { name, role } });
    return Response.json({ name, role, pin }, { headers: { "cache-control": "no-store" } });
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

const Decline = z.object({ id: z.uuid() });

/** Turns down someone waiting for approval and removes them. Only people who joined by link and were never approved. */
export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Decline.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Team member missing.");
    if (!(await waitingIds(staff.venueId)).has(parsed.data.id)) return fail("This person is not waiting for approval.", 404);
    const { error } = await db().from("staff_users").delete().eq("id", parsed.data.id).eq("venue_id", staff.venueId).eq("active", false);
    if (error) throw error;
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "staff_join_declined", detail: { staff: parsed.data.id } });
    return Response.json({ ok: true });
  }, true);
}
