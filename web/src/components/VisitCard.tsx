import VenueMark from "./VenueMark";

type Labels = { aria: string; code: string; since: string; visits: string; lastVisit: string; noVisit: string; qrAlt: string };

type Props = {
  venueName: string;
  venueSlug: string;
  markType?: boolean;
  memberName: string;
  code: string;
  qr: string; // data URL of the till QR
  visits: number;
  labels: Labels;
};

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * The member's card for a visit venue (migration 0022): no points, no stamps. A flat card in the brand colour with one
 * fine accent frame, the venue mark, the member's code, name and visits, and the till QR on a paper tile. Sizes scale
 * with the card width (container units) but text never goes under 12px. Same layout as the Wallet pass, so the two
 * read as one object.
 */
export default function VisitCard({ venueName, venueSlug, markType, memberName, code, qr, visits, labels }: Props) {
  const arabic = ARABIC.test(memberName);
  const name = memberName.trim();
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
