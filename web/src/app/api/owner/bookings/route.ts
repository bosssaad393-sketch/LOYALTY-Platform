import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { bookingsOn, decideBooking, listBookings, setBookingsOn } from "@/lib/bookingsDb";

/** The venue's booking requests from now on, and whether guests can send them. Owner and manager. */
export async function GET() {
  return withOwner(async (staff) => {
    const [on, bookings] = await Promise.all([bookingsOn(staff.venueId), listBookings(staff.venueId)]);
    return Response.json({ on, bookings, waiting: bookings.filter((b) => b.status === "pending").length });
  });
}

const Input = z.union([
  z.object({ on: z.boolean() }),
  z.object({ id: z.uuid(), status: z.enum(["confirmed", "declined"]), reply: z.string().trim().max(200).optional().default("") }),
]);

/** Answer a request (owner or manager), or switch booking requests on or off (owner). */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Choose a request and an answer.");
  const input = parsed.data;
  if ("on" in input) {
    return withOwner(async (staff) => {
      await setBookingsOn(staff, input.on);
      return Response.json({ on: input.on });
    }, true);
  }
  return withOwner(async (staff) => {
    const ok = await decideBooking(staff, input.id, input.status, input.reply || null);
    return ok ? Response.json({ ok: true }) : fail("That request is no longer open. The guest may have cancelled it.", 409);
  });
}
