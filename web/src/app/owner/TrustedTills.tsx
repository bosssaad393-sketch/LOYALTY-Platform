"use client";

import { useState, type FormEvent } from "react";
import { ago } from "./format";
import { Confirm, Loading, LoadError, Msg, useGet } from "./ui";
import type { Call, Note } from "./types";
import { useT } from "@/lib/uiLang";

type Till = { id: string; name: string; createdAt: string; lastSeenAt: string | null; thisDevice: boolean };
type Data = { locked: boolean; tills: Till[] };

/**
 * Owner: the venue's tills. With the rule on, a staff PIN signs in only on a device listed here. A device is added by
 * signing in as the owner ON that device and pressing the button, so nobody can add a till from somewhere else.
 */
export default function TrustedTills({ call }: { call: Call }) {
  const t = useT();
  const list = useGet<Data>(call, "/api/owner/tills");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [removing, setRemoving] = useState<Till | null>(null);

  async function run(body: unknown, done: string) {
    setBusy(true); setNote(null);
    const r = await call("/api/owner/tills", "POST", body);
    setBusy(false);
    if (r.ok) { setNote({ kind: "ok", text: done }); list.reload(); }
    else if (r.status !== 401) setNote({ kind: "bad", text: t(r.error) });
    return r.ok;
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (await run({ action: "trust", name }, t("This device is now a till. Staff can sign in on it."))) form.reset();
  }

  const data = list.data;
  const here = data?.tills.some((d) => d.thisDevice) ?? false;

  return (
    <section className="ow-panel" aria-labelledby="ow-h-tills">
      <h2 className="ow-h" id="ow-h-tills">{t("Trusted tills")}</h2>
      <p className="ow-note">{t("A staff PIN is four digits. With this rule on, a staff PIN works only on the devices listed here, so a PIN someone overheard is useless on their own phone. Your own PIN and a manager's PIN keep working everywhere.")}</p>
      <Msg note={note} />
      {list.error ? <LoadError text={list.error} onRetry={list.reload} /> : !data ? <Loading /> : (
        <>
          {data.tills.length === 0 ? <p className="ow-note">{t("No tills yet. Staff can sign in on any device.")}</p> : (
            <ul className="ow-list">
              {data.tills.map((d) => (
                <li key={d.id} className="ow-item">
                  <span className="ow-item-main"><b dir="auto">{d.name}{d.thisDevice ? ` · ${t("this device")}` : ""}</b><small>{d.lastSeenAt ? t("Last used {when}", { when: ago(d.lastSeenAt, t) }) : t("Not used yet")}</small></span>
                  <button type="button" className="ow-btn small" disabled={busy} onClick={() => setRemoving(d)}>{t("Remove")}</button>
                </li>
              ))}
            </ul>
          )}
          {!here && (
            <form className="ow-form" onSubmit={add} style={{ display: "grid", gap: 10, marginBlockStart: 14 }}>
              <label className="ow-field">
                <span className="ow-lbl">{t("Add the device you are holding")}</span>
                <input className="ow-in" name="name" required maxLength={60} placeholder={t("For example: Sanad counter iPad")} autoComplete="off" />
              </label>
              <p className="ow-note">{t("Do this on the till itself: open this page on it, signed in as the owner. The device remembers it for as long as it keeps being used.")}</p>
              <div className="ow-actions"><button className="ow-btn" type="submit" disabled={busy}>{t("Make this device a till")}</button></div>
            </form>
          )}
          <div className="ow-actions" style={{ marginBlockStart: 14 }}>
            <button type="button" className={`ow-btn${data.locked ? "" : " primary"}`} disabled={busy || (!data.locked && data.tills.length === 0)} onClick={() => run({ action: "lock", on: !data.locked }, data.locked ? t("The rule is off. Staff PINs work on any device.") : t("The rule is on. Staff PINs work only on the tills above."))}>
              {data.locked ? t("Switch the rule off") : t("Switch the rule on")}
            </button>
          </div>
          <p className="ow-note">{data.locked ? t("On now: staff PINs work only on the tills above. A staff member already signed in elsewhere stays in until their session ends.") : data.tills.length === 0 ? t("Add a till first, then you can switch the rule on.") : t("Off now: staff PINs work on any device.")}</p>
        </>
      )}
      {removing && (
        <Confirm title={t("Remove {name}?", { name: removing.name })} confirmLabel={t("Remove")} danger busy={busy} onConfirm={async () => { const d = removing; setRemoving(null); await run({ action: "remove", id: d.id }, t("Removed. Staff can no longer sign in on that device while the rule is on.")); }} onClose={() => setRemoving(null)}>
          <p className="ow-note ow-dialog-text">{t("Use this when a device is lost, sold or replaced. If it is your last till, the rule switches off so staff are not locked out.")}</p>
        </Confirm>
      )}
    </section>
  );
}
