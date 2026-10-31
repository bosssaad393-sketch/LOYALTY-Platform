"use client";

import { useEffect, useState } from "react";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import SignIn, { type SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";
import { api } from "../owner/api";
import type { Me, Note } from "../owner/types";
import { Msg } from "../owner/ui";
import AllScreens from "./AllScreens";
import "./dev.css";

type Ev = { id: number; kind: string; receipt: string | null; outcome: string; points: number | null; detail: string | null; createdAt: string };
type Pos = {
  configured: boolean;
  status: "active" | "disabled" | null;
  keyPrefix: string | null;
  lastEventAt: string | null;
  endpoint: string;
  providers: { id: string; name: string; status: string; note: string }[];
  events: Ev[];
};
type Req = { id: string; message: string; why: string; status: string; result: string | null; createdAt: string };
type Person = { id: string; name: string; role: string; active: boolean; hasPin: boolean };
export type Section = "overview" | "screens" | "till" | "requests" | "calabos" | "access";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const WHY: Record<string, string> = { unsupported: "Not built yet", role: "Needs the owner", limit: "Over the limit", failed: "Failed" };
const REPLIES = ["Done, please check it.", "Needs a quick call with you.", "Scheduled for this week.", "Not possible, we suggest another way."];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (id: string, text: string) => {
      try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600); } catch { setCopied(null); }
    },
  };
}

/** Developer area: one place to see the health of this client, connect the till, answer the owner's requests, and give people their first PIN. */
export default function DevApp({ initialMe, mock = false, look, brand, initialSection = "overview" }: { initialMe: Me | null; mock?: boolean; look: SignInLook; brand: BrandProps; initialSection?: Section }) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>(initialSection);
  const [pos, setPos] = useState<Pos | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [team, setTeam] = useState<Person[] | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  const isDev = me?.role === "developer";

  useEffect(() => {
    if (!isDev) return;
    let live = true;
    Promise.all([api<Pos>("/api/dev/pos", "GET", undefined, mock), api<{ requests: Req[] }>("/api/dev/requests", "GET", undefined, mock), api<{ team: Person[] }>("/api/dev/team", "GET", undefined, mock)]).then(([a, b, c]) => {
      if (!live) return;
      if (a.ok) setPos(a.data);
      if (b.ok) setReqs(b.data.requests);
      if (c.ok) setTeam(c.data.team);
    });
    return () => { live = false; };
  }, [isDev, mock, tick]);

  async function signIn(email: string, password: string) {
    setBusy(true); setError(null);
    const r = await api<Me>("/api/staff/login", "POST", { email, password }, mock);
    setBusy(false);
    if (r.ok) setMe(r.data); else setError(r.error);
  }

  if (!me) return <SignIn role="owner" look={look} busy={busy} error={error} onSubmit={signIn} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} />;

  const open = reqs?.filter((r) => r.status !== "done").length ?? 0;
  const NAV: { id: Section; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "screens", label: "All screens" },
    { id: "till", label: "Till (POS)" },
    { id: "requests", label: "Requests", badge: open },
    { id: "calabos", label: "CALABOS" },
    { id: "access", label: "Access" },
  ];

  return (
    <div className="ow dv">
      <NetworkBackdrop fixed />
      <div className="dv-shell">
        <aside className="dv-side">
          <div className="dv-brand"><img src="/loyalty-logo.svg" alt="LOYALTY, developer" width={72} height={72} /></div>
          <nav className="dv-nav" aria-label="Developer sections">
            {NAV.map((n) => (
              <button key={n.id} type="button" className="dv-navbtn" aria-current={section === n.id ? "page" : undefined} onClick={() => setSection(n.id)}>
                {n.label}{!!n.badge && <i className="dv-badge" aria-label={`${n.badge} open`}>{n.badge}</i>}
              </button>
            ))}
          </nav>
          <button className="ow-chip dv-lock" type="button" onClick={async () => { await api("/api/staff/logout", "POST", {}, mock); setMe(null); }}>Lock</button>
          {brand.poweredBy && <p className="dv-powered">{brand.poweredBy}</p>}
        </aside>
        <main className="dv-main" id="ow-main" tabIndex={-1}>
          {!isDev ? (
            <section className="ow-panel"><p className="ow-msg bad">This area is for developer logins.</p></section>
          ) : section === "overview" ? <Overview pos={pos} reqs={reqs} team={team} go={setSection} />
            : section === "screens" ? <AllScreens brand={brand} mock={mock} />
            : section === "till" ? <Till pos={pos} mock={mock} reload={reload} />
            : section === "requests" ? <Requests reqs={reqs} mock={mock} reload={reload} />
            : section === "calabos" ? <CalabosChat mock={mock} />
            : <Access team={team} mock={mock} reload={reload} />}
        </main>
      </div>
      {mock && <span className="ow-mockflag">Mock data</span>}
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "off"; children: React.ReactNode }) {
  return <span className={`dv-pill dv-${tone}`}>{children}</span>;
}

