"use client";

import { useState } from "react";
import CountUp from "@/components/CountUp";
import { useT, type T } from "@/lib/uiLang";
import { redeemableHere, sortVouchers, voucherState, type CardVoucher } from "@/lib/vouchers";

/** A place a staff member can work at (GET /api/staff/branches). */
export type StaffBranch = { id: string; name: string; nameAr: string | null; kind: "branch" | "partner" };

export type VisitGuestData = { cardId: string; firstName: string; code: string; visits: number; lastVisit?: string | null; vouchers?: CardVoucher[] };

const BAHRAIN = 3 * 3600_000;
const dayNo = (ms: number) => Math.floor((ms + BAHRAIN) / 86_400_000);

/** "today", "yesterday", "3 days ago", in Bahrain days. Null = never. */
export function visitAgo(iso: string | null | undefined, t: T, now: number = Date.now()): string {
  if (!iso) return t("never");
  const days = dayNo(now) - dayNo(Date.parse(iso));
  return days <= 0 ? t("today") : days === 1 ? t("yesterday") : t("{n} days ago", { n: days });
}

/** The vouchers that are on the card now but were not before (a visit just unlocked them). */
export function newVouchers(before: CardVoucher[] | undefined, after: CardVoucher[] | undefined): CardVoucher[] {
  const had = new Set((before ?? []).map((v) => v.id));
  return (after ?? []).filter((v) => !had.has(v.id));
}

const placeName = (b: Pick<StaffBranch, "name" | "nameAr">, t: T) => (t.lang === "ar" && b.nameAr) || b.name;

/** Shown when this person may work at several places and has not said which: one big button per place. */
export function BranchPicker({ branches, onPick }: { branches: StaffBranch[]; onPick: (id: string) => void }) {
  const t = useT();
  return (
    <>
      <h1 className="st-title">{t("Where are you working?")}</h1>
      <p className="sub">{t("Choose your counter once. This phone remembers it.")}</p>
      <div className="panel st-pick">
        {branches.map((b) => (
          <button key={b.id} type="button" className="btn" onClick={() => onPick(b.id)}>
            <span>{placeName(b, t)}</span>
            <small>{b.kind === "partner" ? t("Gifts only") : t("Visits and gifts")}</small>
          </button>
        ))}
      </div>
    </>
  );
}

type SheetProps = {
  guest: VisitGuestData;
  branchId: string | null;
  partner: boolean;
  busy: boolean;
  /** The voucher used a moment ago at this counter, shown as done. */
  justUsed: string | null;
  /** False when the guest was found by a typed code at a staff till: the gift needs a scan of the guest's own card. */
  canRedeem: boolean;
  onScan: () => void;
  onVisit: () => void;
  onRedeem: (v: CardVoucher) => void;
  onDone: () => void;
};

