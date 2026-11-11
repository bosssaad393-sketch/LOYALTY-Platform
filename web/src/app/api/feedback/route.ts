import { getVenue } from "@/lib/supabase";
import { addFeedback } from "@/lib/feedback";
import { FeedbackInput } from "@/lib/feedbackRules";
import { LIMITS, allowed } from "@/lib/rateLimitDb";
import { guestCardFrom, venueCard } from "@/lib/table/points";

const no = (code: string, status: number) => Response.json({ code }, { status });

/** Feedback from the counter page. Members only: the phone must remember a card of this venue. */
export async function POST(request: Request) {
  const parsed = FeedbackInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return no("invalid", 400);
  const venue = await getVenue(parsed.data.venue);
  if (!venue) return no("not_found", 404);
  const cardId = guestCardFrom(request.headers.get("cookie"));
  const card = cardId ? await venueCard(venue.id, cardId) : null;
  if (!card) return no("members_only", 403);
  if (!(await allowed(LIMITS.feedbackPerCard(card.id), LIMITS.feedbackPerCaller(request.headers)))) return no("too_many", 429);
  await addFeedback(venue.id, card.id, parsed.data.rating, parsed.data.message);
  return Response.json({ ok: true });
}
