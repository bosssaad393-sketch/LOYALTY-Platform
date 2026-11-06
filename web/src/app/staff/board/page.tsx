import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { brandName } from "@/lib/brand";
import { currentStaff } from "@/lib/staffAuth";
import Board from "./Board";

export function generateMetadata(): Metadata {
  return { title: `${brandName()} Tables` };
}

// Reads the staff session cookie on every request.
export const instant = false;

export default async function BoardPage() {
  await connection();
  const staff = await currentStaff("staff");
  if (!staff) redirect("/staff");
  return <Board venue={staff.venueName} />;
}
