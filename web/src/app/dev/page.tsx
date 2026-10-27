import type { Metadata } from "next";
import { currentStaff } from "@/lib/staffAuth";
import { loginLook } from "@/lib/loginStyle";
import { brandName, brandProps } from "@/lib/brand";
import DevApp from "./DevApp";

export function generateMetadata(): Metadata {
  return { title: `${brandName()} Developer`, robots: { index: false, follow: false } };
}

// Reads the session cookie on every request.
export const instant = false;

export default async function DevPage(props: PageProps<"/dev">) {
  const q = await props.searchParams;
  const staff = await currentStaff();
  return <DevApp initialMe={staff ? { name: staff.name, role: staff.role, venue: staff.venueName } : null} look={loginLook("owner", q.look)} brand={brandProps()} />;
}
