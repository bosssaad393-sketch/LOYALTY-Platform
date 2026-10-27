import { brandColors, brandName } from "@/lib/brand";

// The owner app's "install to home screen" file. Name and colours come from the client's settings (src/lib/brand.ts).
export function GET() {
  const name = `${brandName()} Owner`;
  const { bg } = brandColors();
  return Response.json(
    {
      name,
      short_name: name,
      start_url: "/owner",
      scope: "/owner",
      display: "standalone",
      background_color: bg,
      theme_color: bg,
      icons: [
        { src: "/staff-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/staff-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