function Head({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <header className="dv-head"><p className="dv-eyebrow">{eyebrow}</p><h1>{title}</h1>{children && <p className="dv-lede">{children}</p>}</header>;
}

function Overview({ pos, reqs, team, go }: { pos: Pos | null; reqs: Req[] | null; team: Person[] | null; go: (s: Section) => void }) {
  const [now] = useState(() => Date.now());
  if (!pos || !reqs || !team) return <p className="ow-sub">Loading…</p>;
  const day = now - 86_400_000;
  const recent = pos.events.filter((e) => new Date(e.createdAt).getTime() > day);
  const problems = recent.filter((e) => e.outcome === "rejected" || e.outcome === "error").length;
  const open = reqs.filter((r) => r.status !== "done").length;
  const noPin = team.filter((p) => p.active && !p.hasPin).length;
  const gotPing = pos.events.some((e) => e.kind === "ping");
  const gotSale = pos.events.some((e) => e.kind === "sale" && e.outcome === "ok");
  const steps = [
    { done: pos.configured, label: "Make the till key", to: "till" as Section },
    { done: gotPing, label: "Send a test ping from the till", to: "till" as Section },
    { done: gotSale, label: "Receive the first real sale", to: "till" as Section },
    { done: noPin === 0 && team.length > 0, label: "Give everyone a PIN", to: "access" as Section },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <>
      <Head eyebrow="This client" title="Overview">Everything that needs you, in one place.</Head>
      <div className="dv-tiles">
        <div className="dv-tile"><span>Till link</span><b>{!pos.configured ? <Pill tone="off">Not connected</Pill> : pos.status === "active" ? <Pill tone="ok">Active</Pill> : <Pill tone="warn">Switched off</Pill>}</b></div>
        <div className="dv-tile"><span>Last till message</span><b>{ago(pos.lastEventAt)}</b></div>
        <div className="dv-tile"><span>Till, last 24 h</span><b>{recent.length}<small>{problems ? ` · ${problems} problem${problems === 1 ? "" : "s"}` : " · no problems"}</small></b></div>
        <button type="button" className="dv-tile dv-tilebtn" onClick={() => go("requests")}><span>Open requests</span><b>{open}</b></button>
      </div>
      <section className="ow-panel" aria-labelledby="dv-setup">
        <h2 className="ow-h" id="dv-setup">Set-up checklist</h2>
        <ol className="dv-steps">
          {steps.map((s, i) => (
            <li key={s.label} className={s.done ? "done" : i === next ? "next" : ""}>
              <span className="dv-tick" aria-hidden="true">{s.done ? <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}</span>
              <span>{s.label}</span>
              {!s.done && <button type="button" className="ow-btn small" onClick={() => go(s.to)}>{i === next ? "Do this next" : "Open"}</button>}
            </li>
          ))}
        </ol>
      </section>
      {problems > 0 && (
        <section className="ow-panel" aria-labelledby="dv-prob">
          <h2 className="ow-h" id="dv-prob">Needs a look</h2>
          <ul className="ow-list">
            {recent.filter((e) => e.outcome === "rejected" || e.outcome === "error").slice(0, 4).map((e) => (
              <li key={e.id} className="ow-item"><span className="ow-item-main">{e.kind} {e.receipt ?? ""}<br /><small>{e.detail ?? "Error"}</small></span><span className="ow-item-side">{ago(e.createdAt)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Till({ pos, mock, reload }: { pos: Pos | null; mock: boolean; reload: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const { copied, copy } = useCopy();
  if (!pos) return <p className="ow-sub">Loading…</p>;

  async function makeKey() {
    if (pos?.configured && !window.confirm("A new key replaces the old one. The till stops working until it uses the new key. Continue?")) return;
    const r = await api<{ key: string }>("/api/dev/pos", "POST", {}, mock);
    if (!r.ok) { setNote({ kind: "bad", text: r.error }); return; }
    setKey(r.data.key); setNote(null); reload();
  }
  async function toggle() {
    const r = await api("/api/dev/pos", "PATCH", { status: pos?.status === "active" ? "disabled" : "active" }, mock);
    if (!r.ok) setNote({ kind: "bad", text: r.error }); else reload();
  }
  const sample = `curl -X POST ${pos.endpoint} \\\n  -H "Authorization: Bearer ${key ?? "<your key>"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"ping"}'`;
  const shown = pos.events.filter((e) => filter === "all" || e.outcome === "rejected" || e.outcome === "error");
  const tone = (o: string) => (o === "ok" ? "ok" : o === "duplicate" ? "warn" : "bad");

  return (
    <>
      <Head eyebrow="Developer" title="Connect the till (POS)">The till calls the address below after each sale or refund. Points are added or taken back on the guest&apos;s card.</Head>
      <section className="ow-panel" aria-labelledby="dv-conn">
        <div className="dv-rowhead">
          <h2 className="ow-h" id="dv-conn">Generic webhook</h2>
          {!pos.configured ? <Pill tone="off">Not connected</Pill> : pos.status === "active" ? <Pill tone="ok">Active</Pill> : <Pill tone="warn">Switched off</Pill>}
        </div>
        <div className="dv-field">
          <span className="dv-lbl">Address (POST, JSON)</span>
          <div className="dv-copyrow"><code>{pos.endpoint}</code><button type="button" className="ow-btn small" onClick={() => copy("addr", pos.endpoint)}>{copied === "addr" ? "Copied" : "Copy"}</button></div>
        </div>
        <div className="dv-field">
          <span className="dv-lbl">Key</span>
          <div className="dv-copyrow"><code>{key ?? (pos.keyPrefix ? `${pos.keyPrefix}••••••••••••` : "No key yet")}</code>{key && <button type="button" className="ow-btn small" onClick={() => copy("key", key)}>{copied === "key" ? "Copied" : "Copy"}</button>}</div>
          {key && <p className="dv-warn" role="status">Copy it now. It is shown once and cannot be read again.</p>}
        </div>
        <div className="ow-actions">
          <button className="ow-btn primary" type="button" onClick={makeKey}>{pos.configured ? "Make a new key" : "Make a key"}</button>
          {pos.configured && <button className="ow-btn" type="button" onClick={toggle}>{pos.status === "active" ? "Switch off" : "Switch on"}</button>}
        </div>
        <Msg note={note} />
        <div className="dv-field">
          <div className="dv-rowhead"><span className="dv-lbl">Test from a terminal</span><button type="button" className="ow-btn small" onClick={() => copy("curl", sample)}>{copied === "curl" ? "Copied" : "Copy"}</button></div>
          <pre className="dv-code">{sample}</pre>
        </div>
        <details className="dv-more">
          <summary>Messages the till can send</summary>
          <pre className="dv-code">{`{"type":"sale","receiptId":"R-1001","cardCode":"1234","billBhd":12.5}\n{"type":"refund","receiptId":"R-1001"}\n{"type":"ping"}`}</pre>
        </details>
      </section>

      <section className="ow-panel" aria-labelledby="dv-ev">
        <div className="dv-rowhead">
          <h2 className="ow-h" id="dv-ev">Last events</h2>
          <div className="dv-seg" role="group" aria-label="Filter events">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
            <button type="button" aria-pressed={filter === "problems"} onClick={() => setFilter("problems")}>Problems</button>
          </div>
        </div>
        {shown.length === 0 ? <p className="ow-sub">{filter === "problems" ? "No problems. Good." : "Nothing received yet. Send a ping to test."}</p> : (
          <ul className="ow-list">
            {shown.map((e) => (
              <li key={e.id} className="ow-item">
                <span className="ow-item-main"><b>{e.kind}</b> {e.receipt ?? ""}{e.detail ? <><br /><small>{e.detail}</small></> : null}</span>
                <span className="ow-item-side"><Pill tone={tone(e.outcome)}>{e.outcome}</Pill>{e.points != null ? <> <b>{e.points > 0 ? "+" : ""}{e.points}</b></> : null}<br /><small>{ago(e.createdAt)}</small></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ow-panel" aria-labelledby="dv-prov">
        <h2 className="ow-h" id="dv-prov">Ready-made links</h2>
        <ul className="ow-list">
          {pos.providers.map((p) => (
            <li key={p.id} className="ow-item"><span className="ow-item-main">{p.name}<br /><small>{p.note}</small></span><span className="ow-item-side"><Pill tone={p.status === "available" ? "ok" : "off"}>{p.status === "available" ? "Available" : "Planned"}</Pill></span></li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Requests({ reqs, mock, reload }: { reqs: Req[] | null; mock: boolean; reload: () => void }) {
  const [tab, setTab] = useState<"open" | "in_progress" | "done">("open");
  const [note, setNote] = useState<Note | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  if (!reqs) return <p className="ow-sub">Loading…</p>;
  const count = (s: string) => reqs.filter((r) => r.status === s).length;
  const shown = reqs.filter((r) => r.status === tab);

  async function set(id: string, status: "in_progress" | "done") {
    const r = await api("/api/dev/requests", "PATCH", { id, status, result: text[id]?.trim() || undefined }, mock);
    if (!r.ok) setNote({ kind: "bad", text: r.error }); else { setNote(null); reload(); }
  }

  return (
    <>
      <Head eyebrow="From the owner chat" title="Requests">What the owner asked for that the assistant passed on. The owner sees the status and your short answer.</Head>
      <div className="dv-seg dv-segwide" role="tablist" aria-label="Request status">
        {([["open", "New"], ["in_progress", "In progress"], ["done", "Done"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label} <i>{count(k)}</i></button>
        ))}
      </div>
      <Msg note={note} />
      {shown.length === 0 ? <section className="ow-panel"><p className="ow-sub">{tab === "open" ? "Nothing new. All caught up." : "Nothing here."}</p></section> : shown.map((r) => (
        <article key={r.id} className="ow-panel dv-req">
          <div className="dv-rowhead"><Pill tone={r.why === "failed" ? "bad" : "warn"}>{WHY[r.why] ?? r.why}</Pill><small>{ago(r.createdAt)}</small></div>
          <p className="dv-msg">{r.message}</p>
          {r.status === "done" ? (r.result && <p className="ow-sub">Answer: {r.result}</p>) : (
            <>
              <label className="sr-only" htmlFor={`res-${r.id}`}>Answer for the owner</label>
              <input id={`res-${r.id}`} className="ow-in" maxLength={500} placeholder="Short answer the owner will see" value={text[r.id] ?? ""} onChange={(e) => setText({ ...text, [r.id]: e.target.value })} />
              <div className="ow-chips" role="group" aria-label="Quick answers">{REPLIES.map((q) => <button key={q} type="button" className="ow-chip" onClick={() => setText({ ...text, [r.id]: q })}>{q}</button>)}</div>
              <div className="ow-actions">
                {r.status === "open" && <button className="ow-btn" type="button" onClick={() => set(r.id, "in_progress")}>Start</button>}
                <button className="ow-btn primary" type="button" onClick={() => set(r.id, "done")}>Mark done</button>
              </div>
            </>
          )}
        </article>
      ))}
    </>
  );
}

function Access({ team, mock, reload }: { team: Person[] | null; mock: boolean; reload: () => void }) {
  const [shown, setShown] = useState<{ who: string; pin: string } | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const { copied, copy } = useCopy();
  if (!team) return <p className="ow-sub">Loading…</p>;

  async function setPin(p: Person) {
    if (p.hasPin && !window.confirm(`Make a new PIN for ${p.name}? The old one stops working at once.`)) return;
    const r = await api<{ pin: string }>("/api/dev/pin", "POST", { staffId: p.id }, mock);
    if (!r.ok) { setNote({ kind: "bad", text: r.error }); return; }
    setNote(null); setShown({ who: p.name, pin: r.data.pin }); reload();
  }

  return (
    <>
      <Head eyebrow="Sign-in" title="Access">Everyone signs in with a PIN. Give the owner theirs here, then the owner looks after their own team.</Head>
      {shown && (
        <div className="ow-msg ok" role="status">
          <p>PIN for {shown.who}. Hand it over in person; it is shown once.</p>
          <p className="ow-pin">{shown.pin}</p>
          <button type="button" className="ow-btn small" onClick={() => copy("pin", shown.pin)}>{copied === "pin" ? "Copied" : "Copy"}</button>
        </div>
      )}
      <Msg note={note} />
      <section className="ow-panel ow-flush" aria-label="People">
        <ul className="ow-list">
          {team.map((p) => (
            <li key={p.id} className="ow-item">
              <span className="ow-item-main"><b>{p.name}</b> <em className="ow-tag">{p.role}</em>{!p.active && <span className="ow-off">deactivated</span>}<br /><small>{p.hasPin ? "PIN set" : "No PIN yet"}</small></span>
              <span className="ow-item-side">{p.active && <button type="button" className={`ow-btn small${p.hasPin ? "" : " primary"}`} onClick={() => setPin(p)}>{p.hasPin ? "New PIN" : "Give a PIN"}</button>}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

type Msg = { id: string; author: "dev" | "calabos"; body: string; status: string; replyTo: string | null; createdAt: string };

/** Chat with CALABOS: write what you need done about LOYALTY. CALABOS (on your PC) picks it up, turns requests into tasks and answers here. */
function CalabosChat({ mock }: { mock: boolean }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    api<{ messages: Msg[] }>("/api/dev/calabos", "GET", undefined, mock).then((r) => { if (live && r.ok) setMsgs(r.data.messages); });
    const t = setInterval(() => setTick((n) => n + 1), 6000);
    return () => { live = false; clearInterval(t); };
  }, [mock, tick]);

  useEffect(() => { document.getElementById("cal-end")?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const m = text.trim();
    if (!m || busy) return;
    setBusy(true); setNote(null);
    const r = await api("/api/dev/calabos", "POST", { message: m }, mock);
    setBusy(false);
    if (!r.ok) { setNote({ kind: "bad", text: r.error }); return; }
    setText(""); setTick((n) => n + 1);
  }

  const waiting = msgs?.filter((x) => x.author === "dev" && x.status === "new").length ?? 0;

  return (
    <>
      <Head eyebrow="Your assistant" title="CALABOS">Tell CALABOS what you need done about LOYALTY. It queues it as a task and answers here. It answers when your PC is on and CALABOS is running.</Head>
      <section className="ow-panel" aria-label="Chat with CALABOS">
        <div className="dv-log" role="log" aria-live="polite">
          {!msgs ? <p className="ow-sub">Loading…</p> : msgs.length === 0 ? <p className="ow-sub">No messages yet. Try: “Add a seasonal card for Eid”.</p> : msgs.map((m) => (
            <p key={m.id} className={`dv-bubble ${m.author}`}><span className="sr-only">{m.author === "dev" ? "You: " : "CALABOS: "}</span>{m.body}<small>{ago(m.createdAt)}{m.author === "dev" && m.status === "new" ? " · waiting for CALABOS" : ""}</small></p>
          ))}
          <div id="cal-end" />
        </div>
        {waiting > 0 && <p className="ow-sub">CALABOS has not picked up {waiting === 1 ? "your last message" : `${waiting} messages`} yet. It does so when it is running on your PC.</p>}
        <form onSubmit={send}>
          <label className="sr-only" htmlFor="cal-in">Message for CALABOS</label>
          <textarea id="cal-in" className="ow-in dv-text" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: check why the owner chat feels slow, or prepare the Eid card design" />
          <div className="ow-actions"><button className="ow-btn primary" type="submit" disabled={busy || !text.trim()}>Send to CALABOS</button></div>
        </form>
        <Msg note={note} />
      </section>
    </>
  );
}
