"use client";

import { useState } from "react";
import { filsMoney } from "@/lib/format";
import type { GuestEvent, GuestStage } from "@/lib/guestCrm";
import { tx } from "@/lib/uiArabic";
import { useT } from "@/lib/uiLang";
import { ago, n } from "./format";
import { Loading, LoadError, Msg, useGet } from "./ui";
import type { Call, Note } from "./types";

type Rec = {
  cardId: string; code: string; name: string; stage: GuestStage; tags: string[];
  visits: number; points: number; lastVisit: string | null; joined: string; joinedAt: string | null;
  birthday: { day: number; month: number } | null; offers: boolean; wallet: "apple" | "google" | null;
  everyDays: number | null; giftsReady: number; giftsUsed: number; spentFils: number; bills: number;
  notesReady: boolean; events: GuestEvent[];
};

export const STAGE_LABEL: Record<GuestStage, string> = {
  new: tx("New"), regular: tx("Regular"), active: tx("Active"), quiet: tx("Gone quiet"), waiting: tx("Not visited yet"),
};

/**
 * One guest, everything in one place: where they stand, the facts, the team's labels and notes, and the story of
 * their card from the day they joined. Notes and labels are the venue's own and are never shown to the guest.
 */
export default function GuestRecord({ call, cardId, visitVenue, onChanged }: { call: Call; cardId: string; visitVenue: boolean; onChanged: () => void }) {
  const t = useT();
  const got = useGet<{ record: Rec }>(call, `/api/owner/guests/record?cardId=${cardId}`);
  const [fresh, setFresh] = useState<Rec | null>(null);
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const rec = fresh ?? got.data?.record ?? null;

  const date = (iso: string) => new Date(iso).toLocaleDateString(`${t.locale}-u-nu-latn`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bahrain" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString(`${t.locale}-u-nu-latn`, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Bahrain" });
  const birthday = (b: { day: number; month: number }) => new Date(Date.UTC(2000, b.month - 1, b.day)).toLocaleDateString(`${t.locale}-u-nu-latn`, { day: "numeric", month: "long", timeZone: "UTC" });

  async function change(body: Record<string, unknown>, done?: () => void) {
    setBusy(true); setNote(null);
    const r = await call<{ record: Rec }>("/api/owner/guests/record", "POST", { cardId, ...body });
    setBusy(false);
    if (r.ok) { setFresh(r.data.record); done?.(); onChanged(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: t(r.error) });
  }

  if (got.error) return <LoadError text={got.error} onRetry={got.reload} />;
  if (!rec) return <Loading />;

  const facts: [string, string][] = [
    [t("Visits"), n(rec.visits)],
    [t("Last visit"), ago(rec.lastVisit, t)],
    [t("Comes about every"), rec.everyDays === null ? t("Not known yet") : t("{n} days", { n: n(rec.everyDays) })],
    [t("Member since"), rec.joinedAt ? t("{date} · {place}", { date: date(rec.joined), place: rec.joinedAt }) : date(rec.joined)],
    ...(visitVenue ? [[t("Gifts"), t("{ready} waiting · {used} used", { ready: n(rec.giftsReady), used: n(rec.giftsUsed) })] as [string, string]] : [[t("Balance"), n(rec.points)] as [string, string]]),
    ...(rec.bills > 0 ? [[t("Spent"), t("{money} over {n} bills", { money: filsMoney(rec.spentFils), n: n(rec.bills) })] as [string, string]] : []),
    [t("Birthday"), rec.birthday ? birthday(rec.birthday) : t("Not given")],
    [t("Offers on their card"), rec.offers ? t("Agreed") : t("Did not agree")],
    [t("Card saved in"), rec.wallet === "apple" ? "Apple Wallet" : rec.wallet === "google" ? "Google Wallet" : t("Not saved to a wallet")],
  ];

  const line = (e: GuestEvent): { head: string; sub?: string } => {
    const at = (place: string | null) => (place ? t("at {place}", { place }) : "");
    const by = (who: string | null) => (who ? t("by {name}", { name: who }) : "");
    const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
    switch (e.kind) {
      case "joined": return { head: t("Joined"), sub: at(e.place) };
      case "visit": return { head: t("Visit"), sub: join(at(e.place), by(e.by)) };
      case "visit_removed": return { head: t("Visit removed"), sub: by(e.by) };
      case "reward_used": return { head: t("Reward used"), sub: by(e.by) };
      case "gift_ready": return { head: t("Gift unlocked"), sub: e.text };
      case "gift_used": return { head: t("Gift used"), sub: e.text };
      case "gift_cancelled": return { head: t("Gift cancelled"), sub: e.text };
      case "bill": return { head: t("Bill of {money}", { money: filsMoney(e.fils) }), sub: at(e.place) };
      case "note": return { head: t("Note by {name}", { name: e.by }), sub: e.text };
    }
  };

  return (
    <div className="gr">
      <div className="gr-top">
        <span className={`ow-tag${rec.stage === "quiet" || rec.stage === "waiting" ? " quiet" : ""}`}>{t(STAGE_LABEL[rec.stage])}</span>
        {rec.tags.map((x) => (
          <span key={x} className="gr-label" dir="auto">{x}
            <button type="button" disabled={busy} aria-label={t("Remove the label {label}", { label: x })} onClick={() => change({ do: "tags", tags: rec.tags.filter((y) => y !== x) })}>×</button>
          </span>
        ))}
      </div>
      <Msg note={note} />

      <dl className="gr-facts">
        {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd dir="auto">{v}</dd></div>)}
      </dl>

      {rec.notesReady && (
        <>
          <form className="gr-row" onSubmit={(e) => { e.preventDefault(); const v = tag.trim(); if (v) change({ do: "tags", tags: [...rec.tags, v] }, () => setTag("")); }}>
            <label className="ow-field gr-grow">
              <span className="ow-lbl">{t("Labels")}</span>
              <input className="ow-in" value={tag} maxLength={24} disabled={busy || rec.tags.length >= 8} onChange={(e) => setTag(e.target.value)} placeholder={t("For example: family, vip, allergy")} autoComplete="off" />
            </label>
            <button type="submit" className="ow-btn" disabled={busy || !tag.trim() || rec.tags.length >= 8}>{t("Add label")}</button>
          </form>
          <form className="gr-note" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) change({ do: "note", body: v }, () => setDraft("")); }}>
            <label className="ow-field">
              <span className="ow-lbl">{t("Note for your team")}</span>
              <textarea className="ow-in" rows={3} maxLength={600} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} placeholder={t("What should the team remember about this guest?")} />
            </label>
            <div className="gr-row">
              <p className="ow-note gr-grow">{t("Only your team sees notes and labels. The guest never does.")}</p>
              <button type="submit" className="ow-btn" disabled={busy || !draft.trim()}>{t("Save note")}</button>
            </div>
          </form>
        </>
      )}

      <section aria-labelledby="gr-h">
        <h3 className="ow-h" id="gr-h">{t("History")}</h3>
        <ol className="gr-line">
          {rec.events.map((e, i) => {
            const l = line(e);
            return (
              <li key={`${e.kind}-${e.at}-${i}`} className={`gr-ev gr-${e.kind}`}>
                <time dateTime={e.at}>{date(e.at)}<small>{time(e.at)}</small></time>
                <div>
                  <b>{l.head}</b>
                  {l.sub && <p dir="auto">{l.sub}</p>}
                  {e.kind === "note" && <button type="button" className="ow-link" disabled={busy} onClick={() => change({ do: "remove_note", noteId: e.id })}>{t("Remove note")}</button>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
