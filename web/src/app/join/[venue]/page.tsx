import { notFound } from "next/navigation";
import { getVenue } from "@/lib/supabase";
import VenueHeader from "@/components/VenueHeader";
import { footerLine } from "@/lib/brand";
import JoinForm from "./JoinForm";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

export default async function JoinPage({ params }: PageProps<"/join/[venue]">) {
  const { venue: slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();

  return (
    <>
    <main className="app">
      <VenueHeader
        venueName={venue.name}
        venueSlug={venue.slug}
        eyebrow="Membership"
        title={`Join ${venue.name} Rewards`}
        sub="Your personal card, kept in your phone's Wallet. Nothing to download."
      />
      <JoinForm venue={venue.slug} venueName={venue.name} />
      <p className="foot">{footerLine(venue.name)}</p>
    </main>
    </>
  );
}
