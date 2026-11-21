import { brandColors, brandName, brandProps } from "@/lib/brand";
import { appIcons } from "@/lib/appIcons";

// The owner app's "install to home screen" file. Name and colours come from the client's settings (src/lib/brand.ts).
export function GET() {
  const name = `${brandName()} Owner`;
  const { bg } = brandColors();
  const icon = appIcons(brandProps().slug);
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
        { src: icon.i192, sizes: "192x192", type: "image/png" },
        { src: icon.i512, sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
