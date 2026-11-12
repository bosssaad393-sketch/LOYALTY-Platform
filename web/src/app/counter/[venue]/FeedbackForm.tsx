"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type State = { kind: "idle" | "busy" | "done" } | { kind: "bad"; text: string };

/** Members only (the page shows it only to a phone that remembers this venue's card; the route checks again). */
export default function FeedbackForm({ venue, reviewUrl = null }: { venue: string; reviewUrl?: string | null }) {
  const t = useTranslations("door");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setState({ kind: "bad", text: t("fbPick") });
    setState({ kind: "busy" });
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ venue, rating, message }) });
      if (r.ok) return setState({ kind: "done" });
      setState({ kind: "bad", text: r.status === 429 ? t("fbLimit") : r.status === 403 ? t("fbMembers") : t("fbError") });
    } catch {
      setState({ kind: "bad", text: t("fbError") });
    }
  }

  if (state.kind === "done") {
    // A happy guest is offered the venue's Google review page, when the owner has set it. Their choice, one tap.
    const happy = rating >= 4 && reviewUrl;
    return (
      <div className="panel">
        <p className="door-msg ok" role="status">{t("fbThanks")}</p>
        {happy && <p className="door-msg">{t("fbReviewAsk")}</p>}
        {happy && <a className="btn primary" href={reviewUrl} target="_blank" rel="noopener noreferrer">{t("fbReview")}</a>}
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={send}>
      <fieldset className="door-stars" role="radiogroup">
        <legend>{t("fbRate")}</legend>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" className="door-star" role="radio" aria-checked={i <= rating} aria-label={t("fbStar", { n: i })} onClick={() => setRating(i)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill={i <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6z" /></svg>
          </button>
        ))}
      </fieldset>
      <textarea className="door-text" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} placeholder={t("fbPlaceholder")} aria-label={t("fbPlaceholder")} />
      <button className="btn primary" type="submit" disabled={state.kind === "busy"}>{state.kind === "busy" ? t("fbSending") : t("fbSend")}</button>
      <div role="alert">{state.kind === "bad" && <p className="door-msg bad">{state.text}</p>}</div>
    </form>
  );
}
