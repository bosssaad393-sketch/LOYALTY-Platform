import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withDeveloper } from "@/lib/devApi";
import { generateKey, posStatus, setPosStatus } from "@/lib/pos/connector";

/** The POS connection of the signed-in developer's business: status, the last events, and the key. */
export async function GET() {
  return withDeveloper(async (staff) => {
    const s = await posStatus(staff);
    const base = process.env.PUBLIC_BASE_URL ?? "";
    return Response.json({ ...s, endpoint: `${base}/api/pos/events` }, { headers: { "cache-control": "no-store" } });
  });
}

/** Makes a new key (the old one stops working). The key is shown in this one answer only. */
export async function POST() {
  return withDeveloper(async (staff) => Response.json(await generateKey(staff), { headers: { "cache-control": "no-store" } }));
}

const Toggle = z.object({ status: z.enum(["active", "disabled"]) });

export async function PATCH(request: Request) {
  return withDeveloper(async (staff) => {
    const parsed = Toggle.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose active or disabled.");
    return (await setPosStatus(staff, parsed.data.status)) ? Response.json({ status: parsed.data.status }) : fail("Make a key first.", 404);
  });
}
