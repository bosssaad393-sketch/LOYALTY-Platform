import { getVenue } from "@/lib/supabase";
import { venueContact, vcard } from "@/lib/contact";
import { kitBase } from "@/lib/table/qrKit";
import { readLinks } from "@/lib/venueLinks";

/** "Save Contact": the venue's contact card as a .vcf file, which a phone opens in its own "add contact" screen. */
export async function GET(request: Request, { params }: RouteContext<"/api/contact/[venue]">) {
  const { venue: slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return new Response("Not found", { status: 404 });
  const venue = await getVenue(slug);
  if (!venue) return new Response("Not found", { status: 404 });
  const h = request.headers;
  const base = kitBase(process.env.PUBLIC_BASE_URL, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const { instagram } = await readLinks(venue.id);
  return new Response(vcard(venue.name, venueContact(), base, instagram), {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.vcf"`,
      "cache-control": "no-store",
    },
  });
}
