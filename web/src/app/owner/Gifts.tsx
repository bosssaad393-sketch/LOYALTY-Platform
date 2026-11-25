"use client";

import { useState, type FormEvent } from "react";
import type { Branch } from "@/lib/branches";
import type { VoucherTrigger } from "@/lib/vouchers";
import { n } from "./format";
import { Loading, LoadError, Msg, PageHead, Sheet, useGet } from "./ui";
import type { Call, Note } from "./types";
import { useT } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";

/** GET /api/owner/vouchers: the venue's gifts with how many were unlocked, used and are still waiting. */
export type Gift = {
  id: string; title: string; titleAr: string | null; detail: string | null; detailAr: string | null;
  trigger: VoucherTrigger; redeemBranchId: string | null; validDays: number | null; active: boolean;
  counts: { issued: number; redeemed: number; waiting: number };
};

const TRIGGER: Record<VoucherTrigger, string> = { first_visit: tx("First visit"), every_visit: tx("Every visit"), manual: tx("Given by hand") };
const TRIGGER_NOTE: Record<VoucherTrigger, string> = {
  first_visit: tx("Unlocks once per guest, when staff record their first visit."),
  every_visit: tx("Unlocks each time staff record a visit."),
  manual: tx("Never unlocks by itself. Only a team member can give it."),
};

/** Owner: gifts (vouchers). Each unlocks on a guest's card and is used once, at the place chosen here. */
export default function Gifts({ call, isOwner }: { call: Call; isOwner: boolean }) {
  const t = useT();
  const gifts = useGet<{ vouchers: Gift[] }>(call, "/api/owner/vouchers");
  const places = useGet<{ branches: Branch[] }>(call, "/api/owner/branches");
  const [editing, setEditing] = useState<Gift | "new" | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const branches = places.data?.branches ?? [];
  const where = (id: string | null) => {
    if (!id) return t("Any branch");
    const b = branches.find((x) => x.id === id);
    return b ? (t.lang === "ar" && b.nameAr) || b.name : t("A place that was removed");
  };
  const valid = (d: number | null) => (d ? t("{n} days after it unlocks", { n: d }) : t("No end date"));

  return (
    <>
      <PageHead eyebrow={t("Programme")} title={t("Gifts")}>{t("A gift appears on the guest's card when it unlocks, and staff can use it once, only where you say.")}</PageHead>
      <Msg note={note} />
      {gifts.error ? <LoadError text={gifts.error} onRetry={gifts.reload} /> : !gifts.data ? <Loading /> : gifts.data.vouchers.length === 0 ? (
        <section className="ow-panel">
          <p className="ow-note">{t("No gifts yet. Add one and choose when it unlocks: on a guest's first visit, on every visit, or only when a team member gives it. The numbers used and waiting appear here once guests have it.")}</p>
        </section>
      ) : (
        <div className="ow-grid">
          {gifts.data.vouchers.map((g) => (
            <section key={g.id} className="ow-panel" aria-label={g.title}>
              <div className="ow-gift-head">
                <h2 className="ow-gift-title">{(t.lang === "ar" && g.titleAr) || g.title}</h2>
                <span className={`ow-tag${g.active ? "" : " quiet"}`}>{g.active ? t("On") : t("Off")}</span>
              </div>
              <div className="ow-facts">
                <span>{t("Unlocks: {when}", { when: t(TRIGGER[g.trigger]) })}</span>
                <span>{t("Used at: {place}", { place: where(g.redeemBranchId) })}</span>
                <span>{t("Valid: {how}", { how: valid(g.validDays) })}</span>
              </div>
              <dl className="ow-counts">
                <div><dt>{t("Unlocked")}</dt><dd>{n(g.counts.issued)}</dd></div>
                <div><dt>{t("Used")}</dt><dd>{n(g.counts.redeemed)}</dd></div>
                <div><dt>{t("Waiting")}</dt><dd>{n(g.counts.waiting)}</dd></div>
              </dl>
              {g.counts.issued === 0 && <p className="ow-note">{t("No guest has this gift yet.")}</p>}
              {isOwner && <div className="ow-actions"><button type="button" className="ow-btn small" onClick={() => { setNote(null); setEditing(g); }}>{t("Edit")}</button></div>}
            </section>
          ))}
        </div>
      )}
      {isOwner && gifts.data && (
        <div className="ow-actions ow-head-act"><button type="button" className="ow-btn primary" onClick={() => { setNote(null); setEditing("new"); }}>{t("Add a gift")}</button></div>
      )}
      {editing && (
        <GiftSheet call={call} gift={editing === "new" ? null : editing} branches={branches} onClose={() => setEditing(null)}
          onSaved={(title) => { setEditing(null); gifts.reload(); setNote({ kind: "ok", text: t("Saved {name}. Guests see the new wording on their card; a gift already unlocked keeps its end date.", { name: title }) }); }} />
      )}
    </>
  );
}

