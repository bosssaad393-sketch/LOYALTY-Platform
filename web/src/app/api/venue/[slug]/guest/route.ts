import { readWifiBySlug } from "@/lib/venueWifi";

/**
 * Public: what the venue's guest page (its own site, e.g. spaloon-guest-preview.vercel.app) shows that the owner sets
 * here. Today only the guest Wi-Fi. Read only, no cookies, open to any site (CORS *) because the guest page is public
 * and so is this. Cached for a minute.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return Response.json({ error: "Not found." }, { status: 404, headers: CORS });
  const wifi = await readWifiBySlug(slug);
  if (!wifi) return Response.json({ error: "Not found." }, { status: 404, headers: CORS });
  return Response.json(
    { wifi: wifi.name ? { name: wifi.name, password: wifi.password } : null },
    { headers: { ...CORS, "cache-control": "public, max-age=60, s-maxage=60" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
