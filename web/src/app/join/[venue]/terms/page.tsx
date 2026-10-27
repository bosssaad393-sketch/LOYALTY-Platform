import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getVenue } from "@/lib/supabase";
import { customTermsFor } from "@/lib/termsDb";
import { defaultClauses, parseTerms } from "@/lib/terms";
import VenueHeader from "@/components/VenueHeader";
import { footerLine } from "@/lib/brand";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

export default async function TermsPage({ params }: PageProps<"/join/[venue]/terms">) {
  const { venue: slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();
  const n = venue.name;

  // The venue's own terms when the owner saved them, otherwise the built-in clauses.
  const custom = await customTermsFor(venue.id);
  const clauses = custom ? parseTerms(custom) : defaultClauses(n);

  return (
    <main className="app">
      <VenueHeader venueName={n} venueSlug={venue.slug} eyebrow={`${n} Loyalty Rewards`} title="Terms & Conditions" />
      <section className="pane" style={{ "--tex": `url(/venues/${venue.slug}/texture.jpg)` } as CSSProperties}>
        {custom ? null : <p className="note" style={{ textAlign: "left" }}>Draft text, to be replaced by {n}&apos;s final terms.</p>}
        <ol className="clauses">
          {clauses.map(([title, text], i) => (
            <li key={i}>
              <span className="cn">{String(i + 1).padStart(2, "0")}</span>
              <div>{title ? <b>{title}</b> : null}<p>{text}</p></div>
            </li>
          ))}
        </ol>
        <a className="btn" href={`/join/${venue.slug}`}>Back</a>
      </section>
      <p className="foot">{footerLine(n)}</p>
    </main>
  );
}
