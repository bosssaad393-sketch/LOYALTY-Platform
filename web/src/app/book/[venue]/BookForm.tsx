"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { MyBooking } from "@/lib/bookings";

type Props = {
  venue: string; locale: string; days: { min: string; max: string }; maxParty: number; name: string;
  branches: { slug: string; name: string }[]; callHref: string | null; words: Record<string, string>;
};

const KEY = (venue: string) => `booking:${venue}`;

/**
 * The request form, and after sending the guest's own request with the venue's answer. The key to the request is
 * kept on this phone only, so coming back to this page shows where it stands.
 */
export default function BookForm({ venue, locale, days, maxParty, name, branches, callHref, words }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [mine, setMine] = useState<MyBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Reads the request behind a key and shows it; a key that no longer opens anything is forgotten. */
  const load = useCallback(async (key: string) => {
    const r = await fetch(`/api/book/${key}`).catch(() => null);
    if (!r) return;
    if (r.ok) { setMine((await r.json()) as MyBooking); setToken(key); }
    else { window.localStorage.removeItem(KEY(venue)); setToken(null); setMine(null); }
  }, [venue]);

  // Coming back to the page: this phone's own request, if it sent one.
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY(venue));
    if (!saved) return;
    let live = true;
    fetch(`/api/book/${saved}`).then(async (r) => {
      if (!live) return;
      if (r.ok) { setMine((await r.json()) as MyBooking); setToken(saved); }
      else window.localStorage.removeItem(KEY(venue));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [venue]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/book", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        venue, name: text("name"), phone: text("phone"), party: Number(text("party")), date: text("date"), time: text("time"), note: text("note"), ...(text("branch") ? { branch: text("branch") } : {}),
      }) });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (res.ok && body.token) { window.localStorage.setItem(KEY(venue), body.token); await load(body.token); }
      else setError(body.error ?? words.failed);
    } catch {
      setError(words.failed);
    }
    setBusy(false);
  }

  async function cancel() {
    if (!token) return;
    setBusy(true);
    await fetch(`/api/book/${token}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    setMine((m) => (m ? { ...m, status: "cancelled" } : m));
  }

  function another() {
    window.localStorage.removeItem(KEY(venue));
    setToken(null); setMine(null);
  }

  if (token && mine) {
    const at = new Date(mine.at);
    const when = at.toLocaleString(`${locale}-u-nu-latn`, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Bahrain" });
    const state = mine.past && mine.status !== "declined" && mine.status !== "cancelled" ? words.past : words[mine.status];
    const open = !mine.past && (mine.status === "pending" || mine.status === "confirmed");
    return (
      <section className={`pane bk-mine is-${mine.status}`} aria-live="polite">
        <h2 className="gs-h">{words.sentTitle}</h2>
        <p className="bk-state">{state}</p>
        <dl className="bk-facts">
          <div><dt>{words.when}</dt><dd>{when}</dd></div>
          <div><dt>{words.people}</dt><dd dir="ltr">{mine.party}</dd></div>
          {mine.reply && <div><dt>{words.reply}</dt><dd dir="auto">{mine.reply}</dd></div>}
        </dl>
        {mine.status === "pending" && !mine.past && <p className="note">{words.sentLead}</p>}
        <div className="actions">
          {callHref && <a className="btn" href={callHref}>{words.call}</a>}
          {open && <button type="button" className="btn quiet" onClick={cancel} disabled={busy}>{words.cancel}</button>}
          {!open && <button type="button" className="btn primary" onClick={another}>{words.another}</button>}
        </div>
      </section>
    );
  }

  return (
    <form className="pane bk-form" onSubmit={send}>
      <div className="bk-two">
        <label className="field"><span className="lbl">{words.day}</span><input className="in" name="date" type="date" required min={days.min} max={days.max} defaultValue={days.min} dir="ltr" /></label>
        <label className="field"><span className="lbl">{words.time}</span><input className="in" name="time" type="time" required step={900} defaultValue="20:00" dir="ltr" /></label>
      </div>
      <label className="field"><span className="lbl">{words.party}</span><input className="in" name="party" type="number" inputMode="numeric" required min={1} max={maxParty} defaultValue={2} dir="ltr" /></label>
      {branches.length > 0 && (
        <label className="field"><span className="lbl">{words.branch}</span>
          <select className="in" name="branch" defaultValue={branches[0].slug}>{branches.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
        </label>
      )}
      <label className="field"><span className="lbl">{words.name}</span><input className="in" name="name" required maxLength={80} defaultValue={name} autoComplete="name" /></label>
      <label className="field"><span className="lbl">{words.phone}</span><input className="in" name="phone" type="tel" inputMode="tel" required maxLength={20} dir="ltr" placeholder="+973" autoComplete="tel" /></label>
      <label className="field"><span className="lbl">{words.note}</span><input className="in" name="note" maxLength={300} placeholder={words.notePh} /></label>
      <p className="bk-err" role="alert">{error ?? ""}</p>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? words.sending : words.send}</button>
    </form>
  );
}
