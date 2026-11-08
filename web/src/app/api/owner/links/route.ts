import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { LinksInput, readLinks, saveLinks } from "@/lib/venueLinks";

/** The venue's Instagram and Google review links, shown on the guest home page. */
export async function GET() {
  return withOwner(async (staff) => Response.json(await readLinks(staff.venueId)));
}

/** Owner only. Empty = hide that link. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = LinksInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Use the full link: an instagram.com page, and the Google review link from your Google Business profile.");
    return Response.json(await saveLinks(staff, parsed.data));
  }, true);
}
