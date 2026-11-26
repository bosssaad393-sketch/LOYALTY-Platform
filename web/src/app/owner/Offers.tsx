"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AUDIENCE_LABEL, n, stamp } from "./format";
import { OFFER_TEMPLATES, fillTemplate, type OfferField, type OfferTemplate } from "./offerTemplates";
import { MESSAGE_LIMIT, WITHDRAW_DAYS, canWithdraw, checkResend, withdrawEffect } from "./offerRules";
import { Arrow, Confirm, Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Audience, Call, Note, Offer, Offers as OffersData } from "./types";
import { localTemplate } from "./offerTemplatesAr";
import { useT, type T } from "@/lib/uiLang";

const LIMIT = MESSAGE_LIMIT;
/** The form the owner sees first, and the one "Send an update" on the Overview opens. */
const MAIN_ID = "todays-update";

const withdrawPath = (id: string) => `/api/owner/offers/${encodeURIComponent(id)}/withdraw`;

function audienceText(a: Audience, o: OffersData, t: T): string {
  const count = a === "all" ? o.eligible : a === "apple" ? o.eligibleApple : o.eligibleGoogle;
  return count === undefined ? t(AUDIENCE_LABEL[a]) : `${t(AUDIENCE_LABEL[a])} (${n(count)})`;
}

/** The sender in the Today's update message. It is always the business name, so the owner never fills it in. */
const isSender = (t: OfferTemplate, f: OfferField) => Boolean(t.sample) && /^(from|signed|sender)/i.test(f.key);

/** What a form starts with: empty boxes (the examples show as grey hints), with the business name as the sender. */
function startValues(t: OfferTemplate, venue: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of t.fields) v[f.key] = isSender(t, f) ? venue : "";
  return v;
}

