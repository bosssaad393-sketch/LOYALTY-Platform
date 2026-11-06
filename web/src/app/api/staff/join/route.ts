import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { generatePin, setPin } from "@/lib/pin";
import { MAX_WAITING, joinedEvent, readInvite, waitingIds } from "@/lib/teamInvite";

const Input = z.object({ token: z.string().min(10).max(300), name: z.string().trim().min(2).max(60) });

/** A new team member adds themselves from the owner's join link. They cannot sign in until the owner approves them. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your name.");
  const venueId = readInvite(parsed.data.token);
  if (!venueId) return fail("This link has run out. Ask the owner for a new one.", 410);
  try {
    if ((await waitingIds(venueId)).size >= MAX_WAITING) return fail("Too many people are waiting. Ask the owner to approve them first.", 429);
    const { name } = parsed.data;
    const { data, error } = await db().from("staff_users").insert({ venue_id: venueId, name, role: "staff", active: false }).select("id").single();
    if (error || !data) throw error ?? new Error("insert failed");
    const id = data.id as string;
    // Always a random PIN: letting a stranger choose one would tell them which PINs are already in use.
    let pin = "";
    for (let i = 0; i < 5 && !pin; i++) {
      pin = generatePin("staff");
      if ((await setPin(venueId, id, pin, "join-link")) !== true) pin = "";
    }
    if (!pin) {
      await db().from("staff_users").delete().eq("id", id).eq("venue_id", venueId);
      throw new Error("could not make a free PIN");
    }
    await db().from("audit_log").insert(joinedEvent(venueId, id, name));
    return Response.json({ name, pin }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("team join failed", err instanceof Error ? err.message : err);
    return fail("Something went wrong. Please try again.", 500);
  }
}
