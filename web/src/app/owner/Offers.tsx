"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AUDIENCE_LABEL, n, stamp } from "./format";
import { DEFAULT_SIGNED_BY, OFFER_TEMPLATES, fillTemplate, type OfferField, type OfferTemplate } from "./offerTemplates";
import { MESSAGE_LIMIT, WITHDRAW_DAYS, canWithdraw, checkResend, withdrawEffect } from "./offerRules";
import { Arrow, Confirm, Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Audience, Call, Note, Offer, Offers as OffersData } from "./types";

const LIMIT = MESSAGE_LIMIT;
/** The form the owner sees first, and the one "Send an update" on the Overview opens. */
const MAIN_ID = "todays-update";

const withdrawPath = (id: string) => `/api/owner/offers/${encodeURIComponent(id)}/withdraw`;

function audienceText(a: Audience, o: OffersData): string {
  const count = a === "all" ? o.eligible : a === "apple" ? o.eligibleApple : o.eligibleGoogle;
  return count === undefined ? AUDIENCE_LABEL[a] : `${AUDIENCE_LABEL[a]} (${n(count)})`;
}

/** The sender name in the sample message. It comes ready filled, with a "Sample" tag next to it. */
const isSender = (t: OfferTemplate, f: OfferField) => Boolean(t.sample) && /^(from|signed|sender)/i.test(f.key);

/** What a form starts with: empty boxes (the examples show as grey hints), except the sample sender name. */
function startValues(t: OfferTemplate): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of t.fields) v[f.key] = isSender(t, f) ? DEFAULT_SIGNED_BY : "";
  return v;
}

