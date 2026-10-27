import type { Metadata } from "next";
import { currentStaff } from "@/lib/staffAuth";
import { loginLook } from "@/lib/loginStyle";
import { brandName, brandProps } from "@/lib/brand";
import OwnerApp from "./OwnerApp";
import type { Me, Tab } from "./types";

export function generateMetadata(): Metadata {
  const title = `${brandName()} Owner`;
  return { title, manifest: "/owner.webmanifest", appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" } };
}

// Reads the session cookie on every request.
export const instant = false;

const TABS: Tab[] = ["overview", "guests", "rules", "offers", "assistant", "team", "privacy"];

export default async function OwnerPage(props: PageProps<"/owner">) {
  const q = await props.searchParams;
  const look = loginLook("owner", q.look);
  const brand = brandProps();
  // DEVELOPMENT-ONLY mock (guard 1 of 2, api.ts holds the other): fake data when the address has ?mock=1.
  // Never in production: it would show invented numbers to a real owner. Optional: &role=manager and &tab=offers.
  if (process.env.NODE_ENV !== "production" && q.mock === "1") {
    const role = q.role === "manager" ? "manager" : "owner";
    const me: Me = { name: role === "owner" ? "Demo owner" : "Reem", role, venue: brandName() };
    const tab = TABS.find((t) => t === q.tab) ?? "overview";
    return <OwnerApp initialMe={q.signedout === "1" ? null : me} mock initialTab={tab} look={look} brand={brand} />;
  }
  const staff = await currentStaff();
  return <OwnerApp initialMe={staff ? { name: staff.name, role: staff.role, venue: staff.venueName } : null} look={look} brand={brand} />;
}
