"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";

type Props = {
  venueName: string;
  venueSlug: string;
  memberName: string;
  since?: string; // e.g. "October 2026"
  points: number;
  goal: number;
  code: string;
  qr: string; // data URL of the till QR
  rewardText: string;
};

const NOTCHES = 20;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Long names get a smaller size; very long ones show first and last name only. */
function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  const short = name.length > 26 && parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : name.trim();
  const size = short.length > 20 ? "xl" : short.length > 14 ? "l" : "";
  return { short, size };
}

/**
 * The member's card: a matte black credential with a gilded double frame, foil lettering,
 * light that follows a finger, and a cream ticket slip carrying the till QR and code.
 */
export default function FoilCard({ venueName, venueSlug, memberName, since, points, goal, code, qr, rewardText }: Props) {
  const card = useRef<HTMLElement>(null);
  const lit = Math.min(NOTCHES, Math.floor((points / goal) * NOTCHES));
  const ready = points >= goal;
  const icon = `/venues/${venueSlug}/icon.png`;
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
    <section
      ref={card}
      className="rc"
      style={{ "--ground": `url(${icon})`, "--tex": `url(/venues/${venueSlug}/texture.jpg)` } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={leave}
      aria-label={`${venueName} membership card`}
    >
      <div className="rc-ground" /><div className="rc-ground b" /><div className="rc-hl" /><div className="rc-frame" />

      <header className="rc-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
        <img className="rc-crest" src={icon} alt="" width={44} height={44} />
        <div className="rc-brand foil">{venueName}</div>
        <div className="rc-rule" />
        <div className="rc-tag">Member</div>
      </header>

      <div className={`rc-name ${name.size} ${arabic ? "ar" : ""}`} dir="auto" lang={arabic ? "ar" : undefined} title={memberName}>{name.short}</div>
      {since && <div className="rc-since">Since {since}</div>}

      <div className="rc-pts"><b className="foil">{points}</b><span>Points</span></div>
      <div className="rc-notches" aria-hidden="true">
        {Array.from({ length: NOTCHES }, (_, i) => <i key={i} className={i < lit ? "on" : ""} />)}
      </div>
      <div className="rc-notes"><span>0</span><span>{ready ? "Reward ready" : `${goal - points} to your reward`}</span><span>{goal}</span></div>
      {ready && <p className="rc-ready">{rewardText}. Show your code to the staff.</p>}

      <div className="rc-slip">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR code */}
        <img className="rc-qr" src={qr} alt={`QR code for card ${code}`} />
        <div className="rc-id">
          <small>Your code</small>
          <b>{code}</b>
          <span>Show this at the till</span>
        </div>
      </div>
    </section>
  );
}
