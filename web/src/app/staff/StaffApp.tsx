"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CountUp from "@/components/CountUp";
import QrScanner from "./QrScanner";
import PinPad from "@/components/PinPad";
import type { SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";
import { LARGE_BILL_BHD, MAX_BILL_BHD, pointsFor, readBill } from "@/lib/tillRules";
import { bahrainDayKey, bahrainTime, bhd as bhdNumber, bhdText } from "@/lib/format";

type Me = { name: string; role: string; venue: string };
type Guest = { cardId: string; firstName: string; code: string; points: number; visits: number; goal: number; rewardText: string; rewardReady: boolean; pointsPerBhd?: number };
type Recent = { id: number; kind: string; points: number; billBhd: number | null; at: string; by: string; guest: string };
type Perk = { id: string; title: string; note: string | null; validUntil: string | null; from: string };
type Tab = "guest" | "recent" | "help" | "end";
type Res<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function api<T>(path: string, body?: unknown): Promise<Res<T>> {
  const res = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: "No connection. Try again.", status: 0 };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Something went wrong.", status: res.status };
}

const bhd = bhdText;
const time = bahrainTime;
const dayKey = bahrainDayKey;
const QUICK = [3, 5, 10, 15, 20];
/** When an entry was made, for the 10-minute undo window. Only ever called from a tap, never while drawing. */
const stamp = () => Date.now();
/** 1250 -> "1,250.000": three decimals like the receipt, with thousands marked so a typo stands out. */
const bhdFull = bhdNumber;

