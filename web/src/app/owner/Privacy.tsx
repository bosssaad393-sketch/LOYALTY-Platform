"use client";

import { useId, useState } from "react";
import { n, shortDate, when } from "./format";
import { Confirm, Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, DeletionRequest, Note, Privacy as PrivacyData } from "./types";

const MIN = 50;
const MAX = 8000;

export default function Privacy({ call, venue, mock }: { call: Call; venue: string; mock: boolean }) {
  const loaded = useGet<PrivacyData>(call, "/api/owner/privacy");
  const [target, setTarget] = useState<DeletionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [eraseNote, setEraseNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [termsNote, setTermsNote] = useState<Note | null>(null);
  const [exportNote, setExportNote] = useState<Note | null>(null);
  const termsId = useId();
  const countId = useId();

  const data = loaded.data;
  const saved = data?.terms.text ?? "";
  const text = draft ?? saved;
  const valid = text.trim().length >= MIN && text.trim().length <= MAX;
  const changed = text.trim() !== saved.trim();
  const pending = (data?.requests ?? []).filter((r) => r.status === "pending");
  const done = (data?.requests ?? []).filter((r) => r.status === "erased");

  async function erase() {
    if (!target) return;
    setBusy(true);
    const r = await call("/api/owner/privacy/erase", "POST", { requestId: target.id });
    setBusy(false);
    const label = target.label;
    setTarget(null);
    if (r.ok) { setEraseNote({ kind: "ok", text: `Erased: ${label}.` }); loaded.reload(); }
    else if (r.status !== 401) setEraseNote({ kind: "bad", text: r.error });
  }

  async function saveTerms() {
    setBusy(true); setTermsNote(null);
    const r = await call("/api/owner/terms", "PUT", { text: text.trim() });
    setBusy(false);
    if (r.ok) { setTermsNote({ kind: "ok", text: "Terms saved. New guests see them from now on." }); setDraft(null); loaded.reload(); }
    else if (r.status !== 401) setTermsNote({ kind: "bad", text: r.error });
  }

  return (
    <>
      <PageHead eyebrow="Your guests’ data" title="Data and privacy">{venue} owns its guests’ data. LOYALTY only processes it for you.</PageHead>
      {loaded.error && <LoadError text={loaded.error} onRetry={loaded.reload} />}
      {!data && !loaded.error && <Loading />}
      {data && (
        <>
          <div className="ow-grid ow-c2">
            <section className="ow-panel" aria-labelledby="ow-h-requests">
              <h2 className="ow-h" id="ow-h-requests">Deletion requests</h2>
              {pending.length === 0 ? <p className="ow-note">No open requests.</p> : (
                <ul className="ow-list">
                  {pending.map((r) => (
                    <li key={r.id} className="ow-item">
                      <span className="ow-item-main"><b>{r.label}</b><small>requested {when(r.requestedAt)}</small></span>
                      <span className="ow-item-side"><button type="button" className="ow-btn small danger" onClick={() => { setEraseNote(null); setTarget(r); }} aria-label={`Erase details: ${r.label}`}>Erase details</button></span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="ow-note">Erasing removes the guest’s details, card and points history for good. The request itself stays on record, without personal details.</p>
              <Msg note={eraseNote} />
              {done.length > 0 && (
                <>
                  <h3 className="ow-h ow-h-sub">Already erased</h3>
                  <ul className="ow-list">
                    {done.map((r) => (
                      <li key={r.id} className="ow-item ow-done"><span className="ow-item-main"><b>{r.label}</b><small>requested {when(r.requestedAt)}</small></span><span className="ow-item-side"><em className="ow-tag quiet">Erased</em></span></li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="ow-panel" aria-labelledby="ow-h-export">
              <h2 className="ow-h" id="ow-h-export">Export</h2>
              <p className="ow-note ow-lead">A spreadsheet of your guests with their phone, email and points. Every download is logged.</p>
              <div className="ow-actions">
                <a className="ow-btn" href="/api/owner/export" download onClick={mock ? (e) => { e.preventDefault(); setExportNote({ kind: "ok", text: "Mock data: the real app downloads a spreadsheet here." }); } : undefined}>Download all guests (CSV)</a>
              </div>
              <Msg note={exportNote} />
            </section>
          </div>

          <section className="ow-panel ow-gap-top" aria-labelledby="ow-h-terms">
            <h2 className="ow-h" id="ow-h-terms">Terms and privacy</h2>
            <p className="ow-note ow-lead">
              The text guests accept when they join.{" "}
              {data.terms.isDefault ? "Guests currently see the standard terms. Saving your own text replaces them." : data.terms.updatedAt ? `Last saved ${shortDate(data.terms.updatedAt)}.` : ""}
            </p>
            <div className="ow-field">
              <label className="ow-lbl" htmlFor={termsId}>Terms</label>
              <textarea className="ow-in ow-terms" id={termsId} rows={10} value={text} aria-describedby={countId} onChange={(e) => { setDraft(e.target.value); setTermsNote(null); }} />
              <p className="ow-note" id={countId}>{n(text.trim().length)} characters, between {n(MIN)} and {n(MAX)}. Separate blocks with a blank line; a short first line in a block becomes its heading.</p>
            </div>
            <div className="ow-actions">
              <button type="button" className="ow-btn primary" disabled={busy || !valid || !changed} onClick={saveTerms}>Save terms</button>
              {draft !== null && changed && <button type="button" className="ow-btn" onClick={() => { setDraft(null); setTermsNote(null); }}>Discard changes</button>}
            </div>
            <Msg note={termsNote} />
          </section>
        </>
      )}
      {target && (
        <Confirm title={`Erase details for ${target.label}?`} confirmLabel="Erase for good" danger busy={busy} onConfirm={erase} onClose={() => setTarget(null)}>
          <p className="ow-note ow-dialog-text">Their name, phone, email, card and points history are erased for good. This cannot be undone.</p>
        </Confirm>
      )}
    </>
  );
}
