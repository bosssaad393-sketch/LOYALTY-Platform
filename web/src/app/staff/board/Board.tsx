"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { minutesBetween, READY_MINUTES } from "@/lib/table/rules";
import "./board.css";
import { filsMoney } from "@/lib/format";

type Line = { name: string; qty: number; note: string | null };
type Order = { id: string; table: string; status: "new" | "accepted" | "ready"; source: string; at: string; acceptedAt: string | null; readyMinutes: number | null; lines: Line[] };
type Call = { id: string; table: string; kind: string; at: string };
type TabRow = { id: string; table: string; openedAt: string; totalFils: number; paidFils: number; balanceFils: number; paying: boolean; pointsTo: string | null; canClose: boolean };
type CardPaid = { id: string; table: string; amountFils: number; method: string | null; at: string; closed: boolean };
type GuestCancelled = { id: string; table: string; at: string; lines: { name: string; qty: number }[] };
type MenuCat = { id: string; name: string; items: { id: string; name: string; priceFils: number; available: boolean }[] };
type BoardData = { now: string; tables: { id: string; label: string }[]; calls: Call[]; orders: Order[]; tabs: TabRow[]; cardPaid: CardPaid[]; guestCancelled?: GuestCancelled[]; menu: MenuCat[] };
type View = "live" | "tabs" | "add" | "soldout";

const POLL_MS = 4000;
/** While the board is in the background it still checks, less often, so the alert can reach a locked or switched-away screen. */
const HIDDEN_EVERY = 4;
const KIND: Record<string, string> = { coal: "Coal", waiter: "Waiter", bill: "Bill", cash: "Pay cash: bring the bill" };
const METHOD: Record<string, string> = { BENEFIT: "BENEFIT", APPLE_PAY: "Apple Pay", VISA: "Visa", MASTERCARD: "Mastercard", MADA: "mada", AMEX: "Amex" };

/** A short two-note chime made in the browser, so there is no sound file to load. */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  for (const [i, f] of [880, 1320].entries()) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 0.55);
  }
}
const money = filsMoney;

/** Whole minutes waited. Red once a call has waited 5 minutes, or a round is past its promised time. */
const waited = (from: string, now: string) => Math.max(0, Math.floor(minutesBetween(from, now)));

