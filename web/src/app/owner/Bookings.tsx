"use client";

import { useState } from "react";
import type { BookingView } from "@/lib/bookings";
import { n } from "./format";
import { Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, Note } from "./types";
import { useT } from "@/lib/uiLang";

type Data = { on: boolean; bookings: BookingView[]; waiting: number };

/**
 * Owner and manager: table requests from the guest page. A request waits until someone here confirms or declines it;
 * the guest sees the answer on the page they sent it from. The owner switches the whole thing on or off.
 */
export default function Bookings({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const t = useT();
  const list = useGet<Data>(call, "/api/owner/bookings");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});

  const when = (iso: string) => new Date(iso).toLocaleString(`${t.locale}-u-nu-latn`, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Bahrain" });

  async function run(body: unknown, done: string) {
    setBusy(true); setNote(null);
    const r = await call("/api/owner/bookings", "POST", body);
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: done }); list.reload(); }
    else if (r.status !== 401) { setNote({ kind: "bad", text: t(r.error) }); list.reload(); }
  }

  const data = list.data;
  const waiting = data?.bookings.filter((b) => b.status === "pending") ?? [];
  const confirmed = data?.bookings.filter((b) => b.status === "confirmed") ?? [];
  const closed = data?.bookings.filter((b) => b.status === "declined" || b.status === "cancelled") ?? [];

  const row = (b: BookingView, actions: boolean) => (
    <li key={b.id} className="ow-item bo-item">
      <div className="ow-item-main">
        <b>{when(b.at)} · {t("{n} people", { n: n(b.party) })}</b>
        <small><span dir="auto">{b.name}</span>{b.member ? ` · ${t("Member")}` : ""}{b.branchName ? ` · ${b.branchName}` : ""} · <a href={`tel:${b.phone}`} dir="ltr">{b.phone}</a></small>
        {b.note && <small dir="auto">{b.note}</small>}
        {b.reply && <small dir="auto">{t("Your reply: {text}", { text: b.reply })}</small>}
        {b.status === "cancelled" && <small>{t("Cancelled by the guest")}</small>}
        {b.status === "declined" && <small>{t("Declined")}</small>}
      </div>
      {actions && (
        <div className="bo-act">
          <label className="ow-field">
            <span className="ow-sr">{t("A line for the guest (optional)")}</span>
            <input className="ow-in" maxLength={200} value={reply[b.id] ?? ""} onChange={(e) => setReply((r) => ({ ...r, [b.id]: e.target.value }))} placeholder={t("A line for the guest (optional)")} />
          </label>
          <div className="ow-rowbtns">
            {b.status !== "confirmed" && <button type="button" className="ow-btn small primary" disabled={busy} onClick={() => run({ id: b.id, status: "confirmed", reply: reply[b.id] ?? "" }, t("Confirmed. The guest sees it on their page."))}>{t("Confirm")}</button>}
            <button type="button" className="ow-btn small" disabled={busy} onClick={() => run({ id: b.id, status: "declined", reply: reply[b.id] ?? "" }, t("Declined. The guest sees it on their page."))}>{t("Decline")}</button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <>
      <PageHead eyebrow={t("Table service")} title={t("Bookings")}>{t("Guests ask for a table from your guest page. Nothing is booked until you confirm it here. Phone the guest if you need to: their number is on the request.")}</PageHead>
      <Msg note={note} />
      {list.error ? <LoadError text={list.error} onRetry={list.reload} /> : !data ? <Loading /> : (
        <>
          <section className="ow-panel" aria-labelledby="ow-h-bo" style={{ marginBlockEnd: 16 }}>
            <h2 className="ow-h" id="ow-h-bo">{data.on ? t("Table requests are on") : t("Table requests are off")}</h2>
            <p className="ow-note">{data.on ? t("Your guest page shows “Book a table”. Each request waits here for your answer; the guest is told it is a request, not a confirmed table.") : t("Your guest page does not show “Book a table”. Switch it on when someone will answer the requests.")}</p>
            <p className="ow-note">{t("The guest gets no message from this screen: they see your answer when they open the page again. Requests are removed 90 days after their date.")}</p>
            {isOwner && <div className="ow-actions"><button type="button" className="ow-btn" disabled={busy} onClick={() => run({ on: !data.on }, data.on ? t("Table requests are off.") : t("Table requests are on."))}>{data.on ? t("Switch off") : t("Switch on")}</button></div>}
          </section>
          <section className="ow-panel ow-flush" aria-labelledby="ow-h-bw" style={{ marginBlockEnd: 16 }}>
            <h2 className="ow-h ow-pad" id="ow-h-bw">{t("Waiting for your answer ({n})", { n: n(waiting.length) })}</h2>
            {waiting.length === 0 ? <p className="ow-note ow-pad">{t("No request is waiting.")}</p> : <ul className="ow-list">{waiting.map((b) => row(b, true))}</ul>}
          </section>
          <section className="ow-panel ow-flush" aria-labelledby="ow-h-bc" style={{ marginBlockEnd: 16 }}>
            <h2 className="ow-h ow-pad" id="ow-h-bc">{t("Confirmed, coming up ({n})", { n: n(confirmed.length) })}</h2>
            {confirmed.length === 0 ? <p className="ow-note ow-pad">{t("Nothing confirmed yet.")}</p> : <ul className="ow-list">{confirmed.map((b) => row(b, true))}</ul>}
          </section>
          {closed.length > 0 && (
            <section className="ow-panel ow-flush" aria-labelledby="ow-h-bx">
              <h2 className="ow-h ow-pad" id="ow-h-bx">{t("Declined or cancelled")}</h2>
              <ul className="ow-list">{closed.map((b) => row(b, false))}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
