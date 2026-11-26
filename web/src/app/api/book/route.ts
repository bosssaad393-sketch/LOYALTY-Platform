import { cookies } from "next/headers";
import { getVenue } from "@/lib/supabase";
import { allowed, LIMITS } from "@/lib/rateLimitDb";
import { BookingInput, bookingMoment, bookingWindow } from "@/lib/bookings";
import { bookingsOn, createBooking } from "@/lib/bookingsDb";
import { GUEST_CARD_COOKIE, guestCardFrom, venueCard } from "@/lib/table/points";

/** A guest asks for a table. No sign-in. The answer is the key to their own request, kept on their phone. */
export async function POST(request: Request) {
  const parsed = BookingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "incomplete", error: "Please fill in the day, the time, how many people, your name and your mobile number." }, { status: 400 });
  const input = parsed.data;
  try {
    const venue = await getVenue(input.venue);
    if (!venue || !(await bookingsOn(venue.id))) return Response.json({ code: "closed", error: "This venue does not take booking requests here." }, { status: 404 });
    if (!(await allowed(LIMITS.bookPerCaller(request.headers), LIMITS.bookPerVenue(venue.id)))) {
      return Response.json({ code: "too_many", error: "Too many requests from here. Please wait a few minutes, or call us." }, { status: 429 });
    }
    const at = bookingMoment(input.date, input.time);
    if (!at) return Response.json({ code: "bad_time", error: "That day or time doesn't look right." }, { status: 400 });
    const when = bookingWindow(at);
    if (when === "too_soon") return Response.json({ code: "too_soon", error: "Please choose a time at least 30 minutes from now, or call us." }, { status: 400 });
    if (when === "too_far") return Response.json({ code: "too_far", error: "Please choose a day in the next 60 days." }, { status: 400 });
    // A phone that holds a card of this venue: the request is tied to that member, so the venue sees it is a member.
    const jar = await cookies();
    const held = jar.get(GUEST_CARD_COOKIE)?.value;
    const cardId = held ? guestCardFrom(`${GUEST_CARD_COOKIE}=${held}`) : null;
    const card = cardId ? await venueCard(venue.id, cardId).catch(() => null) : null;
    const token = await createBooking(venue.id, input, at, card?.id ?? null);
    return Response.json({ token }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("booking failed", err instanceof Error ? err.message : err);
    return Response.json({ code: "server", error: "Something went wrong. Please try again, or call us." }, { status: 500 });
  }
}
