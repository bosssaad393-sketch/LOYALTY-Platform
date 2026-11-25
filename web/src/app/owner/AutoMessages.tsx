"use client";

import { useState, type FormEvent } from "react";
import type { AutoKind, AutoSetting } from "@/lib/autoMessages";
import { Loading, LoadError, Msg, PageHead, useGet } from "./ui";
import type { Call, Note } from "./types";
import { useT } from "@/lib/uiLang";

/** What a message reads like for one guest: {name} filled in, as the card will show it. */
export function previewMessage(text: string, name: string): string {
  return text.replace(/\{name\}/g, name).trim().slice(0, 200);
}

/** Owner: the two automatic notices on the Wallet card, birthday and "we miss you", each switched on or off. */
export default function AutoMessages({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const t = useT();
  const data = useGet<Record<AutoKind, AutoSetting>>(call, "/api/owner/auto-messages");
  return (
    <>
      <PageHead eyebrow={t("Programme")} title={t("Automatic messages")}>{t("Sent once a day as a notice on the guest's Wallet card, only to guests who agreed to news and offers.")}</PageHead>
      {data.error ? <LoadError text={data.error} onRetry={data.reload} /> : !data.data ? <Loading /> : (
        <div className="ow-grid ow-c2">
          <MessageForm call={call} isOwner={isOwner} setting={data.data.birthday} onSaved={data.reload} />
          <MessageForm call={call} isOwner={isOwner} setting={data.data.winback} onSaved={data.reload} />
        </div>
      )}
    </>
  );
}

function MessageForm({ call, isOwner, setting, onSaved }: { call: Call; isOwner: boolean; setting: AutoSetting; onSaved: () => void }) {
  const t = useT();
  const [en, setEn] = useState(setting.textEn);
  const [ar, setAr] = useState(setting.textAr ?? "");
  const [on, setOn] = useState(setting.enabled);
  const [days, setDays] = useState(String(setting.days));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const birthday = setting.kind === "birthday";
  const id = `ow-am-${setting.kind}`;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setNote(null);
    const r = await call<AutoSetting>("/api/owner/auto-messages", "POST", { kind: setting.kind, enabled: on, textEn: en, textAr: ar, days: Number(days) || setting.days });
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: on ? t("Saved. It goes out with the next daily run.") : t("Saved. This message is off.") }); onSaved(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <form className="ow-panel" onSubmit={save} aria-labelledby={id}>
      <h2 className="ow-h" id={id}>{birthday ? t("Birthday") : t("We miss you")}</h2>
      <p className="ow-note">{birthday ? t("On the guest's birthday, for guests who gave their date of birth when joining.") : t("When a guest has not visited for the number of days below. One message per quiet spell.")}</p>
      <label className="ow-check">
        <input type="checkbox" checked={on} disabled={!isOwner} onChange={(e) => setOn(e.target.checked)} />
        <span>{t("Send this message")}</span>
      </label>
      {!birthday && (
        <label className="ow-field">
          <span className="ow-lbl">{t("Days without a visit")}</span>
          <input className="ow-in" type="number" inputMode="numeric" min={1} max={365} value={days} disabled={!isOwner} onChange={(e) => setDays(e.target.value)} />
        </label>
      )}
      <label className="ow-field">
        <span className="ow-lbl">{t("Message in English")}</span>
        <textarea className="ow-in" maxLength={200} required value={en} disabled={!isOwner} onChange={(e) => setEn(e.target.value)} />
      </label>
      <label className="ow-field">
        <span className="ow-lbl">{t("Message in Arabic")}</span>
        <textarea className="ow-in" dir="rtl" lang="ar" maxLength={200} value={ar} disabled={!isOwner} onChange={(e) => setAr(e.target.value)} />
      </label>
      <p className="ow-note">{t("{name} becomes the guest's first name.")}</p>
      <div className="ow-say" aria-live="polite">
        <small>{t("How it reads, for a guest called Sara")}</small>
        <span dir="auto">{previewMessage((t.lang === "ar" && ar) || en, t("Sara"))}</span>
      </div>
      <Msg note={note} />
      {isOwner && <div className="ow-actions"><button className="ow-btn primary" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save")}</button></div>}
    </form>
  );
}
