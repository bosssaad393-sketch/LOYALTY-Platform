import { bahrainDayStart, DAY, withOwner } from "@/lib/ownerApi";
import { serviceReport } from "@/lib/table/db";

const RANGES: Record<string, number> = { today: 1, "7d": 7, "30d": 30 };

/** Wait times and sales for today, 7 days or 30 days (Bahrain calendar days). */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    const asked = new URL(request.url).searchParams.get("range") ?? "7d";
    const range = asked in RANGES ? asked : "7d";
    const since = new Date(bahrainDayStart() - (RANGES[range] - 1) * DAY).toISOString();
    return Response.json({ range, ...(await serviceReport(staff.venueId, since)) });
  });
}
