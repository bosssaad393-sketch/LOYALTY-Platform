import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { PointsRangeInput } from "@/lib/pointsSummary";
import { pointsSummaryFor } from "@/lib/pointsSummaryDb";

/** Points given out and spent over today, 7 days, 30 days or all time, with a per-day list. Owner and manager. Read only. */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    // A missing range means 7d; anything that is not one of the four is an error, not a silent default.
    const parsed = PointsRangeInput.safeParse(new URL(request.url).searchParams.get("range") ?? undefined);
    if (!parsed.success) return fail("Choose a range: today, 7d, 30d or all.");
    return Response.json(await pointsSummaryFor(staff.venueId, parsed.data));
  });
}