function GiftSheet({ call, gift, branches, onClose, onSaved }: { call: Call; gift: Gift | null; branches: Branch[]; onClose: () => void; onSaved: (title: string) => void }) {
  const t = useT();
  const [trigger, setTrigger] = useState<VoucherTrigger>(gift?.trigger ?? "first_visit");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const days = text("validDays");
    setBusy(true); setNote(null);
    const r = await call<{ voucher: { title: string } }>("/api/owner/vouchers", "POST", {
      ...(gift ? { id: gift.id } : {}),
      title: text("title"), titleAr: text("titleAr"), detail: text("detail"), detailAr: text("detailAr"), trigger,
      redeemBranchId: text("where") || null, validDays: days ? Number(days) : null, active: f.get("active") === "on",
    });
    setBusy(false);
    if (r.ok) onSaved(r.data.voucher.title);
    else if (r.status !== 401) setNote({ kind: "bad", text: r.error });
  }

  return (
    <Sheet eyebrow={t("Gifts")} title={gift ? t("Edit {name}", { name: gift.title }) : t("Add a gift")} onClose={onClose}>
      <form className="ow-sheet-body" onSubmit={save}>
        <div className="ow-sheet-sec">
          <label className="ow-field">
            <span className="ow-lbl">{t("Gift, as the guest reads it")}</span>
            <input className="ow-in" name="title" required maxLength={80} defaultValue={gift?.title ?? ""} placeholder={t("For example: 50% off one bill")} autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("In Arabic")}</span>
            <input className="ow-in" name="titleAr" dir="rtl" lang="ar" maxLength={80} defaultValue={gift?.titleAr ?? ""} autoComplete="off" />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Small print (optional)")}</span>
            <textarea className="ow-in" name="detail" maxLength={300} defaultValue={gift?.detail ?? ""} placeholder={t("For example: one bill, dine-in only")} />
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Small print in Arabic (optional)")}</span>
            <textarea className="ow-in" name="detailAr" dir="rtl" lang="ar" maxLength={300} defaultValue={gift?.detailAr ?? ""} />
          </label>
        </div>
        <div className="ow-sheet-sec">
          <div className="ow-field" role="group" aria-labelledby="ow-trig-l">
            <span className="ow-lbl" id="ow-trig-l">{t("When it unlocks")}</span>
            <div className="ow-kind">
              {(Object.keys(TRIGGER) as VoucherTrigger[]).map((k) => (
                <button key={k} type="button" className="ow-pill" aria-pressed={trigger === k} onClick={() => setTrigger(k)}>{t(TRIGGER[k])}</button>
              ))}
            </div>
            <p className="ow-note">{t(TRIGGER_NOTE[trigger])}</p>
          </div>
          <label className="ow-field">
            <span className="ow-lbl">{t("Where it can be used")}</span>
            <select className="ow-in ow-select" name="where" defaultValue={gift?.redeemBranchId ?? ""}>
              <option value="">{t("Any branch")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{((t.lang === "ar" && b.nameAr) || b.name) + (b.kind === "partner" ? ` (${t("partner counter")})` : "")}</option>)}
            </select>
          </label>
          <label className="ow-field">
            <span className="ow-lbl">{t("Days it stays valid")}</span>
            <input className="ow-in" name="validDays" type="number" inputMode="numeric" min={1} max={730} defaultValue={gift?.validDays ?? ""} placeholder={t("Empty = no end date")} />
          </label>
          <label className="ow-check">
            <input type="checkbox" name="active" defaultChecked={gift?.active ?? true} />
            <span>{t("Switched on (new guests can unlock it)")}</span>
          </label>
        </div>
        <Msg note={note} />
        <div className="ow-actions">
          <button className="ow-btn primary" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save")}</button>
          <button className="ow-btn" type="button" onClick={onClose}>{t("Cancel")}</button>
        </div>
      </form>
    </Sheet>
  );
}
