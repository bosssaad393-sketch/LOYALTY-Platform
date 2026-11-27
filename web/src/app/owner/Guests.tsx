"use client";

import { useState } from "react";
import QrSvg from "@/components/QrSvg";
import GuestOrders from "./GuestOrders";
import GuestRecord, { STAGE_LABEL } from "./GuestRecord";
import { GUEST_STAGES, type GuestStage } from "@/lib/guestCrm";
import { ago, n } from "./format";
import { Confirm, Loading, LoadError, Msg, PageHead, Sheet, useDebounced, useGet } from "./ui";
import type { Call, Guest, Note } from "./types";
import { useT } from "@/lib/uiLang";

/** visitVenue: a visit-card venue (0022) has no points, so the balance column goes and the delete text names visits and gifts. */
export default function Guests({ call, isOwner, visitVenue = false }: { call: Call; isOwner: boolean; visitVenue?: boolean }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const list = useGet<{ guests: Guest[] }>(call, `/api/owner/guests?q=${encodeURIComponent(dq)}`);
  const [target, setTarget] = useState<Guest | null>(null);
  const [showing, setShowing] = useState<Guest | null>(null);
  const [gifting, setGifting] = useState<Guest | null>(null);
  const [ordering, setOrdering] = useState<Guest | null>(null);
  const [opened, setOpened] = useState<Guest | null>(null);
  const [stage, setStage] = useState<GuestStage | "all">("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const t = useT();

  const everyone = list.data?.guests ?? [];
  const guests = stage === "all" ? everyone : everyone.filter((g) => g.stage === stage);
  const count = (s: GuestStage) => everyone.filter((g) => g.stage === s).length;

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
            <span className="ow-sr">{t("Search guests by name, code or label")}</span>
            <input className="ow-in" type="search" placeholder={t("Search by name, code or label")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
        </form>
        {isOwner && (
          <a className="ow-btn" href="/api/owner/export" download>{t("Export CSV")}</a>
        )}
      </div>
      {list.data && everyone.length > 0 && (
        <div className="ow-chips gr-filter" role="group" aria-label={t("Show")}>
          <button type="button" className="ow-pill" aria-pressed={stage === "all"} onClick={() => setStage("all")}>{t("All")} · {n(everyone.length)}</button>
          {GUEST_STAGES.filter((s) => count(s) > 0 || s === stage).map((s) => (
            <button key={s} type="button" className="ow-pill" aria-pressed={stage === s} onClick={() => setStage(s)}>{t(STAGE_LABEL[s])} · {n(count(s))}</button>
          ))}
        </div>
      )}
      <Msg note={note} />
      {list.error && <LoadError text={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && (
        <section className="ow-panel ow-flush" aria-label={t("Guests")}>
          {guests.length === 0 ? (
            <p className="ow-note ow-pad">{dq || stage !== "all" ? t("No guest matches.") : t("No guests yet.")}</p>
          ) : (
            <table className="ow-table">
              <thead>
                <tr>
                  <th scope="col">{t("Guest")}</th>
                  <th scope="col" className="ow-c-code">{t("Code")}</th>
                  <th scope="col" className="ow-c-visits">{t("Visits")}</th>
                  <th scope="col" className="ow-c-last">{t("Last visit")}</th>
                  {!visitVenue && <th scope="col" className="ow-c-pts">{t("Balance")}</th>}
                  <th scope="col" className="ow-c-act"><span className="ow-sr">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.cardId}>
                    <th scope="row" className="ow-c-name"><button type="button" className="gr-open" onClick={() => setOpened(g)} aria-label={t("Open the record of {name}", { name: g.name })}>{g.name}</button>{g.stage && g.stage !== "active" && <span className={`ow-tag gr-stage${g.stage === "quiet" || g.stage === "waiting" ? " quiet" : ""}`}>{t(STAGE_LABEL[g.stage])}</span>}{(g.tags ?? []).map((x) => <span key={x} className="gr-label" dir="auto">{x}</span>)}<small className="ow-c-meta">{t("Code {code} · visits: {n} · last visit {when}", { code: g.code, n: n(g.visits), when: ago(g.lastVisit, t) })}</small></th>
                    <td className="ow-c-code">{g.code}</td>
                    <td className="ow-c-visits">{n(g.visits)}</td>
                    <td className="ow-c-last">{ago(g.lastVisit, t)}</td>
                    {!visitVenue && <td className="ow-c-pts">{n(g.points)}</td>}
                    <td className="ow-c-act">
                      <button type="button" className="ow-btn small" onClick={() => setShowing(g)} aria-label={t("Show the card of {name}", { name: g.name })}>{t("Show card")}</button>
                      <button type="button" className="ow-btn small" onClick={() => setOrdering(g)} aria-label={t("Orders of {name}", { name: g.name })}>{t("Orders")}</button>
                      {visitVenue && <button type="button" className="ow-btn small" onClick={() => setGifting(g)} aria-label={t("Gifts of {name}", { name: g.name })}>{t("Gifts")}</button>}
                      {isOwner && <button type="button" className="ow-btn small" onClick={() => { setNote(null); setTarget(g); }} aria-label={t("Delete {name}", { name: g.name })}>{t("Delete")}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {opened && (
        <Sheet eyebrow={t("Code {code}", { code: opened.code })} title={opened.name} onClose={() => setOpened(null)}>
          <GuestRecord call={call} cardId={opened.cardId} visitVenue={visitVenue} onChanged={list.reload} />
        </Sheet>
      )}
      {showing && (
        <Sheet eyebrow={t("Code {code}", { code: showing.code })} title={t("Card of {name}", { name: showing.name })} onClose={() => setShowing(null)}>
          <CardQr cardId={showing.cardId} name={showing.name} />
        </Sheet>
      )}
      {ordering && (
        <Sheet eyebrow={t("Code {code}", { code: ordering.code })} title={t("Orders of {name}", { name: ordering.name })} onClose={() => setOrdering(null)}>
          <GuestOrders call={call} cardId={ordering.cardId} />
        </Sheet>
      )}
      {gifting && (
        <Sheet eyebrow={t("Code {code}", { code: gifting.code })} title={t("Gifts of {name}", { name: gifting.name })} onClose={() => setGifting(null)}>
          <GuestGifts call={call} cardId={gifting.cardId} />
        </Sheet>
      )}
      {target && (
        <Confirm title={t("Delete {name}?", { name: target.name })} confirmLabel={t("Delete for good")} danger busy={busy} onConfirm={erase} onClose={() => setTarget(null)}>
          <p className="ow-note ow-dialog-text">{visitVenue ? t("Their name, phone, email, card, visits and gifts are erased for good. This cannot be undone.") : t("Their name, phone, email, card and points are erased for good. This cannot be undone.")}</p>
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

type GuestGift = { id: string; title: string; state: "ready" | "used" | "expired" | "cancelled"; issuedAt: string; redeemedAt: string | null; redeemBranchName: string | null };
type GiftChoice = { id: string; title: string };

/**
 * The gifts on one guest's card (visit venues). A gift that is still waiting can be cancelled, for example when it was
 * unlocked by mistake; a gift the guest does not hold yet can be given by hand. Both are written to the activity log.
 */
function GuestGifts({ call, cardId }: { call: Call; cardId: string }) {
  const t = useT();
  const list = useGet<{ gifts: GuestGift[]; canGive: GiftChoice[] }>(call, `/api/owner/guests/gifts?cardId=${cardId}`);
  const [picked, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const gifts = list.data?.gifts ?? null;
  const canGive = list.data?.canGive ?? [];
  const pick = canGive.some((g) => g.id === picked) ? picked : canGive[0]?.id ?? "";

  const day = (iso: string) => new Date(iso).toLocaleDateString(`${t.locale}-u-nu-latn`, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bahrain" });
  const state = (g: GuestGift) => g.state === "used" ? t("Used on {date}", { date: day(g.redeemedAt ?? g.issuedAt) }) : g.state === "cancelled" ? t("Cancelled") : g.state === "expired" ? t("Expired") : t("Ready");
  const waiting = (g: GuestGift) => g.state === "ready";

  async function run(path: string, body: unknown, done: string) {
    setBusy(true); setNote(null);
    const r = await call(path, "POST", body);
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: done }); list.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: t(r.error) });
  }

  if (list.error) return <LoadError text={list.error} onRetry={list.reload} />;
  if (!gifts) return <Loading />;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Msg note={note} />
      {gifts.length === 0 ? <p className="ow-note">{t("No gift on this card yet. A gift appears here when a visit unlocks it, or when you give one below.")}</p> : (
        <ul className="ow-list">
          {gifts.map((g) => (
            <li key={g.id} className="ow-item">
              <span className="ow-item-main"><span dir="auto">{g.title}</span><small className="ow-c-meta">{state(g)}{g.redeemBranchName && waiting(g) ? ` · ${t("Used at: {place}", { place: g.redeemBranchName })}` : ""}</small></span>
              {waiting(g) && <button type="button" className="ow-btn small" disabled={busy} onClick={() => run("/api/owner/vouchers/void", { cardVoucherId: g.id }, t("Gift cancelled. It is no longer on the guest's card."))}>{t("Cancel this gift")}</button>}
            </li>
          ))}
        </ul>
      )}
      {canGive.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <label className="ow-field">
            <span className="ow-lbl">{t("Give a gift by hand")}</span>
            <select className="ow-in" value={pick} onChange={(e) => setPick(e.target.value)}>
              {canGive.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
          <button type="button" className="ow-btn" disabled={busy || !pick} onClick={() => run("/api/owner/guests/gifts", { cardId, voucherId: pick }, t("Gift given. It is on the guest's card now."))}>{t("Give this gift")}</button>
          <p className="ow-note">{t("A guest gets each gift once. Giving and cancelling are written to the activity log with your name.")}</p>
        </div>
      )}
    </div>
  );
}
