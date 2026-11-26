import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { listTills, removeTill, setTillsLocked, tillCookie, tillsLocked, trustThisDevice } from "@/lib/trustedTills";

/** The venue's tills, whether staff PINs are held to them, and whether the device asking is one. Owner only. */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    const [locked, tills] = await Promise.all([tillsLocked(staff.venueId), listTills(staff.venueId, request.headers.get("cookie"))]);
    return Response.json({ locked, tills }, { headers: { "cache-control": "no-store" } });
  }, true);
}

const Input = z.union([
  z.object({ action: z.literal("trust"), name: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal("remove"), id: z.uuid() }),
  z.object({ action: z.literal("lock"), on: z.boolean() }),
]);

/** Add the device in the owner's hand as a till, remove one, or switch the rule on or off. Owner only. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Give the till a name, for example “Sanad counter”.");
  const input = parsed.data;
  return withOwner(async (staff) => {
    if (input.action === "trust") {
      const key = await trustThisDevice(staff, input.name);
      const res = Response.json({ ok: true });
      res.headers.append("set-cookie", tillCookie(key));
      return res;
    }
    if (input.action === "remove") return (await removeTill(staff, input.id)) ? Response.json({ ok: true }) : fail("That till is not in the list any more.", 404);
    const r = await setTillsLocked(staff, input.on);
    return r === "no_tills" ? fail("Add at least one till first, or no staff member could sign in.", 409) : Response.json({ ok: true, locked: input.on });
  }, true);
}
