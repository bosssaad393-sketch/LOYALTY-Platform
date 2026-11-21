"use client";

import { ago } from "./format";
import { Loading, LoadError, PageHead, useGet } from "./ui";
import type { Call } from "./types";
import { useT } from "@/lib/uiLang";

type Item = { id: string; rating: number; message: string; firstName: string | null; createdAt: string };
type View = { count: number; average: number | null; low: number; items: Item[] };
type GReview = { author: string; authorUrl: string | null; rating: number; text: string; when: string };
type GView =
  | { configured: false; reason: "no_key" | "no_place" }
  | { configured: true; ok: false; error: string }
  | { configured: true; ok: true; rating: number | null; count: number; mapsUrl: string | null; reviewUrl: string; reviews: GReview[] };

function Stars({ rating }: { rating: number }) {
  const t = useT();
  return (
    <span className="ow-stars" dir="ltr" role="img" aria-label={t("{n} out of 5", { n: rating })}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= rating ? "on" : undefined} aria-hidden="true">★</i>)}
    </span>
  );
}

/** The venue's public Google rating and the latest reviews Google shares (up to 5). Read only. */
function GoogleReviews({ call }: { call: Call }) {
  const g = useGet<GView>(call, "/api/owner/reviews");
  const v = g.data;
  const t = useT();
  return (
    <section className="ow-panel" aria-labelledby="ow-h-g">
      <h2 className="ow-h" id="ow-h-g">{t("On Google")}</h2>
      {g.error && <p className="ow-msg bad">{t(g.error)}</p>}
      {!v && !g.error && <Loading />}
      {v && !v.configured && (
        <p className="ow-note">{v.reason === "no_place"
          ? t("Add your Google review link on the Rules screen to see your Google reviews here.")
          : t("Google reviews appear here once a Google Places API key is added to the app's settings.")}</p>
      )}
      {v && v.configured && !v.ok && <p className="ow-msg bad">{t(v.error)}</p>}
      {v && v.configured && v.ok && (
        <>
          <div className="ow-fbtop">
            <div><span className="ow-kpi-l">{t("Google rating")}</span><b>{v.rating === null ? "–" : v.rating.toFixed(1)}</b><small>{t("out of 5")}</small></div>
            <div><span className="ow-kpi-l">{t("Reviews")}</span><b>{v.count}</b><small>{t("on Google in total")}</small></div>
            <div><span className="ow-kpi-l">{t("Shown here")}</span><b>{v.reviews.length}</b><small>{t("Google shares up to 5")}</small></div>
          </div>
          {v.reviews.length > 0 && (
            <ul className="ow-list">
              {v.reviews.map((r, i) => (
                <li key={i} className="ow-item">
                  <span className="ow-item-main">
                    <b dir="auto">{r.text || t("No text, rating only.")}</b>
                    <small>{r.authorUrl ? <a href={r.authorUrl} target="_blank" rel="noopener noreferrer">{r.author}</a> : r.author}{r.when ? ` · ${r.when}` : ""}</small>
                  </span>
                  <span className="ow-item-side"><Stars rating={r.rating} /></span>
                </li>
              ))}
            </ul>
          )}
          <div className="ow-actions">
            {v.mapsUrl && <a className="ow-btn" href={v.mapsUrl} target="_blank" rel="noopener noreferrer">{t("All reviews on Google")}</a>}
            <a className="ow-btn" href={v.reviewUrl} target="_blank" rel="noopener noreferrer">{t("Review form guests see")}</a>
          </div>
        </>
      )}
    </section>
  );
}

/** What members wrote on the counter page, plus the public Google reviews. Read only: the owner answers in person. */
export default function Feedback({ call, stampVenue = false }: { call: Call; stampVenue?: boolean }) {
  const t = useT();
  return (
    <>
      <PageHead eyebrow={t("From your guests")} title={t("Feedback")}>{stampVenue ? t("What your guests say about you on Google.") : t("Your public Google reviews, and what card members rated from the QR code at the counter.")}</PageHead>
      <GoogleReviews call={call} />
      {!stampVenue && <MemberFeedback call={call} />}
    </>
  );
}

/** Ratings card members leave on the counter page (points venues with a counter QR). */
function MemberFeedback({ call }: { call: Call }) {
  const fb = useGet<View>(call, "/api/owner/feedback");
  const v = fb.data;
  const t = useT();

  return (
    <>
      {fb.error && <LoadError text={fb.error} onRetry={fb.reload} />}
      {!v && !fb.error && <Loading />}
      {v && (
        <>
          <section className="ow-panel ow-fbtop" aria-label={t("Summary")}>
            <div><span className="ow-kpi-l">{t("Average rating")}</span><b>{v.average === null ? "–" : v.average.toFixed(1)}</b><small>{t("out of 5")}</small></div>
            <div><span className="ow-kpi-l">{t("Messages")}</span><b>{v.count}</b><small>{v.count === 200 ? t("latest 200 shown") : t("in total")}</small></div>
            <div><span className="ow-kpi-l">{t("Needs a look")}</span><b>{v.low}</b><small>{t("rated 1 or 2 stars")}</small></div>
          </section>
          <section className="ow-panel" aria-labelledby="ow-h-fb">
            <h2 className="ow-h" id="ow-h-fb">{t("From card members")}</h2>
            {v.items.length === 0 ? <p className="ow-note">{t("No feedback yet. Print the counter card from the QR kit and place it by the till.")}</p> : (
              <ul className="ow-list">
                {v.items.map((i) => (
                  <li key={i.id} className="ow-item">
                    <span className="ow-item-main">
                      <b dir="auto">{i.message || t("No message, rating only.")}</b>
                      <small>{i.firstName ?? t("A member")} · {ago(i.createdAt, t)}</small>
                    </span>
                    <span className="ow-item-side"><Stars rating={i.rating} /></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
