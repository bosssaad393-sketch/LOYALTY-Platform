import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { WifiInput, readWifi, saveWifi } from "@/lib/venueWifi";

/** The guest Wi-Fi shown on the guest page. */
export async function GET() {
  return withOwner(async (staff) => Response.json(await readWifi(staff.venueId)));
}

/** Owner only. Empty name = no Wi-Fi button on the guest page. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = WifiInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the Wi-Fi name (up to 64 characters) and password (up to 128).");
    return Response.json(await saveWifi(staff, parsed.data));
  }, true);
}
