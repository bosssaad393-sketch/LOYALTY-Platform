import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { generatePin, pinProblem, roleOf, setPin } from "@/lib/pin";

const Input = z.object({ id: z.uuid(), pin: z.string().max(8).optional() });

/** Owner sets or resets a team member's PIN (or their own). Without a PIN in the request a random one is made. The PIN is shown once. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Team member missing.");
    const role = await roleOf(staff.venueId, parsed.data.id);
    if (!role) return fail("That person is not on your team.", 404);
    if (role === "developer") return fail("That person is not on your team.", 404);
    if (role === "owner" && parsed.data.id !== staff.id) return fail("Only the owner can change the owner's PIN.", 403);
    const pin = parsed.data.pin?.trim() || generatePin(role);
    const problem = pinProblem(pin, role);
    if (problem) return fail(problem);
    const r = await setPin(staff.venueId, parsed.data.id, pin, staff.id);
    if (r === "taken") return fail("That PIN is already in use. Choose another.", 409);
    if (!r) return fail("That person is not on your team.", 404);
    return Response.json({ pin }, { headers: { "cache-control": "no-store" } });
  }, true);
}
