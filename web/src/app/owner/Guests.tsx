"use client";

import { useState } from "react";
import QrSvg from "@/components/QrSvg";
import { ago, n } from "./format";
import { Confirm, Loading, LoadError, Msg, PageHead, Sheet, useDebounced, useGet } from "./ui";
import type { Call, Guest, Note } from "./types";
import { useT } from "@/lib/uiLang";

export default function Guests({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const list = useGet<{ guests: Guest[] }>(call, `/api/owner/guests?q=${encodeURIComponent(dq)}`);
  const [target, setTarget] = useState<Guest | null>(null);
  const [showing, setShowing] = useState<Guest | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const t = useT();

  const guests = list.data?.guests ?? [];

  async function erase() {
    if (!target) return;
    setBusy(true);
    const r = await call("/api/owner/guests", "DELETE", { cardId: target.cardId });
    setBusy(false);
    const name = target.name;
    setTarget(null);
    if (r.ok) { setNote({ kind: "ok", text: t("{name} was erased.", { name }) }); list.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <>
      <PageHead eyebrow={t("Members")} title={t("Guests")}>{t("{n} shown. Phone numbers and emails stay hidden here; export them only when you need to.", { n: n(guests.length) })}</PageHead>
      <div className="ow-bar-row">
        <form className="ow-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span className="ow-sr">{t("Search guests by name or code")}</span>
            <input className="ow-in" type="search" placeholder={t("Search by name or code")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
        </form>
        {isOwner && (
          <a className="ow-btn" href="/api/owner/export" download>{t("Export CSV")}</a>
        )}
      </div>
      <Msg note={note} />
      {list.error && <LoadError text={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && (
        <section className="ow-panel ow-flush" aria-label={t("Guests")}>
          {guests.length === 0 ? (
            <p className="ow-note ow-pad">{dq ? t("No guest matches.") : t("No guests yet.")}</p>
          ) : (
            <table className="ow-table">
              <thead>
                <tr>
                  <th scope="col">{t("Guest")}</th>
                  <th scope="col" className="ow-c-code">{t("Code")}</th>
                  <th scope="col" className="ow-c-visits">{t("Visits")}</th>
                  <th scope="col" className="ow-c-last">{t("Last visit")}</th>
                  <th scope="col" className="ow-c-pts">{t("Balance")}</th>
                  <th scope="col" className="ow-c-act"><span className="ow-sr">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.cardId}>
                    <th scope="row" className="ow-c-name"><span>{g.name}</span><small className="ow-c-meta">{t("Code {code} · visits: {n} · last visit {when}", { code: g.code, n: n(g.visits), when: ago(g.lastVisit, t) })}</small></th>
                    <td className="ow-c-code">{g.code}</td>
                    <td className="ow-c-visits">{n(g.visits)}</td>
                    <td className="ow-c-last">{ago(g.lastVisit, t)}</td>
                    <td className="ow-c-pts">{n(g.points)}</td>
                    <td className="ow-c-act">
                      <button type="button" className="ow-btn small" onClick={() => setShowing(g)} aria-label={t("Show the card of {name}", { name: g.name })}>{t("Show card")}</button>
                      {isOwner && <button type="button" className="ow-btn small" onClick={() => { setNote(null); setTarget(g); }} aria-label={t("Delete {name}", { name: g.name })}>{t("Delete")}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {showing && (
        <Sheet eyebrow={t("Code {code}", { code: showing.code })} title={t("Card of {name}", { name: showing.name })} onClose={() => setShowing(null)}>
          <CardQr cardId={showing.cardId} name={showing.name} />
        </Sheet>
      )}
      {target && (
        <Confirm title={t("Delete {name}?", { name: target.name })} confirmLabel={t("Delete for good")} danger busy={busy} onConfirm={erase} onClose={() => setTarget(null)}>
          <p className="ow-note ow-dialog-text">{t("Their name, phone, email, card and points are erased for good. This cannot be undone.")}</p>
        </Confirm>
      )}
    </>
  );
}

/**
 * The guest scans this with their own phone to get their card back (new phone, lost link, or they tried to join again).
 * Only for someone standing in front of staff: the card link is the guest's key, so it is shown, never sent.
 */
function CardQr({ cardId, name }: { cardId: string; name: string }) {
  const [url] = useState(() => `${window.location.origin}/card/${cardId}`);
  const t = useT();
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center", paddingBlock: 8 }}>
      <QrSvg text={url} label={t("QR code for the card of {name}", { name })} size={220} />
      <p className="ow-note" style={{ textAlign: "center" }}>{t("Ask the guest to scan this with their phone camera. Their card opens with everything on it. Check it is really them first: this code opens their card.")}</p>
    </div>
  );
}
