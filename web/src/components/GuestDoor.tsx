import type { CSSProperties, ReactNode } from "react";
import "./door.css";

/** The first page behind a QR code: the venue's logo, one line, and a short column of big buttons. */
export default function GuestDoor({ venueName, venueSlug, line, children }: { venueName: string; venueSlug: string; line?: string; children: ReactNode }) {
  return (
    <div className="door">
      <header className="door-head rv" style={{ "--i": 0 } as CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
        <img className="door-crest" src={`/venues/${venueSlug}/crest.png`} alt="" width={160} height={160} />
        <h1 className="door-name">{venueName}</h1>
        {line && <p className="door-line">{line}</p>}
      </header>
      {children}
    </div>
  );
}

export function DoorButtons({ children, i = 1 }: { children: ReactNode; i?: number }) {
  return <nav className="door-btns rv" style={{ "--i": i } as CSSProperties}>{children}</nav>;
}

const ICONS: { name: string; d: string; stroke?: boolean }[] = [
  { name: "Instagram", stroke: true, d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM17.3 6.7h.01" },
  { name: "TikTok", d: "M14.5 3h2.6c.2 1.9 1.4 3.4 3.4 3.7v2.7c-1.3 0-2.5-.4-3.5-1.1v6.5a5.3 5.3 0 1 1-5.3-5.3c.3 0 .6 0 .8.1v2.8a2.6 2.6 0 1 0 1.9 2.5V3z" },
  { name: "YouTube", d: "M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12c0 1.6.1 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.3-1.6.4-3.2.4-4.8s-.1-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" },
  { name: "X", d: "M17.7 3h3.1l-6.8 7.7L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.2-8.3L1.7 3h6.4l4.4 5.9L17.7 3zm-1.1 16.1h1.7L7.2 4.8H5.4l11.2 14.3z" },
  { name: "Facebook", d: "M13.6 21v-7.2h2.5l.4-3h-2.9V8.9c0-.9.3-1.5 1.5-1.5h1.5V4.7c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.2v3h2.5V21h2.9z" },
];

/** "Follow us": the icons only. They are not links until the venue's accounts are set. */
export function FollowRow({ label, i = 3 }: { label: string; i?: number }) {
  return (
    <section className="door-follow rv" style={{ "--i": i } as CSSProperties} aria-label={label}>
      <h2 className="door-label">{label}</h2>
      <div className="door-icons">
        {ICONS.map((ic) => (
          <span key={ic.name} className="door-icon" role="img" aria-label={ic.name} title={ic.name}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill={ic.stroke ? "none" : "currentColor"} stroke={ic.stroke ? "currentColor" : "none"} strokeWidth={ic.stroke ? 1.7 : 0} strokeLinecap="round" strokeLinejoin="round"><path d={ic.d} /></svg>
          </span>
        ))}
      </div>
    </section>
  );
}
