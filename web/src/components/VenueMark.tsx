/**
 * The venue's mark. Normally its crest file (public/venues/<slug>/crest.png). With BRAND_MARK=type (no clean logo
 * file yet) the venue name is set in the brand serif, spaced capitals inside a thin frame: a stand-in that never
 * pretends to be the real logo, and is replaced by putting the logo file in place and removing the setting.
 */
export default function VenueMark({ name, slug, type, className = "", size = 160 }: { name: string; slug: string; type?: boolean; className?: string; size?: number }) {
  if (type) {
    return (
      <span className={`vm ${className}`} role="img" aria-label={name}>
        <b aria-hidden="true">{name}</b>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- small static brand mark
  return <img className={className} src={`/venues/${slug}/crest.png`} alt={name} width={size} height={size} />;
}
