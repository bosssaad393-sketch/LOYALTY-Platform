import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withDeveloper } from "@/lib/devApi";
import { generatePin, pinProblem, roleOf, setPin } from "@/lib/pin";

const Input = z.object({ staffId: z.uuid(), pin: z.string().max(8).optional() });

/** Developer sets the first PIN for a person of the client's business (for example the owner's), or resets it. Shown once. */
export async function POST(request: Request) {
  return withDeveloper(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Person missing.");
    const role = await roleOf(staff.venueId, parsed.data.staffId);
    if (!role || role === "developer") return fail("That person is not in this business.", 404);
    const pin = parsed.data.pin?.trim() || generatePin(role);
    const problem = pinProblem(pin, role);
    if (problem) return fail(problem);
    const r = await setPin(staff.venueId, parsed.data.staffId, pin, staff.id);
    if (r === "taken") return fail("That PIN is already in use. Choose another.", 409);
    if (!r) return fail("That person is not in this business.", 404);
    return Response.json({ pin }, { headers: { "cache-control": "no-store" } });
  });
}