export default function Offers({ call, isOwner, venue, composeSignal = 0, visitVenue = false }: { call: Call; isOwner: boolean; venue: string; composeSignal?: number; visitVenue?: boolean }) {
  const loaded = useGet<OffersData>(call, "/api/owner/offers");
  const t = useT();
  // The templates in the screen's language (Arabic venues get Arabic messages).
  // A visit card has no points, so the grey example for "Today's bonus" must not promise any.
  const templates = OFFER_TEMPLATES.map((x) => localTemplate(x, t.lang)).map((x) => (visitVenue ? { ...x, fields: x.fields.map((f) => (/points|نقاط/.test(f.example) ? { ...f, example: t("a pot of tea with every dessert") } : f)) } : x));
  const main = templates.find((x) => x.id === MAIN_ID) ?? templates[0];
  const others = templates.filter((x) => x.id !== main.id);
  const [templateId, setTemplateId] = useState(main.id);
  const template = templates.find((x) => x.id === templateId) ?? main;
  // What has been typed, kept per form, so going to another message and back loses nothing.
  const [typed, setTyped] = useState<Record<string, Record<string, string>>>({});
  const values = typed[template.id] ?? startValues(template, venue);
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
    setTyped((prev) => ({ ...prev, [template.id]: { ...(prev[template.id] ?? startValues(template, venue)), [key]: value } }));
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
      setNote({ kind: "bad", text: check ? (check.same ? t("Change the words first.") : t("Shorten the message first.")) : incomplete ? t("Fill in every field before you send: {fields}.", { fields: missing.map((f) => f.label).join(t.lang === "ar" ? "، " : ", ") }) : t("Shorten the message first.") });
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
      if (r.status !== 401) setNote({ kind: "bad", text: t(r.error) });
      return;
    }
    const sent = t("Sent to {n} Wallet cards.", { n: n(r.data.recipients) });
    // Send first, then withdraw, so the cards are never empty.
    if (live && dropping) {
      const w = await call(withdrawPath(live.id), "POST");
      if (w.ok || w.status === 409) {
        setStuckId(null);
        setNote({ kind: "ok", text: `${sent} ${t("The original message is withdrawn.")} ${t(withdrawEffect(live.audience).after)}` });
      } else if (w.status !== 401) {
        setStuckId(live.id);
        setNote({ kind: "bad", text: `${sent} ${t("But the original message could not be withdrawn: {why}. It is still on the cards.", { why: t(w.error).replace(/\.$/, "") })}` });
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
    } else setTyped((prev) => ({ ...prev, [template.id]: startValues(template, venue) }));
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
        setNote({ kind: "ok", text: `${t("The original message is now withdrawn.")} ${t(withdrawEffect(x.audience).after)}` });
      }
      setListNote({ kind: "ok", text: `${t("Withdrawn.")} ${t(withdrawEffect(x.audience).after)}` });
      // The button that opened the dialog is gone now: land on the row instead.
      requestAnimationFrame(() => document.getElementById(`${ids.row}-${x.id}`)?.focus({ preventScroll: true }));
    } else if (r.status !== 401) {
      setListNote({ kind: "bad", text: t(r.error) });
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
      setNote({ kind: "ok", text: `${t("The original message is now withdrawn.")} ${t(withdrawEffect(x.audience).after)}` });
    } else if (r.status === 409) {
      loaded.reload();
      setStuckId(null);
      setNote({ kind: "ok", text: t("The original message is withdrawn.") });
    } else if (r.status !== 401) {
      setNote({ kind: "bad", text: t("The original message could not be withdrawn: {why}. It is still on the cards.", { why: t(r.error).replace(/\.$/, "") }) });
    }
  }

  return (
    <>
      <PageHead eyebrow={t("Wallet cards")} title={t("Offers")}>
        {t("Send a short message to the Wallet cards. Only guests who agreed to notifications receive it.")}{o ? ` (${t("{n} of {total}", { n: n(o.eligible), total: n(o.total) })})` : ""}
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
                        <h2 className="ow-h" id="ow-h-compose">{t("Edit and resend")}</h2>
                        <p className="ow-note">{t("Based on the message sent {date}.", { date: stamp(live.sentAt) })}</p>
                      </div>
                      <button type="button" className="ow-link" onClick={backToUpdate}>{t("Back to {name}", { name: main.title })}<Arrow /></button>
                    </div>

                    <div className="ow-field">
                      <span className="ow-lbl">{t("Original message")}</span>
                      <p className="ow-quote" dir="auto">{live.message}</p>
                    </div>
                    <div className="ow-field">
                      <label className="ow-lbl" htmlFor={ids.text}>{t("Message")}</label>
                      <textarea className="ow-in" dir="auto" id={ids.text} rows={4} value={draft} aria-describedby={`${ids.count} ${ids.alert}`} autoComplete="off" onChange={(e) => { setNote(null); setDraft(e.target.value); }} />
                    </div>
                    <p className={`ow-note ow-count${check.over > 0 ? " bad" : ""}`} id={ids.count}>
                      {t("{n} of {limit} characters.", { n: check.length, limit: LIMIT })}{" "}
                      {check.over > 0 ? t("Shorten it by {n}.", { n: check.over }) : check.length === 0 ? t("Write the new message.") : check.same ? t("Change the words to send it again.") : t("Keep it short and warm.")}
                    </p>
                    <p className="ow-note ow-lead" id={ids.alert}>{t("Change the words: guests are alerted only when the text is different.")}</p>
                    {canDrop && (
                      <label className="ow-check">
                        <input type="checkbox" checked={dropOriginal} onChange={(e) => setDropOriginal(e.target.checked)} />
                        <span>{t("Withdraw the original when I send this")}</span>
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

                    {template.fields.filter((f) => !isSender(template, f)).map((f) => {
                      const fid = `${ids.hint}-${template.id}-${f.key}`;
                      return (
                        <div className="ow-field" key={f.key}>
                          <span className="ow-lblrow">
                            <label className="ow-lbl" htmlFor={fid}>{f.label}</label>
                          </span>
                          <input className="ow-in" dir="auto" id={fid} value={values[f.key] ?? ""} maxLength={f.maxLength} placeholder={f.example} autoComplete="off" aria-describedby={ids.count} onChange={(e) => setField(f.key, e.target.value)} />
                        </div>
                      );
                    })}

                    <p className={`ow-note ow-count${over > 0 ? " bad" : ""}`} id={ids.count}>
                      {t("{n} of {limit} characters.", { n: message.length, limit: LIMIT })}{" "}
                      {over > 0 ? t("Shorten it by {n}.", { n: over }) : incomplete ? t("Fill in every field before you send.") : missing.length ? t("The grey words are examples. This sample may be sent as it is.") : t("Keep it short and warm.")}
                    </p>
                  </>
                )}

                <div className="ow-field">
                  <label className="ow-lbl" htmlFor={ids.audience}>{t("Send to")}</label>
                  <select className="ow-in ow-select" id={ids.audience} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                    {(["all", "apple", "google"] as const).map((a) => <option key={a} value={a}>{audienceText(a, o, t)}</option>)}
                  </select>
                </div>
                <div className="ow-actions"><button type="button" className="ow-btn primary" disabled={nobody || !ready} onClick={ask}>{t("Review and send")}</button></div>
                {nobody && <p className="ow-note">{t("Nobody has agreed to notifications yet, so there is no one to send to.")}</p>}
                <Msg note={note} />
                {stuck && (
                  <div className="ow-actions">
                    <button type="button" className="ow-btn small" disabled={wbusy} onClick={() => retryWithdraw(stuck)}>{wbusy ? t("Withdrawing…") : t("Withdraw the original")}</button>
                  </div>
                )}
              </section>

              <section className="ow-panel ow-more" aria-labelledby="ow-h-more">
                <h2 className="ow-h" id="ow-h-more">{t("More messages")}</h2>
                <p className="ow-note">{t("Choose one to write it in the form above. You see it before anything is sent.")}</p>
                <div className="ow-chips" role="group" aria-label={t("Message templates")}>
                  {others.map((x) => (
                    <button key={x.id} type="button" className="ow-pill" aria-pressed={!resend && templateId === x.id} onClick={() => choose(x.id)}>{x.title}</button>
                  ))}
                </div>
              </section>

              <section className="ow-panel ow-preview" aria-labelledby="ow-h-preview">
                <h2 className="ow-h" id="ow-h-preview">{t("How it will appear")}</h2>
                <Notification venue={venue} text={message} draft={missing.length > 0} />
                <p className="ow-note">{missing.length ? (incomplete ? `${t("Fill in every field before you send.")} ` : "") + `${t("Words in grey are still examples.")} ` : ""}{t("A preview of a lock-screen notification. The message also stays on the Wallet card for {n} days.", { n: WITHDRAW_DAYS })}</p>
              </section>
            </div>
          ) : (
            <p className="ow-note ow-above">{t("Only the owner can send offers. You can see what has been sent.")}</p>
          )}

          <section className={`ow-panel${isOwner ? " ow-gap-top" : ""}`} aria-labelledby="ow-h-sent">
            <h2 className="ow-h" id="ow-h-sent">{t("Sent offers")}</h2>
            <Msg note={listNote} />
            {o.offers.length === 0 ? <p className="ow-note">{t("No offers sent yet.")}</p> : (
              <ul className="ow-list">
                {o.offers.map((x) => {
                  const gone = Boolean(x.withdrawnAt);
                  const mid = `${ids.row}-msg-${x.id}`;
                  return (
                    <li key={x.id} id={`${ids.row}-${x.id}`} tabIndex={-1} className={`ow-item ow-offer${gone ? " ow-done" : ""}`}>
                      <span className="ow-item-main"><b className="ow-wrap" dir="auto" id={mid}>{x.message}</b><small>{stamp(x.sentAt)} · {t(AUDIENCE_LABEL[x.audience])}</small></span>
                      <span className="ow-item-side ow-fig">{t("{n} cards", { n: n(x.recipients) })}</span>
                      {x.withdrawnAt ? (
                        <span className="ow-item-acts ow-item-state"><em className="ow-tag quiet">{t("Withdrawn")}</em><small>{stamp(x.withdrawnAt)}</small></span>
                      ) : isOwner ? (
                        <span className="ow-item-acts">
                          <button type="button" className="ow-act" aria-describedby={mid} onClick={() => startResend(x)}>{t("Edit and resend")}</button>
                          {canWithdraw(x) && <button type="button" className="ow-act quiet" aria-describedby={mid} onClick={() => { setListNote(null); setTarget(x); }}>{t("Withdraw")}</button>}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {isOwner && o.offers.length > 0 && <p className="ow-note">{t("A message can be withdrawn for {n} days after it is sent. It then disappears from iPhone cards; on Android cards it stays until the {n} days end. A notification a guest has already seen cannot be recalled.", { n: WITHDRAW_DAYS })}</p>}
          </section>
        </>
      )}
      {review && o && (
        <Confirm title={audience === "all" ? t("Send to {n} guests?", { n: n(o.eligible) }) : t("Send to {who}?", { who: t(AUDIENCE_LABEL[audience]) })} confirmLabel={busy ? t("Sending…") : t("Send now")} cancelLabel={t("Not yet")} busy={busy} onConfirm={send} onClose={() => setReview(false)}>
          <Notification venue={venue} text={message} />
          <p className="ow-note ow-dialog-text">{t("Guests are alerted as soon as it is sent. You can withdraw the message later, but an alert that has already appeared cannot be recalled.")}</p>
          {live && <p className="ow-note ow-dialog-text">{dropping ? t(withdrawEffect(live.audience).original) : t("The original message stays on the cards until you withdraw it.")}</p>}
        </Confirm>
      )}
      {target && (
        <Confirm title={t("Withdraw this message?")} confirmLabel={wbusy ? t("Withdrawing…") : t("Withdraw it")} cancelLabel={t("Not yet")} busy={wbusy} onConfirm={withdraw} onClose={() => setTarget(null)}>
          <Notification venue={venue} text={target.message} />
          <p className="ow-note ow-dialog-text">{t(withdrawEffect(target.audience).before)} {t("Guests who already received the notification have seen it, and that cannot be undone.")}</p>
        </Confirm>
      )}
    </>
  );
}

function Notification({ venue, text, draft }: { venue: string; text: string; draft?: boolean }) {
  const t = useT();
  return (
    <div className="ow-phone" aria-hidden={text ? undefined : true}>
      <div className="ow-notif">
        <i>{venue.slice(0, 1).toUpperCase()}</i>
        <div><b>{venue}{draft && text && <em className="ow-example">{t("Example")}</em>}</b><span dir="auto" className={text && !draft ? "" : "empty"}>{text || t("Your message appears here.")}</span></div>
      </div>
    </div>
  );
}