export default function Offers({ call, isOwner, venue, composeSignal = 0 }: { call: Call; isOwner: boolean; venue: string; composeSignal?: number }) {
  const loaded = useGet<OffersData>(call, "/api/owner/offers");
  const main = OFFER_TEMPLATES.find((t) => t.id === MAIN_ID) ?? OFFER_TEMPLATES[0];
  const others = OFFER_TEMPLATES.filter((t) => t.id !== main.id);
  const [templateId, setTemplateId] = useState(main.id);
  const template = OFFER_TEMPLATES.find((t) => t.id === templateId) ?? main;
  // What has been typed, kept per form, so going to another message and back loses nothing.
  const [typed, setTyped] = useState<Record<string, Record<string, string>>>({});
  const values = typed[template.id] ?? startValues(template);
  const [audience, setAudience] = useState<Audience>("all");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  // Edit and resend: the sent message being corrected (free-text mode), the new words, and whether the original goes.
  const [resend, setResend] = useState<Offer | null>(null);
  const [draft, setDraft] = useState("");
  const [dropOriginal, setDropOriginal] = useState(true);
  // Withdraw: the message the confirmation is open for, the result under the list, and an original that a resend could not withdraw.
  const [target, setTarget] = useState<Offer | null>(null);
  const [wbusy, setWbusy] = useState(false);
  const [listNote, setListNote] = useState<Note | null>(null);
  const [stuckId, setStuckId] = useState<string | null>(null);
  const audienceBefore = useRef<Audience>("all");
  const compose = useRef<HTMLElement>(null);
  const ids = { count: useId(), audience: useId(), hint: useId(), text: useId(), alert: useId(), row: useId() };

  const o = loaded.data;
  // The original as it is now (it may have been withdrawn from the list meanwhile).
  const live = resend ? (o?.offers.find((x) => x.id === resend.id) ?? resend) : null;
  const check = live ? checkResend(live.message, draft) : null;
  const message = check ? check.text : fillTemplate(template, values);
  const missing = check ? [] : template.fields.filter((f) => !values[f.key]?.trim());
  const over = check ? check.over : message.length - LIMIT;
  const nobody = o !== null && o.eligible === 0;
  // Only the sample message may go out with its examples. Every other message needs every box edited first.
  const incomplete = !check && !template.sample && missing.length > 0;
  const ready = check ? check.ok : !incomplete && over <= 0 && message.length > 0;
  // The box "Withdraw the original" only makes sense while the original is still on the cards.
  const canDrop = live !== null && canWithdraw(live);
  const dropping = canDrop && dropOriginal;
  const stuck = stuckId && o ? o.offers.find((x) => x.id === stuckId && !x.withdrawnAt) : undefined;

  // "Send an update" on the Overview lands here with the form open and the first box active.
  const handled = useRef(0);
  useEffect(() => {
    if (!o || !isOwner || composeSignal === handled.current) return;
    handled.current = composeSignal;
    compose.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
  }, [composeSignal, o, isOwner]);

  function setField(key: string, value: string) {
    setNote(null);
    setTyped((prev) => ({ ...prev, [template.id]: { ...(prev[template.id] ?? startValues(template)), [key]: value } }));
  }

  /** Bring the form into view and put the cursor in its first box. */
  function showForm(selector: string) {
    requestAnimationFrame(() => {
      const el = compose.current;
      if (!el) return;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
      el.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
  }

  /** Leave free-text mode (back to the ordinary form). */
  function endResend() {
    if (!resend) return;
    setResend(null);
    setAudience(audienceBefore.current);
  }

  function choose(id: string) {
    setNote(null);
    endResend();
    setTemplateId(id);
    showForm("input");
  }

  function startResend(x: Offer) {
    setNote(null);
    setStuckId(null);
    if (!resend) audienceBefore.current = audience;
    setResend(x);
    setDraft(x.message);
    setDropOriginal(true);
    setAudience(x.audience);
    showForm("textarea");
  }

  function backToUpdate() {
    setNote(null);
    endResend();
    showForm("input");
  }

  function ask() {
    setNote(null);
    if (!ready) {
      setNote({ kind: "bad", text: check ? (check.same ? "Change the words first." : "Shorten the message first.") : incomplete ? `Fill in every field before you send: ${missing.map((f) => f.label).join(", ")}.` : "Shorten the message first." });
      return;
    }
    setReview(true);
  }

  async function send() {
    setBusy(true);
    const r = await call<{ id: string; recipients: number }>("/api/owner/offers", "POST", { message, audience });
    if (!r.ok) {
      setBusy(false);
      setReview(false);
      if (r.status !== 401) setNote({ kind: "bad", text: r.error });
      return;
    }
    const sent = `Sent to ${n(r.data.recipients)} Wallet card${r.data.recipients === 1 ? "" : "s"}.`;
    // Send first, then withdraw, so the cards are never empty.
    if (live && dropping) {
      const w = await call(withdrawPath(live.id), "POST");
      if (w.ok || w.status === 409) {
        setStuckId(null);
        setNote({ kind: "ok", text: `${sent} The original message is withdrawn. ${withdrawEffect(live.audience).after}` });
      } else if (w.status !== 401) {
        setStuckId(live.id);
        setNote({ kind: "bad", text: `${sent} But the original message could not be withdrawn: ${w.error.replace(/\.$/, "")}. It is still on the cards.` });
      }
    } else {
      setNote({ kind: "ok", text: sent });
    }
    setBusy(false);
    setReview(false);
    if (resend) {
      endResend();
      // The form changes back to Today's update, so the button that opened the dialog is a new element: put the cursor on it.
      requestAnimationFrame(() => compose.current?.querySelector<HTMLElement>(".ow-btn.primary")?.focus({ preventScroll: true }));
    } else setTyped((prev) => ({ ...prev, [template.id]: startValues(template) }));
    loaded.reload();
  }

  /** The row is updated in place: no reload, no flicker. */
  function markWithdrawn(id: string, at: string) {
    loaded.setData((prev) => (prev ? { ...prev, offers: prev.offers.map((x) => (x.id === id ? { ...x, withdrawnAt: at } : x)) } : prev));
  }

  async function withdraw() {
    if (!target) return;
    const x = target;
    setWbusy(true);
    const r = await call<{ ok: boolean; withdrawnAt: string }>(withdrawPath(x.id), "POST");
    setWbusy(false);
    setTarget(null);
    if (r.ok) {
      markWithdrawn(x.id, r.data.withdrawnAt);
      if (stuckId === x.id) {
        setStuckId(null);
        setNote({ kind: "ok", text: `The original message is now withdrawn. ${withdrawEffect(x.audience).after}` });
      }
      setListNote({ kind: "ok", text: `Withdrawn. ${withdrawEffect(x.audience).after}` });
      // The button that opened the dialog is gone now: land on the row instead.
      requestAnimationFrame(() => document.getElementById(`${ids.row}-${x.id}`)?.focus({ preventScroll: true }));
    } else if (r.status !== 401) {
      setListNote({ kind: "bad", text: r.error });
      if (r.status === 404 || r.status === 409) loaded.reload();
    }
  }

  /** The "Withdraw the original" button under a resend that could not withdraw the original. */
  async function retryWithdraw(x: Offer) {
    setWbusy(true);
    setNote(null);
    const r = await call<{ ok: boolean; withdrawnAt: string }>(withdrawPath(x.id), "POST");
    setWbusy(false);
    if (r.ok) {
      markWithdrawn(x.id, r.data.withdrawnAt);
      setStuckId(null);
      setNote({ kind: "ok", text: `The original message is now withdrawn. ${withdrawEffect(x.audience).after}` });
    } else if (r.status === 409) {
      loaded.reload();
      setStuckId(null);
      setNote({ kind: "ok", text: "The original message is withdrawn." });
    } else if (r.status !== 401) {
      setNote({ kind: "bad", text: `The original message could not be withdrawn: ${r.error.replace(/\.$/, "")}. It is still on the cards.` });
    }
  }

  return (
    <>
      <PageHead eyebrow="Wallet cards" title="Offers">
        Send a short message to the Wallet cards. Only guests who agreed to notifications receive it{o ? ` (${n(o.eligible)} of ${n(o.total)})` : ""}.
      </PageHead>
      {loaded.error && <LoadError text={loaded.error} onRetry={loaded.reload} />}
      {!o && !loaded.error && <Loading />}
      {o && (
        <>
          {isOwner ? (
            <div className="ow-offers">
              <section className="ow-panel ow-compose" ref={compose} aria-labelledby="ow-h-compose">
                {live && check ? (
                  <>
                    <div className="ow-compose-head ow-resend-head">
                      <div>
                        <h2 className="ow-h" id="ow-h-compose">Edit and resend</h2>
                        <p className="ow-note">Based on the message sent {stamp(live.sentAt)}.</p>
                      </div>
                      <button type="button" className="ow-link" onClick={backToUpdate}>Back to {main.title}<Arrow /></button>
                    </div>

                    <div className="ow-field">
                      <span className="ow-lbl">Original message</span>
                      <p className="ow-quote">{live.message}</p>
                    </div>
                    <div className="ow-field">
                      <label className="ow-lbl" htmlFor={ids.text}>Message</label>
                      <textarea className="ow-in" id={ids.text} rows={4} value={draft} aria-describedby={`${ids.count} ${ids.alert}`} autoComplete="off" onChange={(e) => { setNote(null); setDraft(e.target.value); }} />
                    </div>
                    <p className={`ow-note ow-count${check.over > 0 ? " bad" : ""}`} id={ids.count}>
                      {check.length} of {LIMIT} characters.{" "}
                      {check.over > 0 ? `Shorten it by ${check.over}.` : check.length === 0 ? "Write the new message." : check.same ? "Change the words to send it again." : "Keep it short and warm."}
                    </p>
                    <p className="ow-note ow-lead" id={ids.alert}>Change the words: guests are alerted only when the text is different.</p>
                    {canDrop && (
                      <label className="ow-check">
                        <input type="checkbox" checked={dropOriginal} onChange={(e) => setDropOriginal(e.target.checked)} />
                        <span>Withdraw the original when I send this</span>
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <div className="ow-compose-head">
                      <div>
                        <h2 className="ow-h" id="ow-h-compose">{template.title}</h2>
                        <p className="ow-note">{template.when}</p>
                      </div>
                      {template.id !== main.id && <button type="button" className="ow-link" onClick={() => choose(main.id)}>{main.title}<Arrow /></button>}
                    </div>

                    {template.fields.map((f) => {
                      const fid = `${ids.hint}-${template.id}-${f.key}`;
                      return (
                        <div className="ow-field" key={f.key}>
                          <span className="ow-lblrow">
                            <label className="ow-lbl" htmlFor={fid}>{f.label}</label>
                          </span>
                          <input className="ow-in" id={fid} value={values[f.key] ?? ""} maxLength={f.maxLength} placeholder={f.example} autoComplete="off" aria-describedby={ids.count} onChange={(e) => setField(f.key, e.target.value)} />
                        </div>
                      );
                    })}

                    <p className={`ow-note ow-count${over > 0 ? " bad" : ""}`} id={ids.count}>
                      {message.length} of {LIMIT} characters.{" "}
                      {over > 0 ? `Shorten it by ${over}.` : incomplete ? "Fill in every field before you send." : missing.length ? "The grey words are examples. This sample may be sent as it is." : "Keep it short and warm."}
                    </p>
                  </>
                )}

                <div className="ow-field">
                  <label className="ow-lbl" htmlFor={ids.audience}>Send to</label>
                  <select className="ow-in ow-select" id={ids.audience} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                    {(["all", "apple", "google"] as const).map((a) => <option key={a} value={a}>{audienceText(a, o)}</option>)}
                  </select>
                </div>
                <div className="ow-actions"><button type="button" className="ow-btn primary" disabled={nobody || !ready} onClick={ask}>Review and send</button></div>
                {nobody && <p className="ow-note">Nobody has agreed to notifications yet, so there is no one to send to.</p>}
                <Msg note={note} />
                {stuck && (
                  <div className="ow-actions">
                    <button type="button" className="ow-btn small" disabled={wbusy} onClick={() => retryWithdraw(stuck)}>{wbusy ? "Withdrawing…" : "Withdraw the original"}</button>
                  </div>
                )}
              </section>

              <section className="ow-panel ow-more" aria-labelledby="ow-h-more">
                <h2 className="ow-h" id="ow-h-more">More messages</h2>
                <p className="ow-note">Choose one to write it in the form above. You see it before anything is sent.</p>
                <div className="ow-chips" role="group" aria-label="Message templates">
                  {others.map((t) => (
                    <button key={t.id} type="button" className="ow-pill" aria-pressed={!resend && templateId === t.id} onClick={() => choose(t.id)}>{t.title}</button>
                  ))}
                </div>
              </section>

              <section className="ow-panel ow-preview" aria-labelledby="ow-h-preview">
                <h2 className="ow-h" id="ow-h-preview">How it will appear</h2>
                <Notification venue={venue} text={message} draft={missing.length > 0} />
                <p className="ow-note">{missing.length ? (incomplete ? "Fill in every field before you send. " : "") + "Words in grey are still examples. " : ""}A preview of a lock-screen notification. The message also stays on the Wallet card for {WITHDRAW_DAYS} days.</p>
              </section>
            </div>
          ) : (
            <p className="ow-note ow-above">Only the owner can send offers. You can see what has been sent.</p>
          )}

          <section className={`ow-panel${isOwner ? " ow-gap-top" : ""}`} aria-labelledby="ow-h-sent">
            <h2 className="ow-h" id="ow-h-sent">Sent offers</h2>
            <Msg note={listNote} />
            {o.offers.length === 0 ? <p className="ow-note">No offers sent yet.</p> : (
              <ul className="ow-list">
                {o.offers.map((x) => {
                  const gone = Boolean(x.withdrawnAt);
                  const mid = `${ids.row}-msg-${x.id}`;
                  return (
                    <li key={x.id} id={`${ids.row}-${x.id}`} tabIndex={-1} className={`ow-item ow-offer${gone ? " ow-done" : ""}`}>
                      <span className="ow-item-main"><b className="ow-wrap" id={mid}>{x.message}</b><small>{stamp(x.sentAt)} · {AUDIENCE_LABEL[x.audience]}</small></span>
                      <span className="ow-item-side ow-fig">{n(x.recipients)} cards</span>
                      {x.withdrawnAt ? (
                        <span className="ow-item-acts ow-item-state"><em className="ow-tag quiet">Withdrawn</em><small>{stamp(x.withdrawnAt)}</small></span>
                      ) : isOwner ? (
                        <span className="ow-item-acts">
                          <button type="button" className="ow-act" aria-describedby={mid} onClick={() => startResend(x)}>Edit and resend</button>
                          {canWithdraw(x) && <button type="button" className="ow-act quiet" aria-describedby={mid} onClick={() => { setListNote(null); setTarget(x); }}>Withdraw</button>}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {isOwner && o.offers.length > 0 && <p className="ow-note">A message can be withdrawn for {WITHDRAW_DAYS} days after it is sent. It then disappears from iPhone cards; on Android cards it stays until the {WITHDRAW_DAYS} days end. A notification a guest has already seen cannot be recalled.</p>}
          </section>
        </>
      )}
      {review && o && (
        <Confirm title={audience === "all" ? `Send to ${n(o.eligible)} guests?` : `Send to ${AUDIENCE_LABEL[audience]}?`} confirmLabel={busy ? "Sending…" : "Send now"} cancelLabel="Not yet" busy={busy} onConfirm={send} onClose={() => setReview(false)}>
          <Notification venue={venue} text={message} />
          <p className="ow-note ow-dialog-text">Guests are alerted as soon as it is sent. You can withdraw the message later, but an alert that has already appeared cannot be recalled.</p>
          {live && <p className="ow-note ow-dialog-text">{dropping ? withdrawEffect(live.audience).original : "The original message stays on the cards until you withdraw it."}</p>}
        </Confirm>
      )}
      {target && (
        <Confirm title="Withdraw this message?" confirmLabel={wbusy ? "Withdrawing…" : "Withdraw it"} cancelLabel="Not yet" busy={wbusy} onConfirm={withdraw} onClose={() => setTarget(null)}>
          <Notification venue={venue} text={target.message} />
          <p className="ow-note ow-dialog-text">{withdrawEffect(target.audience).before} Guests who already received the notification have seen it, and that cannot be undone.</p>
        </Confirm>
      )}
    </>
  );
}

function Notification({ venue, text, draft }: { venue: string; text: string; draft?: boolean }) {
  return (
    <div className="ow-phone" aria-hidden={text ? undefined : true}>
      <div className="ow-notif">
        <i>{venue.slice(0, 1).toUpperCase()}</i>
        <div><b>{venue}{draft && text && <em className="ow-example">Example</em>}</b><span className={text && !draft ? "" : "empty"}>{text || "Your message appears here."}</span></div>
      </div>
    </div>
  );
}
