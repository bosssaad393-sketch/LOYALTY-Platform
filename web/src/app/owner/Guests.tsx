"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { qrPath } from "../dev/screens";
import { ago, n } from "./format";
import { Confirm, Loading, LoadError, Msg, PageHead, Sheet, useDebounced, useGet } from "./ui";
import type { Call, Guest, Note } from "./types";

export default function Guests({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const list = useGet<{ guests: Guest[] }>(call, `/api/owner/guests?q=${encodeURIComponent(dq)}`);
  const [target, setTarget] = useState<Guest | null>(null);
  const [showing, setShowing] = useState<Guest | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const guests = list.data?.guests ?? [];

  async function erase() {
    if (!target) return;
    setBusy(true);
    const r = await call("/api/owner/guests", "DELETE", { cardId: target.cardId });
    setBusy(false);
    const name = target.name;
    setTarget(null);
    if (r.ok) { setNote({ kind: "ok", text: `${name} was erased.` }); list.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <>
      <PageHead eyebrow="Members" title="Guests">{n(guests.length)} shown. Phone numbers and emails stay hidden here; export them only when you need to.</PageHead>
      <div className="ow-bar-row">
        <form className="ow-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span className="ow-sr">Search guests by name or code</span>
            <input className="ow-in" type="search" placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
        </form>
        {isOwner && (
          <a className="ow-btn" href="/api/owner/export" download>Export CSV</a>
        )}
      </div>
      <Msg note={note} />
      {list.error && <LoadError text={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && (
        <section className="ow-panel ow-flush" aria-label="Guests">
          {guests.length === 0 ? (
            <p className="ow-note ow-pad">{dq ? "No guest matches." : "No guests yet."}</p>
          ) : (
            <table className="ow-table">
              <thead>
                <tr>
                  <th scope="col">Guest</th>
                  <th scope="col" className="ow-c-code">Code</th>
                  <th scope="col" className="ow-c-visits">Visits</th>
                  <th scope="col" className="ow-c-last">Last visit</th>
                  <th scope="col" className="ow-c-pts">Points</th>
                  <th scope="col" className="ow-c-act"><span className="ow-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.cardId}>
                    <th scope="row" className="ow-c-name"><span>{g.name}</span><small className="ow-c-meta">Code {g.code} · {n(g.visits)} visits · last visit {ago(g.lastVisit)}</small></th>
                    <td className="ow-c-code">{g.code}</td>
                    <td className="ow-c-visits">{n(g.visits)}</td>
                    <td className="ow-c-last">{ago(g.lastVisit)}</td>
                    <td className="ow-c-pts">{n(g.points)}<span> pts</span></td>
                    <td className="ow-c-act">
                      <button type="button" className="ow-btn small" onClick={() => setShowing(g)} aria-label={`Show ${g.name}'s card`}>Show card</button>
                      {isOwner && <button type="button" className="ow-btn small" onClick={() => { setNote(null); setTarget(g); }} aria-label={`Delete ${g.name}`}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {showing && (
        <Sheet eyebrow={`Code ${showing.code}`} title={`${showing.name}'s card`} onClose={() => setShowing(null)}>
          <CardQr cardId={showing.cardId} name={showing.name} />
        </Sheet>
      )}
      {target && (
        <Confirm title={`Delete ${target.name}?`} confirmLabel="Delete for good" danger busy={busy} onConfirm={erase} onClose={() => setTarget(null)}>
          <p className="ow-note ow-dialog-text">Their name, phone, email, card and points are erased for good. This cannot be undone.</p>
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
  const [qr] = useState(() => {
    const { modules } = QRCode.create(url, { errorCorrectionLevel: "Q" });
    return { size: modules.size, d: qrPath(modules.size, modules.data) };
  });
  const quiet = 4;
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center", paddingBlock: 8 }}>
      <svg role="img" aria-label={`QR code for ${name}'s card`} width={220} height={220} viewBox={`${-quiet} ${-quiet} ${qr.size + quiet * 2} ${qr.size + quiet * 2}`} style={{ background: "#fff", borderRadius: 8, color: "#000" }}>
        <path d={qr.d} fill="currentColor" />
      </svg>
      <p className="ow-note" style={{ textAlign: "center" }}>Ask the guest to scan this with their phone camera. Their card opens with all their points. Check it is really them first: this code opens their card.</p>
    </div>
  );
}
