"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

type Props = {
  venueName: string;
  venueSlug: string;
  memberName: string;
  since?: string; // e.g. "10/26"
  points: number;
  goal: number;
  code: string;
  qr: string; // data URL of the till QR
};

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** Long names get a smaller size; very long ones show first and last name only. */
function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  const short = name.length > 26 && parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : name.trim();
  const size = short.length > 16 ? "xl" : short.length > 10 ? "l" : "";
  return { short, size };
}

/**
 * The member's card as a premium black credit card: black marble with gold-leaf veins, the crest on a gold plate,
 * the venue name in gold lettering, the code in raised gold digits, the name, the points and the till QR.
 * Everything scales with the card width (container query units), so it looks the same on any phone.
 */
export default function BlackCard({ venueName, venueSlug, memberName, since, points, goal, code, qr }: Props) {
  const card = useRef<HTMLElement>(null);
  const [noCrest, setNoCrest] = useState(false);
  const ready = points >= goal;
  const pct = Math.max(0, Math.min(100, Math.round((points / goal) * 100)));
  const name = displayName(memberName);
  const arabic = ARABIC.test(memberName);

  function move(e: PointerEvent<HTMLElement>) {
    const el = card.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
    el.style.setProperty("--hl", "1");
  }
  function leave() {
    card.current?.style.setProperty("--hl", "0");
  }

  return (
    <div className="bc-wrap">
      <section
        ref={card}
        className="bc"
        style={{ "--marble": `url(/venues/${venueSlug}/marble.jpg)` } as CSSProperties}
        onPointerMove={move}
        onPointerLeave={leave}
        aria-label={`${venueName} membership card`}
      >
        <div className="bc-glow" />
        <div className="bc-hl" />

        <div className="bc-plate">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
          <img src={`/venues/${venueSlug}/icon.png`} alt="" width={30} height={30} />
        </div>
        {noCrest ? (
          <div className={`bc-brand foil ${venueName.length > 16 ? "s" : venueName.length > 8 ? "m" : ""}`}>{venueName}</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the venue's own logo lockup
          <img className="bc-crest" src={`/venues/${venueSlug}/crest.png`} alt={venueName} onError={() => setNoCrest(true)} />
        )}
        <div className="bc-tag">Member</div>

        <div className="bc-codel">Your code</div>
        <div className="bc-code foil">{code}</div>

        <div className={`bc-name ${name.size} ${arabic ? "ar" : ""}`} dir="auto" lang={arabic ? "ar" : undefined} title={memberName}>{name.short}</div>
        {since && <div className="bc-since">Member since {since}</div>}

        <div className="bc-pts"><b className="foil">{points}</b><span>{ready ? "Reward ready" : "Points"}</span></div>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR code */}
        <img className="bc-qr" src={qr} alt={`QR code for card ${code}`} />

        <div className="bc-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      </section>
    </div>
  );
}
