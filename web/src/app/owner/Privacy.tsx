"use client";

import { useId, useState } from "react";
import { n, shortDate, when } from "./format";
import { Confirm, Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, DeletionRequest, Note, Privacy as PrivacyData } from "./types";
import { useT } from "@/lib/uiLang";

const MIN = 50;
const MAX = 8000;

export default function Privacy({ call, venue }: { call: Call; venue: string }) {
  const loaded = useGet<PrivacyData>(call, "/api/owner/privacy");
  const [target, setTarget] = useState<DeletionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [eraseNote, setEraseNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [termsNote, setTermsNote] = useState<Note | null>(null);
  const termsId = useId();
  const t = useT();
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
    if (r.ok) { setEraseNote({ kind: "ok", text: t("Erased: {label}.", { label }) }); loaded.reload(); }
    else if (r.status !== 401) setEraseNote({ kind: "bad", text: r.error });
  }

  async function saveTerms() {
    setBusy(true); setTermsNote(null);
    const r = await call("/api/owner/terms", "PUT", { text: text.trim() });
    setBusy(false);
    if (r.ok) { setTermsNote({ kind: "ok", text: t("Terms saved. New guests see them from now on.") }); setDraft(null); loaded.reload(); }
    else if (r.status !== 401) setTermsNote({ kind: "bad", text: r.error });
  }

  return (
    <>
      <PageHead eyebrow={t("Your guests’ data")} title={t("Data and privacy")}>{t("{venue} owns its guests’ data. Orbyn only processes it for you.", { venue })}</PageHead>
      {loaded.error && <LoadError text={loaded.error} onRetry={loaded.reload} />}
      {!data && !loaded.error && <Loading />}
      {data && (
        <>
          <div className="ow-grid ow-c2">
            <section className="ow-panel" aria-labelledby="ow-h-requests">
              <h2 className="ow-h" id="ow-h-requests">{t("Deletion requests")}</h2>
              {pending.length === 0 ? <p className="ow-note">{t("No open requests.")}</p> : (
                <ul className="ow-list">
                  {pending.map((r) => (
                    <li key={r.id} className="ow-item">
                      <span className="ow-item-main"><b>{r.label}</b><small>{t("requested {when}", { when: when(r.requestedAt, t) })}</small></span>
                      <span className="ow-item-side"><button type="button" className="ow-btn small danger" onClick={() => { setEraseNote(null); setTarget(r); }} aria-label={t("Erase details: {label}", { label: r.label })}>{t("Erase details")}</button></span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="ow-note">{t("Erasing removes the guest’s details, card and points history for good. The request itself stays on record, without personal details.")}</p>
              <Msg note={eraseNote} />
              {done.length > 0 && (
                <>
                  <h3 className="ow-h ow-h-sub">{t("Already erased")}</h3>
                  <ul className="ow-list">
                    {done.map((r) => (
                      <li key={r.id} className="ow-item ow-done"><span className="ow-item-main"><b>{r.label}</b><small>{t("requested {when}", { when: when(r.requestedAt, t) })}</small></span><span className="ow-item-side"><em className="ow-tag quiet">{t("Erased")}</em></span></li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="ow-panel" aria-labelledby="ow-h-export">
              <h2 className="ow-h" id="ow-h-export">{t("Export")}</h2>
              <p className="ow-note ow-lead">{t("A spreadsheet of your guests with their phone, email and points. Every download is logged.")}</p>
              <div className="ow-actions">
                <a className="ow-btn" href="/api/owner/export" download>{t("Download all guests (CSV)")}</a>
              </div>
            </section>
          </div>

          <section className="ow-panel ow-gap-top" aria-labelledby="ow-h-terms">
            <h2 className="ow-h" id="ow-h-terms">{t("Terms and privacy")}</h2>
            <p className="ow-note ow-lead">
              {t("The text guests accept when they join.")}{" "}
              {data.terms.isDefault ? t("Guests currently see the standard terms. Saving your own text replaces them.") : data.terms.updatedAt ? t("Last saved {date}.", { date: shortDate(data.terms.updatedAt, t) }) : ""}
            </p>
            <div className="ow-field">
              <label className="ow-lbl" htmlFor={termsId}>{t("Terms")}</label>
              <textarea className="ow-in ow-terms" id={termsId} rows={10} value={text} aria-describedby={countId} onChange={(e) => { setDraft(e.target.value); setTermsNote(null); }} />
              <p className="ow-note" id={countId}>{t("{n} characters, between {min} and {max}. Separate blocks with a blank line; a short first line in a block becomes its heading.", { n: n(text.trim().length), min: n(MIN), max: n(MAX) })}</p>
            </div>
            <div className="ow-actions">
              <button type="button" className="ow-btn primary" disabled={busy || !valid || !changed} onClick={saveTerms}>{t("Save terms")}</button>
              {draft !== null && changed && <button type="button" className="ow-btn" onClick={() => { setDraft(null); setTermsNote(null); }}>{t("Discard changes")}</button>}
            </div>
            <Msg note={termsNote} />
          </section>
        </>
      )}
      {target && (
        <Confirm title={t("Erase details for {label}?", { label: target.label })} confirmLabel={t("Erase for good")} danger busy={busy} onConfirm={erase} onClose={() => setTarget(null)}>
          <p className="ow-note ow-dialog-text">{t("Their name, phone, email, card and points history are erased for good. This cannot be undone.")}</p>
        </Confirm>
      )}
    </>
  );
}
