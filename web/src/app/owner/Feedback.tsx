"use client";

import { ago } from "./format";
import { Loading, LoadError, PageHead, useGet } from "./ui";
import type { Call } from "./types";

type Item = { id: string; rating: number; message: string; firstName: string | null; createdAt: string };
type View = { count: number; average: number | null; low: number; items: Item[] };

function Stars({ rating }: { rating: number }) {
  return (
    <span className="ow-stars" role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= rating ? "on" : undefined} aria-hidden="true">★</i>)}
    </span>
  );
}

/** What members wrote on the counter page. Read only: the owner answers in person. */
export default function Feedback({ call }: { call: Call }) {
  const fb = useGet<View>(call, "/api/owner/feedback");
  const v = fb.data;

  return (
    <>
      <PageHead eyebrow="From your members" title="Feedback">Guests with your loyalty card can rate their visit from the QR code at the counter.</PageHead>
      {fb.error && <LoadError text={fb.error} onRetry={fb.reload} />}
      {!v && !fb.error && <Loading />}
      {v && (
        <>
          <section className="ow-panel ow-fbtop" aria-label="Summary">
            <div><span className="ow-kpi-l">Average rating</span><b>{v.average === null ? "–" : v.average.toFixed(1)}</b><small>out of 5</small></div>
            <div><span className="ow-kpi-l">Messages</span><b>{v.count}</b><small>{v.count === 200 ? "latest 200 shown" : "in total"}</small></div>
            <div><span className="ow-kpi-l">Needs a look</span><b>{v.low}</b><small>rated 1 or 2 stars</small></div>
          </section>
          <section className="ow-panel" aria-labelledby="ow-h-fb">
            <h2 className="ow-h" id="ow-h-fb">Latest</h2>
            {v.items.length === 0 ? <p className="ow-note">No feedback yet. Print the counter card from the QR kit and place it by the till.</p> : (
              <ul className="ow-list">
                {v.items.map((i) => (
                  <li key={i.id} className="ow-item">
                    <span className="ow-item-main">
                      <b>{i.message || "No message, rating only."}</b>
                      <small>{i.firstName ?? "A member"} · {ago(i.createdAt)}</small>
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
