/** Crest, spaced foil name and a short title: the top of every guest page, matching the member card. */
export default function VenueHeader({
  venueName,
  venueSlug,
  eyebrow,
  title,
  sub,
}: {
  venueName: string;
  venueSlug: string;
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <header className="vh">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
      <img className="vh-crest" src={`/venues/${venueSlug}/crest.png`} alt={venueName} width={96} height={96} />
      <div className="vh-brand foil">{venueName}</div>
      <div className="rc-rule" />
      <div className="rc-tag">{eyebrow}</div>
      <h1 className="vh-title">{title}</h1>
      {sub && <p className="vh-sub">{sub}</p>}
    </header>
  );
}
