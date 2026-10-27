"use client";

import { useCallback, useEffect, useState } from "react";
import SignIn, { type SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";
import { api } from "../owner/api";
import type { Me, Note } from "../owner/types";
import { Msg, PageHead } from "../owner/ui";

type Pos = {
  configured: boolean;
  status: "active" | "disabled" | null;
  keyPrefix: string | null;
  lastEventAt: string | null;
  endpoint: string;
  providers: { id: string; name: string; status: string; note: string }[];
  events: { id: number; kind: string; receipt: string | null; outcome: string; points: number | null; detail: string | null; createdAt: string }[];
};
type Req = { id: string; message: string; why: string; status: string; result: string | null; createdAt: string };

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Bahrain" }) : "never");

/** Developer area: connect the client's till (POS) and work through what the owner chat passed on. Developer logins only. */
export default function DevApp({ initialMe, mock = false, look, brand }: { initialMe: Me | null; mock?: boolean; look: SignInLook; brand: BrandProps }) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(email: string, password: string) {
    setBusy(true); setError(null);
    const r = await api<Me>("/api/staff/login", "POST", { email, password }, mock);
    setBusy(false);
    if (r.ok) setMe(r.data); else setError(r.error);
  }

  if (!me) return <SignIn role="owner" look={look} busy={busy} error={error} onSubmit={signIn} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} />;

  return (
    <div className="ow">
      <div className="ow-shell">
        <aside className="ow-side">
          <div className="ow-brand"><span className="ow-name">{me.venue}<small>Developer</small></span></div>
          <button className="ow-chip ow-lock" type="button" onClick={async () => { await api("/api/staff/logout", "POST", {}, mock); setMe(null); }}>Lock</button>
          <p className="ow-who">Signed in as {me.name}</p>
        </aside>
        <main className="ow-main" id="ow-main" tabIndex={-1}>
          {me.role !== "developer" ? (
            <section className="ow-panel"><p className="ow-msg bad">This area is for developer logins.</p></section>
          ) : (
            <>
              <PosPanel mock={mock} />
              <Inbox mock={mock} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PosPanel({ mock }: { mock: boolean }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const load = useCallback(async () => {
    const r = await api<Pos>("/api/dev/pos", "GET", undefined, mock);
    if (r.ok) setPos(r.data); else setNote({ kind: "bad", text: r.error });
  }, [mock]);
  useEffect(() => {
    let live = true;
    api<Pos>("/api/dev/pos", "GET", undefined, mock).then((r) => { if (live && r.ok) setPos(r.data); });
    return () => { live = false; };
  }, [mock]);

  async function makeKey() {
    if (pos?.configured && !window.confirm("A new key replaces the old one. The till stops working until it uses the new key. Continue?")) return;
    const r = await api<{ key: string }>("/api/dev/pos", "POST", {}, mock);
    if (!r.ok) { setNote({ kind: "bad", text: r.error }); return; }
    setKey(r.data.key); setNote(null); void load();
  }
  async function toggle() {
    if (!pos) return;
    const r = await api("/api/dev/pos", "PATCH", { status: pos.status === "active" ? "disabled" : "active" }, mock);
    if (!r.ok) setNote({ kind: "bad", text: r.error }); else void load();
  }

  return (
    <>
      <PageHead eyebrow="Developer" title="Connect the till (POS)">The till calls the address below after each sale or refund. Points are added or taken back on the guest&apos;s card.</PageHead>
      <section className="ow-panel" aria-labelledby="pos-h">
        <h2 className="ow-h" id="pos-h">Generic webhook</h2>
        {!pos ? <p className="ow-sub">Loading…</p> : (
          <>
            <p className="ow-sub">Status: <strong>{pos.configured ? pos.status : "not connected"}</strong>{pos.keyPrefix ? ` · key ${pos.keyPrefix}…` : ""} · last event: {when(pos.lastEventAt)}</p>
            <p className="ow-sub">Address (POST, JSON): <code>{pos.endpoint}</code><br />Header: <code>Authorization: Bearer &lt;key&gt;</code></p>
            <pre className="ow-sub" style={{ whiteSpace: "pre-wrap" }}>{`{"type":"sale","receiptId":"R-1001","cardCode":"1234","billBhd":12.5}\n{"type":"refund","receiptId":"R-1001"}\n{"type":"ping"}`}</pre>
            <div className="ow-actions">
              <button className="ow-btn primary" type="button" onClick={makeKey}>{pos.configured ? "Make a new key" : "Make a key"}</button>
              {pos.configured && <button className="ow-btn" type="button" onClick={toggle}>{pos.status === "active" ? "Switch off" : "Switch on"}</button>}
            </div>
            {key && (
              <p className="ow-msg ok" role="status">Copy this key now. It is shown once and cannot be read again:<br /><code style={{ overflowWrap: "anywhere" }}>{key}</code></p>
            )}
            <Msg note={note} />
            <h3 className="ow-h">Systems</h3>
            <ul className="ow-list">
              {pos.providers.map((p) => (
                <li key={p.id} className="ow-item"><span className="ow-item-main">{p.name}<br /><small>{p.note}</small></span><span className="ow-item-side">{p.status === "available" ? "Available" : "Planned"}</span></li>
              ))}
            </ul>
            <h3 className="ow-h">Last events</h3>
            {pos.events.length === 0 ? <p className="ow-sub">Nothing received yet. Send a ping to test.</p> : (
              <ul className="ow-list">
                {pos.events.map((e) => (
                  <li key={e.id} className="ow-item"><span className="ow-item-main">{e.kind} {e.receipt ?? ""}{e.detail ? <><br /><small>{e.detail}</small></> : null}</span><span className="ow-item-side">{e.outcome}{e.points != null ? ` · ${e.points} pts` : ""}<br /><small>{when(e.createdAt)}</small></span></li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Inbox({ mock }: { mock: boolean }) {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [text, setText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await api<{ requests: Req[] }>("/api/dev/requests", "GET", undefined, mock);
    if (r.ok) setReqs(r.data.requests); else setNote({ kind: "bad", text: r.error });
  }, [mock]);
  useEffect(() => {
    let live = true;
    api<{ requests: Req[] }>("/api/dev/requests", "GET", undefined, mock).then((r) => { if (live && r.ok) setReqs(r.data.requests); });
    return () => { live = false; };
  }, [mock]);

  async function set(id: string, status: "in_progress" | "done") {
    const r = await api("/api/dev/requests", "PATCH", { id, status, result: text[id]?.trim() || undefined }, mock);
    if (!r.ok) setNote({ kind: "bad", text: r.error }); else { setNote(null); void load(); }
  }

  return (
    <section className="ow-panel" aria-labelledby="inb-h">
      <h2 className="ow-h" id="inb-h">Requests from the owner chat</h2>
      <Msg note={note} />
      {!reqs ? <p className="ow-sub">Loading…</p> : reqs.length === 0 ? <p className="ow-sub">No requests.</p> : (
        <ul className="ow-list">
          {reqs.map((r) => (
            <li key={r.id} className="ow-item" style={{ display: "block" }}>
              <p className="ow-wrap"><strong>{r.status}</strong> · {r.why} · {when(r.createdAt)}<br />{r.message}</p>
              {r.status !== "done" && (
                <>
                  <label className="sr-only" htmlFor={`res-${r.id}`}>Result for the owner</label>
                  <input id={`res-${r.id}`} className="ow-in" maxLength={500} placeholder="Short result the owner will see" value={text[r.id] ?? ""} onChange={(e) => setText({ ...text, [r.id]: e.target.value })} />
                  <div className="ow-actions">
                    {r.status === "open" && <button className="ow-btn small" type="button" onClick={() => set(r.id, "in_progress")}>Start</button>}
                    <button className="ow-btn primary small" type="button" onClick={() => set(r.id, "done")}>Mark done</button>
                  </div>
                </>
              )}
              {r.status === "done" && r.result && <p className="ow-sub">{r.result}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
