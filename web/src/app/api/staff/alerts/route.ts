import { currentStaff } from "@/lib/staffAuth";
import { alertFor } from "@/lib/staffPush";

/**
 * What a woken device shows: one line on what is waiting at this person's venue. Read with the device's own sign-in,
 * so a device that is no longer signed in learns nothing (it shows a plain "open the board" instead).
 */
export async function GET() {
  const staff = (await currentStaff("staff")) ?? (await currentStaff("owner"));
  if (!staff) return new Response(null, { status: 401 });
  return Response.json(await alertFor(staff), { headers: { "cache-control": "no-store" } });
}
