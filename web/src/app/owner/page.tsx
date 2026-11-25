import type { Metadata } from "next";
import { currentStaff } from "@/lib/staffAuth";
import { loginLook } from "@/lib/loginStyle";
import { brandName, brandProps } from "@/lib/brand";
import { appIcons } from "@/lib/appIcons";
import { sampleNote } from "@/lib/demo";
import { getLocale } from "next-intl/server";
import { isStampVenue, isVisitVenue } from "@/lib/venueKind";
import OwnerApp from "./OwnerApp";

export function generateMetadata(): Metadata {
  const title = `${brandName()} Owner`;
  return { title, manifest: "/owner.webmanifest", icons: { apple: appIcons(brandProps().slug).apple }, appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" } };
}

// Reads the session cookie on every request.
export const instant = false;

export default async function OwnerPage(props: PageProps<"/owner">) {
  const q = await props.searchParams;
  const look = loginLook("owner", q.look);
  const brand = brandProps();
  const staff = await currentStaff("owner");
  const lang = (await getLocale()) === "ar" ? "ar" : "en";
  const [stampVenue, visitVenue] = await Promise.all([isStampVenue(brand.slug), isVisitVenue(brand.slug)]);
  return <OwnerApp lang={lang} stampVenue={stampVenue} visitVenue={visitVenue} initialMe={staff ? { name: staff.name, role: staff.role, venue: staff.venueName } : null} look={look} brand={brand} sample={sampleNote()} />;
}
