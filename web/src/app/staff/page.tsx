import type { Metadata } from "next";
import { currentStaff } from "@/lib/staffAuth";
import { loginLook } from "@/lib/loginStyle";
import { brandName, brandProps } from "@/lib/brand";
import { appIcons } from "@/lib/appIcons";
import { getLocale } from "next-intl/server";
import StaffApp from "./StaffApp";

export function generateMetadata(): Metadata {
  const title = `${brandName()} Staff`;
  return { title, manifest: "/staff.webmanifest", icons: { apple: appIcons(brandProps().slug).apple }, appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" } };
}

// Reads the staff session cookie on every request.
export const instant = false;

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const { look } = await searchParams;
  const staff = await currentStaff("staff");
  const lang = (await getLocale()) === "ar" ? "ar" : "en";
  return <StaffApp lang={lang} brand={brandProps()} look={loginLook("staff", look)} initialMe={staff ? { name: staff.name, role: staff.role, venue: staff.venueName } : null} />;
}
