import { withDeveloper } from "@/lib/devApi";
import { cardDesignStatus, sendCardDesign } from "@/lib/cardDesign";

const noStore = { headers: { "cache-control": "no-store" } };

/** How many Wallet cards guests have saved, and when the card was last sent to them. */
export async function GET() {
  return withDeveloper(async (staff) => Response.json(await cardDesignStatus(staff.venueId), noStore));
}

/** Sends the card as it is built now (picture, colours, wording, place) to every saved card of this business. */
export async function POST() {
  return withDeveloper(async (staff) => Response.json(await sendCardDesign(staff.venueId, staff.id), noStore));
}
