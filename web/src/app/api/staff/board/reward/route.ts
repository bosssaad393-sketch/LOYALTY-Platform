import { z } from "zod";
import { fail, refreshWalletCards, withStaff } from "@/lib/staffApi";
import { giveReward, readBoard } from "@/lib/table/db";

const Input = z.object({ requestId: z.uuid() });
const WHY = { not_found: "Already done, or not found.", no_card: "No guest card on this table.", not_enough: "This card no longer has enough points." } as const;

/** Staff confirm a reward a guest asked for from their table: the points come off the card and the call closes. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the request.");
    const r = await giveReward(staff.venueId, parsed.data.requestId, staff.id);
    if (!r.ok) return fail(WHY[r.reason], r.reason === "not_found" ? 404 : 409);
    await refreshWalletCards(r.cardId, r.balance);
    return Response.json(await readBoard(staff.venueId));
  });
}