export default function StaffApp({ initialMe, brand }: { initialMe: Me | null; look?: SignInLook; brand: BrandProps }) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const [tab, setTab] = useState<Tab>("guest");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [bill, setBill] = useState("");
  const [lastEntry, setLastEntry] = useState<{ id: number; at: number } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; first: string; total: number; ready: boolean } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [perks, setPerks] = useState<Perk[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);
  /** A large bill waits for one more tap ("Yes, BHD 450.000"). Cleared when the amount changes. */
  const [confirmLarge, setConfirmLarge] = useState(false);
  const billBox = useRef<HTMLInputElement>(null);

  const signedOut = useCallback(() => { setMe(null); setGuest(null); setTab("guest"); }, []);

  const loadRecent = useCallback(async () => {
    const r = await api<{ items: Recent[] }>("/api/staff/recent", undefined);
    if (r.ok) setRecent(r.data.items); else if (r.status === 401) signedOut();
  }, [signedOut]);
  const loadPerks = useCallback(async () => {
    const r = await api<{ perks: Perk[] }>("/api/staff/perks", undefined);
    if (r.ok) setPerks(r.data.perks);
  }, []);

  // Once signed in: today's list (for the tally) and any thank-you rewards waiting.
  useEffect(() => {
    if (!me) return;
    let live = true;
    Promise.all([api<{ items: Recent[] }>("/api/staff/recent", undefined), api<{ perks: Perk[] }>("/api/staff/perks", undefined)]).then(([a, b]) => {
      if (!live) return;
      if (a.ok) setRecent(a.data.items);
      if (b.ok) setPerks(b.data.perks);
    });
    return () => { live = false; };
  }, [me]);

  async function signIn(pin: string) {
    setBusy(true); setLoginError(null);
    const r = await api<Me>("/api/staff/pin-login", { pin, area: "staff", venue: brand.slug });
    setBusy(false);
    if (r.ok) setMe(r.data); else setLoginError(r.error);
  }

  async function lock() {
    await api("/api/staff/logout", { area: "staff" });
    signedOut();
  }

  const find = useCallback(async (code: string) => {
    setScanning(false); setMsg(null); setBusy(true);
    const r = await api<Guest>(`/api/staff/card?code=${encodeURIComponent(code)}`, undefined);
    setBusy(false);
    if (r.ok) { setGuest(r.data); setBill(""); setConfirmLarge(false); setLastEntry(null); setResult(null); }
    else if (r.status === 401) signedOut();
    else setMsg({ kind: "bad", text: r.error });
  }, [signedOut]);

  async function act(path: string, body: unknown, success: (d: { guest: Guest; ledgerId?: number; added?: number }) => string) {
    setBusy(true); setMsg(null);
    const r = await api<{ guest: Guest; ledgerId?: number; added?: number }>(path, body);
    setBusy(false);
    if (!r.ok) { if (r.status === 401) signedOut(); else setMsg({ kind: "bad", text: r.error }); return; }
    setGuest(r.data.guest);
    if (r.data.ledgerId) setLastEntry({ id: r.data.ledgerId, at: stamp() });
    setMsg({ kind: "ok", text: success(r.data) });
    void loadRecent();
  }

  async function claim(p: Perk) {
    const r = await api("/api/staff/perks", { id: p.id });
    if (r.ok) { setPerks((l) => l.filter((x) => x.id !== p.id)); setMsg({ kind: "ok", text: "Marked as used. Enjoy!" }); }
    else setMsg({ kind: "bad", text: r.error });
  }

  // The undo button disappears when the 10-minute window closes.
  useEffect(() => {
    if (!lastEntry) return;
    const t = setTimeout(() => setLastEntry(null), Math.max(0, lastEntry.at + 10 * 60_000 - Date.now()));
    return () => clearTimeout(t);
  }, [lastEntry]);

  const billRead = readBill(bill);
  const billNum = billRead.value;
  const preview = guest ? pointsFor(billNum, guest.pointsPerBhd ?? 0) : 0;
  const canAdd = billRead.state === "ok" || billRead.state === "large";

  // The guest is found: the cursor goes straight to the bill, so staff type the amount without another tap.
  useEffect(() => {
    if (guest && !result) billBox.current?.focus({ preventScroll: true });
  }, [guest, result]);

  function addPoints() {
    if (!guest || !canAdd || busy) return;
    if (billRead.state === "large" && !confirmLarge) { setConfirmLarge(true); return; }
    setConfirmLarge(false);
    void act("/api/staff/earn", { cardId: guest.cardId, billBhd: billNum }, (d) => { setBill(""); setResult({ added: d.added ?? 0, first: d.guest.firstName, total: d.guest.points, ready: d.guest.rewardReady }); return `Added ${d.added} points for ${bhd(billNum)}. ${d.guest.firstName} now has ${d.guest.points}.`; });
  }
  const canUndo = lastEntry !== null;

  const today = dayKey(new Date().toISOString());
  const todays = recent.filter((r) => dayKey(r.at) === today && r.kind !== "undo");
  const todayBhd = todays.reduce((s, r) => s + (r.billBhd ? Number(r.billBhd) : 0), 0);
  const todayGuests = new Set(todays.map((r) => r.guest)).size;

  if (!me) return <PinPad role="staff" busy={busy} error={loginError} onSubmit={signIn} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} />;

  const first = me.name.split(" ")[0];

  return (
    <main className="app staff">
      <header className="st-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
        <img className="st-crest" src={`/venues/${brand.slug}/crest.png`} alt={`${me.venue}, staff`} width={96} height={96} />
        <div className="st-actions">
          <a className="chip" href="/staff/board">Table board</a>
          <button className="chip" type="button" onClick={lock}>Lock</button>
        </div>
      </header>

      {tab !== "end" && (
        <div className="st-today" aria-label="Your day so far">
          <span><b>{todays.length}</b> entries</span>
          <span><b>{todayGuests}</b> guests</span>
          <span><b>{todayBhd.toFixed(1)}</b> BHD</span>
        </div>
      )}

      {tab === "guest" ? (
        !guest ? (
          <>
            <div className="eyebrow">Hello {first}</div>
            <h1 className="st-title">Find the guest</h1>
            <p className="sub">Scan the QR on the guest&apos;s Wallet card, or type the 4-digit code under it.</p>
            {scanning ? <div className="panel"><QrScanner onCode={find} onClose={() => setScanning(false)} /></div> : (
              <button className="sc" type="button" onClick={() => setScanning(true)}>
                <span className="sc-box" aria-hidden="true"><i /><i /><i /><i /><span className="sc-line" /></span>
                <span className="sc-go">Scan the QR</span>
              </button>
            )}
            <div className="panel st-or">
              <form className="row" onSubmit={(e) => { e.preventDefault(); const c = new FormData(e.currentTarget).get("code"); if (c) find(String(c)); }}>
                <label className="field"><span className="lbl">Card code (4 digits)</span><input className="in st-code" name="code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="4827" autoComplete="off" required onChange={(e) => { const c = e.target.value.replace(/\D/g, ""); if (c.length === 4 && !busy) find(c); }} /></label>
                <button className="btn" type="submit" disabled={busy}>Find</button>
              </form>
              {msg && <p className={`msg ${msg.kind}`} role="alert">{msg.text}</p>}
            </div>
          </>
        ) : result ? (
          <section className="sr" role="status">
            <svg className="sr-check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" pathLength={1} /><path d="M20 33l8 8 16-17" pathLength={1} /></svg>
            <h1 className="st-title">Points added</h1>
            <p className="sr-fig">+<CountUp value={result.added} /><small>pts</small></p>
            <p className="sub">{result.first} now has {result.total} points.</p>
            {canUndo && <button className="sr-undo" type="button" disabled={busy} onClick={() => act("/api/staff/undo", { ledgerId: lastEntry?.id }, (d) => { setLastEntry(null); setResult(null); return `Undone. ${d.guest.firstName} has ${d.guest.points} points.`; })}>Added by mistake? <u>Undo</u> within 10 minutes</button>}
            {result.ready && <p className="msg warn">{result.first} has a reward ready.</p>}
            {result.ready ? <button className="btn primary st-big" type="button" onClick={() => setResult(null)}>Give the reward</button> : <button className="btn primary st-big" type="button" onClick={() => { setResult(null); setGuest(null); setMsg(null); }}>Next guest</button>}
          </section>
        ) : (
          <>
            <section className={`panel st-guest st-sheet${guest.rewardReady ? " st-ready" : ""}`}>
              <h2 className="st-name">{guest.firstName}</h2>
              <p className="note st-left">Code {guest.code} · {guest.visits} {guest.visits === 1 ? "visit" : "visits"}</p>
              <div className="pts"><b>{guest.points}</b><span>Points</span></div>
              <div className="bar" aria-hidden="true">{guest.points > 0 && <i style={{ width: `${Math.min(100, Math.round((guest.points / guest.goal) * 100))}%` }} />}</div>
              <p className={guest.rewardReady ? "msg warn" : "note st-left"}>{guest.rewardReady ? `Reward ready: ${guest.rewardText}. Give it and take ${guest.goal} points.` : `${guest.goal - guest.points} points to the reward.`}</p>
              {guest.rewardReady && (
                <button className="btn primary st-big" type="button" disabled={busy} onClick={() => act("/api/staff/redeem", { cardId: guest.cardId }, (d) => `Reward given. ${d.guest.firstName} now has ${d.guest.points} points.`)}>Give reward and take {guest.goal} points</button>
              )}
            </section>
            <form className="panel" onSubmit={(e) => { e.preventDefault(); addPoints(); }}>
              <label className="field">
                <span className="lbl">Bill total (BHD)</span>
                <input ref={billBox} className="in st-code" inputMode="decimal" enterKeyHint="done" placeholder="12.500" value={bill} onChange={(e) => { setBill(e.target.value); setConfirmLarge(false); }} autoComplete="off" aria-invalid={billRead.state === "bad" || billRead.state === "too_large" || undefined} aria-describedby="st-bill-note" />
              </label>
              <div className="st-quick" role="group" aria-label="Common bill amounts">
                {QUICK.map((q) => <button key={q} type="button" className={`chip${billNum === q ? " on" : ""}`} aria-pressed={billNum === q} onClick={() => { setBill(String(q)); setConfirmLarge(false); }}>{q}</button>)}
              </div>
              <p id="st-bill-note" className={`st-billnote${billRead.state === "bad" || billRead.state === "too_large" ? " bad" : confirmLarge ? " warn" : ""}`} aria-live="polite">
                {billRead.state === "bad" ? "Type the amount in BHD, for example 12.500."
                  : billRead.state === "too_large" ? `The most for one bill is BHD ${MAX_BILL_BHD.toLocaleString("en-GB")}.`
                  : confirmLarge ? `BHD ${bhdFull(billNum)} is more than ${LARGE_BILL_BHD}. Tap again if that is right.`
                  : canAdd && preview > 0 ? `${guest.firstName} will get ${preview} ${preview === 1 ? "point" : "points"}.`
                  : canAdd ? "Too small for a point." : " "}
              </p>
              <button className={`btn primary st-big${confirmLarge ? " st-confirm" : ""}`} type="submit" disabled={busy || !canAdd || preview < 1}>
                {busy ? "Adding…" : confirmLarge ? `Yes, BHD ${bhdFull(billNum)}` : preview > 0 ? `Add ${preview} ${preview === 1 ? "point" : "points"}` : "Add points"}
              </button>
              {canUndo && (
                <button className="btn danger" type="button" disabled={busy} onClick={() => act("/api/staff/undo", { ledgerId: lastEntry?.id }, (d) => { setLastEntry(null); return `Undone. ${d.guest.firstName} has ${d.guest.points} points.`; })}>Undo my last entry (10 minutes)</button>
              )}
              {msg && <p className={`msg ${msg.kind}`} role="alert">{msg.text}</p>}
            </form>
            <button className="btn" type="button" onClick={() => { setGuest(null); setMsg(null); setConfirmLarge(false); }}>Done, next guest</button>
          </>
        )
      ) : tab === "recent" ? (
        <>
          <div className="eyebrow">Today</div>
          <h1 className="st-title">Recent actions</h1>
          <section className="panel feed">
            {recent.length === 0 ? <p className="note">Nothing yet.</p> : recent.map((r) => (
              <div key={r.id}>
                <span><b className={r.points >= 0 ? "st-plus" : "st-minus"}>{r.points > 0 ? "+" : ""}{r.points}</b> {r.guest}{r.billBhd ? ` · ${bhd(Number(r.billBhd))}` : ""}{r.kind === "undo" ? " · undo" : r.kind === "redeem" ? " · reward" : ""}{r.by ? ` · ${r.by}` : ""}</span>
                <span>{time(r.at)}</span>
              </div>
            ))}
          </section>
        </>
      ) : tab === "end" ? (
        <>
          <div className="eyebrow">Shift over</div>
          <h1 className="st-title">Thank you, {first}</h1>
          <p className="sub">Today you served <b>{todayGuests}</b> {todayGuests === 1 ? "guest" : "guests"} and made <b>{todays.length}</b> {todays.length === 1 ? "entry" : "entries"}.</p>
          {perks.length > 0 ? perks.map((p) => (
            <section key={p.id} className="panel st-perk" aria-label="A thank-you for you">
              <div className="eyebrow">A thank-you from {p.from}</div>
              <h2 className="st-name">{p.title}</h2>
              {p.note && <p className="note st-left">“{p.note}”</p>}
              {p.validUntil && <p className="note st-left">Use it by {new Date(p.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.</p>}
              <button className="btn primary st-big" type="button" onClick={() => claim(p)}>Show it and mark as used</button>
            </section>
          )) : <section className="panel"><p className="note st-left">Nothing waiting for you today. Have a good evening.</p></section>}
          {msg && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}
          <button className="btn" type="button" onClick={lock}>Lock and finish</button>
        </>
      ) : (
        <>
          <div className="eyebrow">Help</div>
          <h1 className="st-title">How it works</h1>
          <ol className="panel st-help">
            <li>Scan the QR on the guest&apos;s card, or type the card code.</li>
            <li>Check the first name with the guest.</li>
            <li>Type the bill and tap <b>Add points</b>.</li>
            <li>If a reward is ready, tap <b>Give reward</b>.</li>
            <li>Made a mistake? <b>Undo</b> works for 10 minutes.</li>
            <li>At the end of your shift, open <b>End</b> to see your day and any thank-you waiting for you.</li>
          </ol>
        </>
      )}

      <nav className="st-tabs" aria-label="Staff sections">
        {(["guest", "recent", "help", "end"] as Tab[]).map((t) => (
          <button key={t} type="button" className={`btn${tab === t ? " on" : ""}`} onClick={() => { setTab(t); setMsg(null); if (t === "recent") void loadRecent(); if (t === "end") { void loadRecent(); void loadPerks(); } }}>
            {t === "end" ? "End" : t[0].toUpperCase() + t.slice(1)}
            {t === "end" && perks.length > 0 && <i className="st-dot" aria-label={`${perks.length} reward waiting`} />}
          </button>
        ))}
      </nav>
      <p className="foot">{[`Signed in as ${me.name}`, brand.poweredBy].filter(Boolean).join(" · ")}</p>
    </main>
  );
}
