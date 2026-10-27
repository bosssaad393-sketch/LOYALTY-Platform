import type { Metadata } from "next";
import { currentStaff } from "@/lib/staffAuth";
import { loginLook } from "@/lib/loginStyle";
import { brandName, brandProps } from "@/lib/brand";
import StaffApp from "./StaffApp";

export function generateMetadata(): Metadata {
  const title = `${brandName()} Staff`;
  return { title, manifest: "/staff.webmanifest", appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" } };
}

// Reads the staff session cookie on every request.
export const instant = false;

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const { look, mock, signedout } = await searchParams;
  // DEVELOPMENT-ONLY demo (same two guards as the owner screen): fake data with ?mock=1. Never in production.
  if (process.env.NODE_ENV !== "production" && mock === "1") {
    return <StaffApp brand={brandProps()} look={loginLook("staff", look)} mock initialMe={signedout === "1" ? null : { name: "Ahmed", role: "staff", venue: brandName() }} />;
  }
  const staff = await currentStaff();
  return <StaffApp brand={brandProps()} look={loginLook("staff", look)} initialMe={staff ? { name: staff.name, role: staff.role, venue: staff.venueName } : null} />;
}