/** A visit-card guest at the till: first name, visits, last visit, one big "Record visit", and the gifts on the card. */
export function VisitSheet({ guest, branchId, partner, busy, justUsed, canRedeem, onScan, onVisit, onRedeem, onDone }: SheetProps) {
  const t = useT();
  const [asking, setAsking] = useState<string | null>(null);
  const list = sortVouchers(guest.vouchers ?? []).filter((v) => voucherState(v) !== "cancelled");
  const date = (iso: string) => new Date(iso).toLocaleDateString(t.locale, { day: "numeric", month: "short", timeZone: "Asia/Bahrain" });

  return (
    <>
      <section className="panel st-guest st-sheet st-vg">
        <h2 className="st-name">{guest.firstName}</h2>
        <p className="note st-left">{t("Card {code}", { code: guest.code })}</p>
        <dl className="st-vfacts">
          <div><dt>{t("Visits")}</dt><dd>{guest.visits}</dd></div>
          <div><dt>{t("Last visit")}</dt><dd className="small">{visitAgo(guest.lastVisit, t)}</dd></div>
        </dl>
        {partner ? (
          <p className="note st-left">{t("This counter uses gifts only. Visits are recorded at the branches.")}</p>
        ) : (
          <button className="btn primary st-big" type="button" disabled={busy} onClick={onVisit}>{busy ? t("Recording…") : t("Record visit")}</button>
        )}
      </section>

      <section className="panel" aria-labelledby="st-gifts">
        <h2 className="lbl" id="st-gifts">{t("Gifts on this card")}</h2>
        {list.length === 0 ? (
          <p className="note st-left">{partner ? t("No gift on this card yet. A gift unlocks when a branch records a visit.") : t("No gift on this card yet.")}</p>
        ) : (
          <div className="st-vlist">
            {list.map((v) => {
              const state = voucherState(v);
              const here = redeemableHere(v, branchId);
              const done = justUsed === v.id && state === "used";
              const where = v.redeemBranchName ?? t("any branch");
              return (
                <article key={v.id} className={`st-v${state === "ready" && here ? " ready" : ""}${done ? " done" : ""}`}>
                  <p className="st-v-state">
                    {done ? t("Used just now") : state === "ready" ? t("Ready") : state === "used" ? t("Used on {date}", { date: v.redeemedAt ? date(v.redeemedAt) : "" }) : t("Expired on {date}", { date: v.expiresAt ? date(v.expiresAt) : "" })}
                  </p>
                  <h3 className="st-v-title" dir="auto">{(t.lang === "ar" && v.titleAr) || v.title}</h3>
                  {state === "ready" && <p className="st-v-where">{here ? t("Can be used here, once.") : t("Only at {place}. Not at this counter.", { place: where })}</p>}
                  {here && !canRedeem && (
                    <>
                      <p className="st-v-ask">{t("Scan the guest's card to use this gift.")}</p>
                      <button className="btn st-big" type="button" onClick={onScan}>{t("Scan the QR")}</button>
                    </>
                  )}
                  {here && canRedeem && asking !== v.id && (
                    <button className="btn st-big" type="button" disabled={busy} onClick={() => setAsking(v.id)}>{t("Redeem")}</button>
                  )}
                  {here && canRedeem && asking === v.id && (
                    <>
                      <p className="st-v-ask" role="alert">{t("Use “{title}” now? This cannot be undone.", { title: (t.lang === "ar" && v.titleAr) || v.title })}</p>
                      <div className="st-v-two">
                        <button className="btn primary st-big" type="button" disabled={busy} onClick={() => { setAsking(null); onRedeem(v); }}>{busy ? t("Using…") : t("Yes, use it")}</button>
                        <button className="btn st-big" type="button" disabled={busy} onClick={() => setAsking(null)}>{t("Cancel")}</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <button className="btn st-next" type="button" onClick={onDone}>{t("Done, next guest")}</button>
    </>
  );
}

/** After "Record visit": the new count, and one line when the visit unlocked a gift, so staff can tell the guest. */
export function VisitResult({ first, visits, unlocked, onNext, onBack }: { first: string; visits: number; unlocked: string[]; onNext: () => void; onBack: () => void }) {
  const t = useT();
  return (
    <section className="sr" role="status">
      <svg className="sr-check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" pathLength={1} /><path d="M20 33l8 8 16-17" pathLength={1} /></svg>
      <h1 className="st-title">{t("Visit recorded")}</h1>
      <p className="sr-fig"><CountUp value={visits} /><small>{visits === 1 ? t("visit") : t("visits")}</small></p>
      <p className="sub">{visits === 1 ? t("This is {name}'s first visit.", { name: first }) : t("{name} has visited {n} times.", { name: first, n: visits })}</p>
      {unlocked.map((title) => (
        <p key={title} className="st-unlocked"><b>{t("Gift unlocked:")}</b> {t("{gift}. Tell {name} it is now on the card.", { gift: title, name: first })}</p>
      ))}
      <button className="btn primary st-big" type="button" onClick={onNext}>{t("Next guest")}</button>
      {unlocked.length > 0 && <button className="sr-undo" type="button" onClick={onBack}><u>{t("Back to {name}", { name: first })}</u></button>}
    </section>
  );
}
