import type { CSSProperties, ReactNode } from "react";
import VenueMark from "./VenueMark";

type Labels = { aria: string; code: string; since: string; visits: string; lastVisit: string; noVisit: string; qrAlt: string; show?: string };

type Props = {
  venueName: string;
  venueSlug: string;
  markType?: boolean;
  memberName: string;
  code: string;
  qr: string; // data URL of the till QR
  visits: number;
  labels: Labels;
  /** The venue's own card picture (lib/venueArt.ts). With it the card is the picture and the QR moves under the card. */
  art?: { src: string; lit: string | null; niche: { x: number; y: number; w: number; h: number } } | null;
  /** A gift is waiting: the lit picture is shown. */
  lit?: boolean;
  /** The lamp (lib/lamp.ts): how much of the lit picture shows, 0 to 1. A gift waiting shows all of it. */
  glow?: number;
  /** Shown right under the card picture, above the code: the Add to Wallet button, so it is on the first screen. */
  between?: ReactNode;
};

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * The member's card for a visit venue (migration 0022): no points, no stamps. A flat card in the brand colour with one
 * fine accent frame, the venue mark, the member's code, name and visits, and the till QR on a paper tile. Sizes scale
 * with the card width (container units) but text never goes under 12px. Same layout as the Wallet pass, so the two
 * read as one object.
 */
export default function VisitCard({ venueName, venueSlug, markType, memberName, code, qr, visits, labels, art = null, lit = false, glow = 0, between = null }: Props) {
  const arabic = ARABIC.test(memberName);
  const name = memberName.trim();
  if (art) {
    return (
      <div className="vc-wrap">
        <VisitCardFace venueName={venueName} venueSlug={venueSlug} markType={markType} name={name} since={labels.since} visits={visits} visitsLabel={labels.visits} art={art} lit={lit} glow={glow} aria={labels.aria} />
        {between}
        <section className="vq" aria-label={labels.code}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR code */}
          <img className="vq-qr" src={qr} alt={labels.qrAlt} width={148} height={148} />
          <div className="vq-text">
            <p className="vq-lead">{labels.show ?? labels.code}</p>
            <p className="vq-code"><small>{labels.code}</small><b dir="ltr">{code}</b></p>
            <p className="vq-last">{visits > 0 ? labels.lastVisit : labels.noVisit}</p>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="vc-wrap">
      <section className="vc" aria-label={labels.aria}>
        <div className="vc-top">
          <VenueMark name={venueName} slug={venueSlug} type={markType} className="vc-mark" size={64} />
          <p className="vc-code"><small>{labels.code}</small><b dir="ltr">{code}</b></p>
        </div>
        <div className="vc-foot">
          <div className="vc-who">
            <p className="vc-visits"><b>{visits}</b><small>{labels.visits}</small></p>
            <p className={`vc-name${name.length > 18 ? " long" : ""}${arabic ? " ar" : ""}`} dir="auto" lang={arabic ? "ar" : undefined}>{name}</p>
            <p className="vc-since">{labels.since}</p>
            <p className="vc-since">{visits > 0 ? labels.lastVisit : labels.noVisit}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR code */}
          <img className="vc-qr" src={qr} alt={labels.qrAlt} width={120} height={120} />
        </div>
      </section>
    </div>
  );
}

type FaceProps = {
  venueName: string;
  venueSlug: string;
  markType?: boolean;
  /** The member's name, or the words that stand in for it before joining. */
  name: string;
  /** No name yet: it is drawn dimmer, as an empty line waiting to be filled. */
  empty?: boolean;
  since?: string;
  /** null = nothing in the picture's open space (a guest who has not joined). */
  visits: number | null;
  visitsLabel?: string;
  art: NonNullable<Props["art"]>;
  lit?: boolean;
  /** The lamp: how much of the lit picture shows when no gift is waiting, 0 to 1. */
  glow?: number;
  /** Before joining, when a gift waits behind the first visit: the light comes and goes slowly. */
  breathe?: boolean;
  aria?: string;
};

/** The picture face of the card alone (no QR): the card page and the guest hub draw the same object. */
export function VisitCardFace({ venueName, venueSlug, markType, name, empty, since, visits, visitsLabel, art, lit = false, glow = 0, breathe = false, aria }: FaceProps) {
  const arabic = ARABIC.test(name);
  const n = art.niche;
  // The lamp between dark and fully lit: only meaningful while no gift is waiting and nothing is breathing.
  const ember = !lit && !breathe && art.lit ? Math.min(1, Math.max(0, glow)) : 0;
  return (
    <section className={`vc vca${lit && art.lit ? " lit" : ""}${breathe && art.lit ? " breathe" : ""}`} style={ember ? ({ "--lamp": ember } as CSSProperties) : undefined} aria-label={aria} aria-hidden={aria ? undefined : true}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the card face, a local file sized by the card */}
      <img className="vca-face" src={art.src} alt="" width={1284} height={810} fetchPriority="high" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element -- the same picture with the light on; fades in over the first */}
      {art.lit && (lit || breathe || ember > 0) && <img className="vca-face vca-lit" src={art.lit} alt="" width={1284} height={810} aria-hidden="true" decoding="async" />}
      <div className="vca-shade" aria-hidden="true" />
      <VenueMark name={venueName} slug={venueSlug} type={markType} className="vc-mark vca-mark" size={64} />
      {visits !== null && (
        <p className="vca-count" style={{ insetInlineEnd: `${100 - n.x - n.w}%`, top: `${n.y}%`, width: `${n.w}%`, height: `${n.h}%` }}>
          <b>{visits}</b>
          <small>{visitsLabel}</small>
        </p>
      )}
      <div className="vca-who">
        <p className={`vc-name${name.length > 18 ? " long" : ""}${arabic ? " ar" : ""}${empty ? " empty" : ""}`} dir="auto" lang={arabic ? "ar" : undefined}>{name}</p>
        {since && <p className="vc-since">{since}</p>}
      </div>
    </section>
  );
}
