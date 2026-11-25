import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { AutoMessageInput, readAutoMessages, saveAutoMessage } from "@/lib/autoMessagesDb";

/** The two automatic notices: birthday, and "we miss you" after N days without a visit. */
export async function GET() {
  return withOwner(async (staff) => Response.json(await readAutoMessages(staff.venueId)));
}

/** Owner only. {name} in the text becomes the guest's first name. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = AutoMessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the message (up to 200 characters) and the number of days (1 to 365).");
    return Response.json(await saveAutoMessage(staff, parsed.data));
  }, true);
}
