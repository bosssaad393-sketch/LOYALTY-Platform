import type { Metadata } from "next";
import { currentStaff } from "@/lib/staffAuth";
import { loginLook } from "@/lib/loginStyle";
import { brandName, brandProps } from "@/lib/brand";
import DevApp, { type Section } from "./DevApp";
import type { Me } from "../owner/types";

export function generateMetadata(): Metadata {
  return { title: `${brandName()} Developer`, robots: { index: false, follow: false } };
}

// Reads the session cookie on every request.
export const instant = false;

export default async function DevPage(props: PageProps<"/dev">) {
  const q = await props.searchParams;
  const look = loginLook("owner", q.look);
  const brand = brandProps();
  // ?section=screens opens a section directly (handy for review links). Unknown values fall back to the overview.
  const SECTIONS: Section[] = ["overview", "screens", "till", "requests", "calabos", "access"];
  const initialSection = SECTIONS.find((s) => s === q.section) ?? "overview";
  // DEVELOPMENT-ONLY mock (same two guards as the owner screen): fake data when the address has ?mock=1. Never in production.
  if (process.env.NODE_ENV !== "production" && q.mock === "1") {
    const me: Me = { name: "Demo developer", role: "developer", venue: brandName() };
    return <DevApp initialMe={me} mock look={look} brand={brand} initialSection={initialSection} />;
  }
  const staff = await currentStaff("dev");
  return <DevApp initialMe={staff ? { name: staff.name, role: staff.role, venue: staff.venueName } : null} look={look} brand={brand} initialSection={initialSection} />;
}