export default function Board({ venue }: { venue: string }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [view, setView] = useState<View>("live");
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [tableId, setTableId] = useState("");
  const [find, setFind] = useState("");
  const [cat, setCat] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const [alerts, setAlerts] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/board").catch(() => null);
    if (!res) { setOffline(true); return; }
    if (res.status === 401) { window.location.assign("/staff"); return; }
    setOffline(!res.ok);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    let tick = 0;
    const poll = setInterval(() => { tick++; if (!document.hidden || tick % HIDDEN_EVERY === 0) void load(); }, POLL_MS);
    const clock = setInterval(() => setNow(new Date().toISOString()), 15_000);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(clock); };
  }, [load]);

  // Every new call, new round and card payment rings once: chime, a buzz on phones, and a system notice when the board is not in front.
  useEffect(() => {
    if (!data) return;
    const items: [string, string][] = [
      ...data.calls.map((c): [string, string] => [c.id, `Table ${c.table}: ${KIND[c.kind] ?? c.kind}`]),
      ...data.orders.filter((o) => o.status === "new").map((o): [string, string] => [o.id, `Table ${o.table}: new round`]),
      ...(data.cardPaid ?? []).map((p): [string, string] => [p.id, `Table ${p.table}: paid ${money(p.amountFils)} by card`]),
      ...(data.guestCancelled ?? []).map((c): [string, string] => [`x:${c.id}`, `Table ${c.table}: guest cancelled a round`]),
    ];
    if (!seen.current) { seen.current = new Set(items.map(([id]) => id)); return; }
    const fresh = items.filter(([id]) => !seen.current!.has(id));
    for (const [id] of fresh) seen.current.add(id);
    if (!fresh.length || !alerts) return;
    if (audio.current) chime(audio.current);
    navigator.vibrate?.([200, 100, 200]);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(fresh.map(([, text]) => text).join(" · "), { tag: "orbyn-board" });
    }
  }, [data, alerts]);

  async function turnOnAlerts() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audio.current ??= new Ctx();
      await audio.current.resume().catch(() => {});
      chime(audio.current);
    }
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
    setAlerts(true);
  }

  async function act(path: string, body: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(`/api/staff/board/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res) { setError("No connection. Try again."); return false; }
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { window.location.assign("/staff"); return false; }
    if (!res.ok) { setError(d.error ?? "Something went wrong."); void load(); return false; }
    setData(d);
    setNow(new Date().toISOString());
    return true;
  }

  async function addRound() {
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
    const label = data?.tables.find((t) => t.id === tableId)?.label;
    setAdding(true);
    const ok = await act("add", { tableId, items });
    setAdding(false);
    if (ok) { setCart({}); setFind(""); setCat(""); setTableId(""); setNotice(`Added to table ${label ?? ""}.`); setView("live"); }
  }
  const bump = (id: string, by: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, (c[id] ?? 0) + by)) }));

  if (!data) return <main className="app bd"><p className="bd-empty" role="status">{offline ? "No connection. Trying again…" : "Loading…"}</p></main>;

  const fresh = data.orders.filter((o) => o.status === "new");
  const making = data.orders.filter((o) => o.status === "accepted");
  const ready = data.orders.filter((o) => o.status === "ready");
  const liveCount = data.calls.length + data.orders.length;
  const allItems = data.menu.flatMap((c) => c.items);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = allItems.reduce((sum, i) => sum + i.priceFils * (cart[i.id] ?? 0), 0);

  const picked = data.tables.find((t) => t.id === tableId);
  const q = find.trim().toLowerCase();
  const shown = data.menu
    .filter((c) => q || !cat || c.id === cat)
    .map((c) => ({ ...c, items: c.items.filter((i) => i.available && (!q || i.name.toLowerCase().includes(q))) }))
    .filter((c) => c.items.length > 0);

  const lines = (o: Order) => (
    <ul className="bd-lines">
      {o.lines.map((l, i) => <li key={i}><b>{l.qty}×</b> {l.name}{l.note && <small>{l.note}</small>}</li>)}
    </ul>
  );

  return (
    <main className="app bd">
      <header className="bd-head">
        <div>
          <p className="bd-venue">{venue}</p>
          <h1 className="bd-title">Tables</h1>
        </div>
        <div className="bd-headlinks">
          <button type="button" className={`bd-alerts${alerts ? " on" : ""}`} aria-pressed={alerts} onClick={() => (alerts ? setAlerts(false) : void turnOnAlerts())}>{alerts ? "Alerts on" : "Turn on alerts"}</button>
          <a className="bd-link" href="/staff">Guest cards</a>
        </div>
      </header>

      {offline && <p className="bd-error" role="alert">No connection. This board may be out of date.</p>}
      <div role="alert">{error && <p className="bd-error">{error}</p>}</div>
      <div role="status">{notice && <p className="bd-note">{notice}</p>}</div>

      <input className="in bd-find" type="search" placeholder="Search the menu to add to a table" aria-label="Search the menu to add to a table" value={find}
        onChange={(e) => { setFind(e.target.value); if (e.target.value.trim()) { setView("add"); setError(null); } }} />

      <nav className="bd-tabs" aria-label="Board sections">
        {([["live", `Live${liveCount ? ` (${liveCount})` : ""}`], ["tabs", `Open tabs (${data.tabs.length})`], ["add", "Add order"], ["soldout", "Sold out"]] as [View, string][]).map(([v, label]) => (
          <button key={v} type="button" className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined} onClick={() => { setView(v); setError(null); }}>{label}</button>
        ))}
      </nav>

      {view === "live" && (
        <div className="bd-grid">
          <section aria-labelledby="bd-h-calls">
            <h2 className="bd-h" id="bd-h-calls">Calls</h2>
            {data.calls.length === 0 && <p className="bd-none">No calls waiting.</p>}
            {data.calls.map((c) => {
              const m = waited(c.at, now);
              return (
                <article key={c.id} className={`bd-card${m >= 5 ? " late" : ""}${c.kind === "cash" ? " cash" : ""}`}>
                  <div className="bd-row"><strong className="bd-table">Table {c.table}</strong><span className="bd-clock">{m} min</span></div>
                  <p className="bd-kind">{KIND[c.kind] ?? c.kind}</p>
                  {c.kind === "cash" && (() => {
                    const tab = data.tabs.find((x) => x.table === c.table);
                    return tab ? <p className="bd-due">To collect <b>{money(tab.balanceFils)}</b></p> : null;
                  })()}
                  <button type="button" className="btn bd-act" onClick={() => act("request", { requestId: c.id })}>Done</button>
                </article>
              );
            })}
          </section>

          {(data.cardPaid ?? []).length > 0 && (
            <section aria-labelledby="bd-h-paid">
              <h2 className="bd-h" id="bd-h-paid">Paid by card</h2>
              {data.cardPaid.map((p) => (
                <article key={p.id} className="bd-card paid">
                  <div className="bd-row"><strong className="bd-table">Table {p.table}</strong><span className="bd-clock">{waited(p.at, now)} min ago</span></div>
                  <p className="bd-kind">{money(p.amountFils)}{p.method ? ` · ${METHOD[p.method] ?? p.method}` : ""}</p>
                  <p className="bd-none">{p.closed ? "Tab closed. The table can be cleared." : "Part paid. The rest is still open on the tab."}</p>
                </article>
              ))}
            </section>
          )}

          {(data.guestCancelled ?? []).length > 0 && (
            <section aria-labelledby="bd-h-gone">
              <h2 className="bd-h" id="bd-h-gone">Cancelled by guest</h2>
              {data.guestCancelled!.map((c) => (
                <article key={c.id} className="bd-card gone">
                  <div className="bd-row"><strong className="bd-table">Table {c.table}</strong><span className="bd-clock">{waited(c.at, now)} min ago</span></div>
                  <p className="bd-kind">{c.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
                  <p className="bd-none">The guest took this round back before it was accepted. Nothing to make.</p>
                </article>
              ))}
            </section>
          )}

          <section aria-labelledby="bd-h-new">
            <h2 className="bd-h" id="bd-h-new">New rounds</h2>
            {fresh.length === 0 && <p className="bd-none">Nothing new.</p>}
            {fresh.map((o) => {
              const m = waited(o.at, now);
              return (
                <article key={o.id} className={`bd-card${m >= 5 ? " late" : ""}`}>
                  <div className="bd-row"><strong className="bd-table">Table {o.table}</strong><span className="bd-clock">{m} min</span></div>
                  {lines(o)}
                  <p className="bd-ask">Ready in</p>
                  <div className="bd-two">
                    {READY_MINUTES.map((min) => <button key={min} type="button" className="btn bd-act" onClick={() => act("order", { orderId: o.id, action: "accept", minutes: min })}>{min} min</button>)}
                  </div>
                  <button type="button" className="bd-quiet" onClick={() => act("order", { orderId: o.id, action: "cancel" })}>Cancel this round</button>
                </article>
              );
            })}
          </section>

          <section aria-labelledby="bd-h-making">
            <h2 className="bd-h" id="bd-h-making">Being made</h2>
            {making.length === 0 && <p className="bd-none">Nothing being made.</p>}
            {making.map((o) => {
              const m = waited(o.acceptedAt ?? o.at, now);
              const over = o.readyMinutes !== null && m > o.readyMinutes;
              return (
                <article key={o.id} className={`bd-card${over ? " late" : ""}`}>
                  <div className="bd-row"><strong className="bd-table">Table {o.table}</strong><span className="bd-clock">{m} of {o.readyMinutes} min</span></div>
                  {o.readyMinutes !== null && <div className="bd-prog" aria-hidden="true">{m > 0 && <i style={{ width: `${Math.min(100, Math.round((m / o.readyMinutes) * 100))}%` }} />}</div>}
                  {lines(o)}
                  <button type="button" className="btn bd-act" onClick={() => act("order", { orderId: o.id, action: "ready" })}>Ready</button>
                  <button type="button" className="bd-quiet" onClick={() => act("order", { orderId: o.id, action: "cancel" })}>Cancel this round</button>
                </article>
              );
            })}
          </section>

          <section aria-labelledby="bd-h-ready">
            <h2 className="bd-h" id="bd-h-ready">Ready to serve</h2>
            {ready.length === 0 && <p className="bd-none">Nothing waiting to go out.</p>}
            {ready.map((o) => (
              <article key={o.id} className="bd-card">
                <div className="bd-row"><strong className="bd-table">Table {o.table}</strong></div>
                {lines(o)}
                <button type="button" className="btn bd-act" onClick={() => act("order", { orderId: o.id, action: "serve" })}>Served</button>
              </article>
            ))}
          </section>
        </div>
      )}

      {view === "tabs" && (
        <section className="bd-list" aria-label="Open tabs">
          {data.tabs.length === 0 && <p className="bd-none">No open tabs.</p>}
          {data.tabs.map((t) => (
            <article key={t.id} className="bd-card">
              <div className="bd-row"><strong className="bd-table">Table {t.table}</strong><b className="bd-total">{money(t.totalFils)}</b></div>
              {t.paidFils > 0 && <p className="bd-due">Paid by card {money(t.paidFils)} · Left <b>{money(t.balanceFils)}</b></p>}
              <p className="bd-none">Open {waited(t.openedAt, now)} min{t.paying ? " · The guest has the card payment page open" : ""}</p>
              <p className="bd-none">{t.pointsTo ? `Points go to ${t.pointsTo}'s card when paid.` : "No guest card on this tab."}</p>
              <button type="button" className="btn primary" onClick={() => { const tb = data.tables.find((x) => x.label === t.table); if (tb) setTableId(tb.id); setError(null); setView("add"); }}>Add items</button>
              <button type="button" className="btn" disabled={!t.canClose} onClick={() => act("close", { tabId: t.id })}>{t.paidFils > 0 ? "Rest paid in cash, close tab" : "Cash paid, close tab"}</button>
              {!t.canClose && <p className="bd-none">A round is still open on this tab.</p>}
            </article>
          ))}
        </section>
      )}

      {view === "add" && (
        <section className="bd-list" aria-label="Add an order">
          <h2 className="bd-h" id="bd-h-table">Table</h2>
          <div className="bd-tables" role="group" aria-labelledby="bd-h-table">
            {data.tables.map((t) => {
              const tab = data.tabs.find((x) => x.table === t.label);
              return (
                <button key={t.id} type="button" className={`bd-tbl${tableId === t.id ? " on" : ""}`} aria-pressed={tableId === t.id} onClick={() => setTableId(t.id)}>
                  <b>{t.label}</b>
                  <small>{tab ? money(tab.totalFils) : "No tab"}</small>
                </button>
              );
            })}
          </div>

          {!q && data.menu.length > 1 && (
            <div className="bd-tabs bd-cats" role="group" aria-label="Menu section">
              <button type="button" className={cat === "" ? "on" : ""} aria-pressed={cat === ""} onClick={() => setCat("")}>All</button>
              {data.menu.map((c) => <button key={c.id} type="button" className={cat === c.id ? "on" : ""} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
            </div>
          )}
          {shown.length === 0 && <p className="bd-none">Nothing on the menu matches.</p>}
          {shown.map((c) => (
            <div key={c.id}>
              <h2 className="bd-h">{c.name}</h2>
              <ul className="bd-menu">
                {c.items.map((i) => {
                  const n = cart[i.id] ?? 0;
                  return (
                    <li key={i.id} className={n > 0 ? "has" : ""}>
                      <button type="button" className="bd-pick" aria-label={`Add one ${i.name}`} disabled={n >= 20} onClick={() => bump(i.id, 1)}>
                        <span>{i.name}</span><small>{money(i.priceFils)}</small>
                      </button>
                      {n > 0 && (
                        <span className="bd-step">
                          <button type="button" aria-label={`One less ${i.name}`} onClick={() => bump(i.id, -1)}>−</button>
                          <b aria-live="polite">{n}</b>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="bd-addbar">
            <p>
              <b>{picked ? `Table ${picked.label}` : "Choose a table"}</b>
              <span>{cartCount ? `${cartCount} ${cartCount === 1 ? "item" : "items"} · ${money(cartTotal)}` : "Tap an item to add it"}</span>
            </p>
            {cartCount > 0 && <button type="button" className="bd-quiet" onClick={() => setCart({})}>Clear</button>}
            <button type="button" className="btn primary" disabled={!tableId || cartCount === 0 || adding} onClick={addRound}>{adding ? "Adding…" : "Add to tab"}</button>
          </div>
        </section>
      )}

      {view === "soldout" && (
        <section className="bd-list" aria-label="Sold out">
          <p className="bd-none">Guests see the change within a few seconds.</p>
          {data.menu.map((c) => (
            <div key={c.id}>
              <h2 className="bd-h">{c.name}</h2>
              <ul className="bd-menu">
                {c.items.map((i) => (
                  <li key={i.id}>
                    <span className={i.available ? "" : "bd-off"}>{i.name}</span>
                    <button type="button" className={`bd-toggle${i.available ? "" : " off"}`} aria-pressed={!i.available} onClick={() => act("item", { itemId: i.id, available: !i.available })}>{i.available ? "Mark sold out" : "Sold out, turn back on"}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
