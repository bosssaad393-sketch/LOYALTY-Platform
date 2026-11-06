import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { readInvite } from "@/lib/teamInvite";
import JoinTeam from "./JoinTeam";

// Checks the link against the clock and the database on every request.
export const instant = false;

export const metadata: Metadata = { title: "Join the team", robots: { index: false } };

/** The page behind the owner's team join link. No sign-in needed. */
export default async function JoinTeamPage({ params }: PageProps<"/staff/join/[invite]">) {
  const { invite: token } = await params;
  await connection(); // the expiry check reads the clock, so this always runs per request
  const venueId = readInvite(token);
  const { data: venue } = venueId
    ? await db().from("venues").select("slug, name").eq("id", venueId).maybeSingle()
    : { data: null };
  return <JoinTeam token={token} venue={venue ? { slug: venue.slug as string, name: venue.name as string } : null} />;
}
