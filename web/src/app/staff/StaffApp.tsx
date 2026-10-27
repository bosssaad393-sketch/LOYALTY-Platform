"use client";

import { useCallback, useEffect, useState } from "react";
import QrScanner from "./QrScanner";
import SignIn, { type SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";

type Me = { name: string; role: string; venue: string };
type Guest = { cardId: string; firstName: string; code: string; points: number; visits: number; goal: number; rewardText: string; rewardReady: boolean };
type Recent = { id: number; kind: string; points: number; billBhd: number | null; at: string; by: string; guest: string };
type Tab = "guest" | "recent" | "help";

async function api<T>(path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const res = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: "No connection. Try again.", status: 0 };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Something went wrong.", status: res.status };
}

const bhd = (n: number) => `BHD ${n.toFixed(3)}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bahrain" });

export default function StaffApp({ initialMe, look, brand }: { initialMe: Me | null; look: SignInLook; brand: BrandProps }) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const [tab, setTab] = useState<Tab>("guest");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [bill, setBill] = useState("");
  const [lastEntry, setLastEntry] = useState<{ id: number; at: number } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  const signedOut = useCallback(() => { setMe(null); setGuest(null); }, []);

  async function signIn(email: string, password: string) {
    setBusy(true); setMsg(null);
    const r = await api<Me>("/api/staff/login", { email, password });
    setBusy(false);
    if (r.ok) setMe(r.data); else setMsg({ kind: "bad", text: r.error });
  }

  async function lock() {
    await api("/api/staff/logout", {});
    signedOut();
  }

  const find = useCallback(async (code: string) => {
    setScanning(false); setMsg(null); setBusy(true);
    const r = await api<Guest>(`/api/staff/card?code=${encodeURIComponent(code)}`);
    setBusy(false);
    if (r.ok) { setGuest(r.data); setBill(""); setLastEntry(null); }
    else if (r.status === 401) signedOut();
    else setMsg({ kind: "bad", text: r.error });
  }, [signedOut]);

  async function act(path: string, body: unknown, success: (d: { guest: Guest; ledgerId?: number; added?: number }) => string) {
    setBusy(true); setMsg(null);
    const r = await api<{ guest: Guest; ledgerId?: number; added?: number }>(path, body);
    setBusy(false);
    if (!r.ok) { if (r.status === 401) signedOut(); else setMsg({ kind: "bad", text: r.error }); return; }
    setGuest(r.data.guest);
    if (r.data.ledgerId) setLastEntry({ id: r.data.ledgerId, at: Date.now() });
    setMsg({ kind: "ok", text: success(r.data) });
  }

  // The undo button disappears when the 10-minute window closes.
  useEffect(() => {
    if (!lastEntry) return;
    const t = setTimeout(() => setLastEntry(null), Math.max(0, lastEntry.at + 10 * 60_000 - Date.now()));
    return () => clearTimeout(t);
  }, [lastEntry]);

  useEffect(() => {
    if (tab !== "recent" || !me) return;
    api<{ items: Recent[] }>("/api/staff/recent").then((r) => { if (r.ok) setRecent(r.data.items); else if (r.status === 401) signedOut(); });
  }, [tab, me, signedOut]);

  const billNum = Number(bill.replace(",", "."));
  const canUndo = lastEntry !== null;

  if (!me) return <SignIn role="staff" look={look} busy={busy} error={msg?.kind === "bad" ? msg.text : null} onSubmit={signIn} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} />;

  return (
    <main className="app staff">
      <header className="st-head">
        <span className="st-brand">{me.venue} <small>Staff</small></span>
        <button className="chip" type="button" onClick={lock}>Lock</button>
      </header>

      {tab === "guest" ? (
        !guest ? (
          <>
            <div className="eyebrow">Find the guest</div>
            <h1 className="st-title">Scan their card</h1>
            <p className="sub">Scan the QR on the guest&apos;s Wallet card, or type the 4-digit code under it.</p>
            <div className="panel">
              {scanning ? <QrScanner onCode={find} onClose={() => setScanning(false)} /> : <button className="btn primary" type="button" onClick={() => setScanning(true)}>Scan the QR</button>}
              <form className="row" onSubmit={(e) => { e.preventDefault(); const c = new FormData(e.currentTarget).get("code"); if (c) find(String(c)); }}>
                <label className="field"><span className="lbl">Card code (4 digits)</span><input className="in" name="code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="e.g. 4827" required /></label>
                <button className="btn" type="submit" disabled={busy}>Find</button>
              </form>
              {msg && <p className={`msg ${msg.kind}`} role="alert">{msg.text}</p>}
            </div>
          </>
        ) : (
          <>
            <section className="panel st-guest">
              <h2 className="st-name">{guest.firstName}</h2>
              <p className="note st-left">Code {guest.code} · {guest.visits} {guest.visits === 1 ? "visit" : "visits"}</p>
              <div className="pts"><b>{guest.points}</b><span>Points</span></div>
              <div className="bar" aria-hidden="true"><i style={{ width: `${Math.max(3, Math.min(100, Math.round((guest.points / guest.goal) * 100)))}%` }} /></div>
              <p className={guest.rewardReady ? "msg warn" : "note st-left"}>{guest.rewardReady ? `Reward ready: ${guest.rewardText}. Give it and take ${guest.goal} points.` : `${guest.goal - guest.points} points to the reward.`}</p>
            </section>
            <section className="panel">
              <label className="field">
                <span className="lbl">Bill total (BHD)</span>
                <input className="in" inputMode="decimal" placeholder="e.g. 12.500" value={bill} onChange={(e) => setBill(e.target.value)} />
              </label>
              <button className="btn primary" type="button" disabled={busy || !(billNum > 0)} onClick={() => act("/api/staff/earn", { cardId: guest.cardId, billBhd: billNum }, (d) => `Added ${d.added} points for ${bhd(billNum)}. ${d.guest.firstName} now has ${d.guest.points}.`)}>Add points</button>
              {guest.rewardReady && (
                <button className="btn" type="button" disabled={busy} onClick={() => act("/api/staff/redeem", { cardId: guest.cardId }, (d) => `Reward given. ${d.guest.firstName} now has ${d.guest.points} points.`)}>Give reward and take {guest.goal} points</button>
              )}
              {canUndo && (
                <button className="btn danger" type="button" disabled={busy} onClick={() => act("/api/staff/undo", { ledgerId: lastEntry?.id }, (d) => { setLastEntry(null); return `Undone. ${d.guest.firstName} has ${d.guest.points} points.`; })}>Undo my last entry (10 minutes)</button>
              )}
              {msg && <p className={`msg ${msg.kind}`} role="alert">{msg.text}</p>}
            </section>
            <button className="btn" type="button" onClick={() => { setGuest(null); setMsg(null); }}>Done, next guest</button>
          </>
        )
      ) : tab === "recent" ? (
        <>
          <div className="eyebrow">Today</div>
          <h1 className="st-title">Recent actions</h1>
          <section className="panel feed">
            {recent.length === 0 ? <p className="note">Nothing yet.</p> : recent.map((r) => (
              <div key={r.id}>
                <span>{r.points > 0 ? "+" : ""}{r.points} points for {r.guest}{r.billBhd ? ` (${bhd(Number(r.billBhd))})` : ""}{r.kind === "undo" ? " · undo" : r.kind === "redeem" ? " · reward" : ""}{r.by ? ` by ${r.by}` : ""}</span>
                <span>{time(r.at)}</span>
              </div>
            ))}
          </section>
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
          </ol>
        </>
      )}

      {me && (
        <nav className="st-tabs" aria-label="Staff sections">
          {(["guest", "recent", "help"] as Tab[]).map((t) => (
            <button key={t} type="button" className={`btn${tab === t ? " on" : ""}`} onClick={() => { setTab(t); setMsg(null); }}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </nav>
      )}
      <p className="foot">{[me ? `Signed in as ${me.name}` : "", brand.poweredBy].filter(Boolean).join(" · ")}</p>
    </main>
  );
}
