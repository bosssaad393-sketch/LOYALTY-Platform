"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import CountUp from "@/components/CountUp";
import Island, { type IslandMessage } from "@/components/Island";
import QrScanner from "./QrScanner";
import PinPad from "@/components/PinPad";
import type { SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";
import { LARGE_BILL_BHD, MAX_BILL_BHD, pointsFor, readBill } from "@/lib/tillRules";
import { bahrainTime, bhd as bhdNumber, bhdText } from "@/lib/format";
import { LangToggle, UiLangProvider, useT, type UiLang } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";
import VenueMark from "@/components/VenueMark";
import type { CardVoucher } from "@/lib/vouchers";
import { BranchPicker, newVouchers, VisitResult, VisitSheet, type StaffBranch } from "./VisitGuest";

type Me = { name: string; role: string; venue: string };
type Guest = {
  cardId: string; firstName: string; code: string; points: number; visits: number; goal: number; rewardText: string; rewardReady: boolean; pointsPerBhd?: number;
  stampMode?: boolean; stamps?: { position: number; cycle: number; tiers: { at: number; text: string }[] };
  /** Visit cards (0022): no points; a visit is recorded and the card's gifts are redeemed. */
  visitMode?: boolean; lastVisit?: string | null; vouchers?: CardVoucher[];
  /** True when the guest was found by scanning their own signed QR (lib/cardQr.ts), not by a typed code. */
  verified?: boolean;
};
/** Where this phone works, remembered between shifts (visit venues with several places). */
const BRANCH_KEY = "orbyn-staff-branch";
const readSaved = () => { try { return localStorage.getItem(BRANCH_KEY); } catch { return null; } };
const save = (id: string | null) => { try { if (id) localStorage.setItem(BRANCH_KEY, id); else localStorage.removeItem(BRANCH_KEY); } catch { /* private mode */ } };

/** Stamp venues: the full ladder, one dot per stamp, the reward under each step. */
function StampLadder({ g }: { g: Guest }) {
  const t = useT();
  if (!g.stamps) return null;
  const { position, tiers } = g.stamps;
  return (
    <div className="st-ladder" aria-label={t("{n} of {total} stamps", { n: position, total: g.stamps.cycle })}>
      {tiers.map((tier, i) => {
        const from = i === 0 ? 0 : tiers[i - 1].at;
        return (
          <div key={tier.at} className={`st-step${position >= tier.at ? " got" : position >= from ? " next" : ""}`}>
            <div className="st-dots">{Array.from({ length: tier.at - from }, (_, k) => <i key={k} className={from + k < position ? "on" : ""} />)}</div>
            <span>{tier.text}</span>
          </div>
        );
      })}
    </div>
  );
}
type Recent = { id: number; kind: string; points: number; billBhd: number | null; at: string; by: string; guest: string };
type Perk = { id: string; title: string; note: string | null; validUntil: string | null; from: string };
type MyDay = { entries: number; guests: number; bhd: number };
type Tab = "guest" | "recent" | "help" | "end";
type Res<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function api<T>(path: string, body?: unknown): Promise<Res<T>> {
  const res = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: tx("No connection. Try again."), status: 0 };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? tx("Something went wrong."), status: res.status };
}

const bhd = bhdText;
const time = bahrainTime;
const QUICK = [3, 5, 10, 15, 20];
const TABS: Tab[] = ["guest", "recent", "help", "end"];
const TAB_LABEL: Record<Tab, string> = { guest: tx("Guest"), recent: tx("Recent"), help: tx("Help"), end: tx("End") };
/** When an entry was made, for the 10-minute undo window. Only ever called from a tap, never while drawing. */
const stamp = () => Date.now();
/** 1250 -> "1,250.000": three decimals like the receipt, with thousands marked so a typo stands out. */
const bhdFull = bhdNumber;

type StaffProps = { initialMe: Me | null; look?: SignInLook; brand: BrandProps; lang?: UiLang; stampVenue?: boolean; visitVenue?: boolean };

/** The staff screen in the venue's language (Arabic or English). */
export default function StaffApp({ lang = "en", ...props }: StaffProps) {
  return <UiLangProvider lang={lang}><StaffScreen {...props} /></UiLangProvider>;
}

function StaffScreen({ initialMe, brand, stampVenue = false, visitVenue = false }: StaffProps) {
  const t = useT();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [tab, setTab] = useState<Tab>("guest");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [bill, setBill] = useState("");
  const [lastEntry, setLastEntry] = useState<{ id: number; at: number } | null>(null);
  const [msg, setMsgState] = useState<IslandMessage | null>(null);
  // Each message gets its own id, so the island grows again even when the same words repeat.
  const setMsg = useCallback((m: { kind: "ok" | "bad"; text: string } | null) => setMsgState(m ? { ...m, id: stamp() } : null), []);
  const clearMsg = useCallback(() => setMsgState(null), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; first: string; total: number; ready: boolean; stamp?: boolean } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [mine, setMine] = useState<MyDay>({ entries: 0, guests: 0, bhd: 0 });
  const [perks, setPerks] = useState<Perk[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);
  /** A large bill waits for one more tap ("Yes, BHD 450.000"). Cleared when the amount changes. */
  const [confirmLarge, setConfirmLarge] = useState(false);
  const billBox = useRef<HTMLInputElement>(null);
  // Visit venues: the places this person can work at, and the one this phone is at now.
  const [places, setPlaces] = useState<{ fixed: boolean; branches: StaffBranch[] } | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [visitDone, setVisitDone] = useState<{ first: string; visits: number; unlocked: string[] } | null>(null);
  const [justUsed, setJustUsed] = useState<string | null>(null);
  /** The exact text scanned for the guest on screen: using a gift needs it (a typed code can be guessed). */
  const [scanned, setScanned] = useState<string | null>(null);

  const signedOut = useCallback(() => { setMe(null); setGuest(null); setTab("guest"); setPlaces(null); }, []);

  const loadRecent = useCallback(async () => {
    const r = await api<{ items: Recent[]; mine: MyDay }>("/api/staff/recent", undefined);
    if (r.ok) { setRecent(r.data.items); setMine(r.data.mine); } else if (r.status === 401) signedOut();
  }, [signedOut]);
  const loadPerks = useCallback(async () => {
    const r = await api<{ perks: Perk[] }>("/api/staff/perks", undefined);
    if (r.ok) setPerks(r.data.perks);
  }, []);

  // Once signed in: today's list (for the tally) and any thank-you rewards waiting.
  useEffect(() => {
    if (!me) return;
    let live = true;
    Promise.all([api<{ items: Recent[]; mine: MyDay }>("/api/staff/recent", undefined), api<{ perks: Perk[] }>("/api/staff/perks", undefined)]).then(([a, b]) => {
      if (!live) return;
      if (a.ok) { setRecent(a.data.items); setMine(a.data.mine); }
      if (b.ok) setPerks(b.data.perks);
    });
    return () => { live = false; };
  }, [me]);

  // Visit venues: which places this person may work at. One place (or a till tied to one) is chosen for them;
  // otherwise the choice saved on this phone is used, and with none the screen asks first.
  useEffect(() => {
    if (!me || !visitVenue) return;
    let live = true;
    api<{ fixed: boolean; branches: StaffBranch[] }>("/api/staff/branches", undefined).then((r) => {
      if (!live || !r.ok) return;
      setPlaces(r.data);
      const ids = r.data.branches.map((b) => b.id);
      const saved = readSaved();
      setBranchId(r.data.fixed || ids.length === 1 ? ids[0] ?? null : saved && ids.includes(saved) ? saved : null);
    });
    return () => { live = false; };
  }, [me, visitVenue]);

  async function signIn(pin: string) {
    setBusy(true); setLoginError(null);
    const r = await api<Me>("/api/staff/pin-login", { pin, area: "staff", venue: brand.slug });
    setBusy(false);
    if (r.ok) setMe(r.data); else setLoginError(t(r.error));
  }

  async function lock() {
    await api("/api/staff/logout", { area: "staff" });
    signedOut();
  }

  const find = useCallback(async (code: string) => {
    setScanning(false); setMsg(null); setBusy(true);
    const r = await api<Guest>(`/api/staff/card?code=${encodeURIComponent(code)}`, undefined);
    setBusy(false);
    if (r.ok) { setGuest(r.data); setScanned(code.startsWith("LOYALTY:") ? code : null); setBill(""); setConfirmLarge(false); setLastEntry(null); setResult(null); setVisitDone(null); setJustUsed(null); }
    else if (r.status === 401) signedOut();
    else setMsg({ kind: "bad", text: t(r.error) });
  }, [signedOut, setMsg, t]);

  async function act(path: string, body: unknown, success: (d: { guest: Guest; ledgerId?: number; added?: number }) => string) {
    setBusy(true); setMsg(null);
    const r = await api<{ guest: Guest; ledgerId?: number; added?: number }>(path, body);
    setBusy(false);
    if (!r.ok) { if (r.status === 401) signedOut(); else setMsg({ kind: "bad", text: t(r.error) }); return; }
    setGuest(r.data.guest);
    if (r.data.ledgerId) setLastEntry({ id: r.data.ledgerId, at: stamp() });
    setMsg({ kind: "ok", text: success(r.data) });
    void loadRecent();
  }

  async function claim(p: Perk) {
    const r = await api("/api/staff/perks", { id: p.id });
    if (r.ok) { setPerks((l) => l.filter((x) => x.id !== p.id)); setMsg({ kind: "ok", text: t("Marked as used. Enjoy!") }); }
    else setMsg({ kind: "bad", text: t(r.error) });
  }

  // The undo button disappears when the 10-minute window closes.
  useEffect(() => {
    if (!lastEntry) return;
    const timer = setTimeout(() => setLastEntry(null), Math.max(0, lastEntry.at + 10 * 60_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [lastEntry]);

  const billRead = readBill(bill);
  const billNum = billRead.value;
  const preview = guest ? pointsFor(billNum, guest.pointsPerBhd ?? 0) : 0;
  const canAdd = billRead.state === "ok" || billRead.state === "large";

  // The guest is found: the cursor goes straight to the bill, so staff type the amount without another tap.
  useEffect(() => {
    if (guest && !result && !guest.stampMode) billBox.current?.focus({ preventScroll: true });
  }, [guest, result]);

  function addPoints() {
    if (!guest || !canAdd || busy) return;
    if (billRead.state === "large" && !confirmLarge) { setConfirmLarge(true); return; }
    setConfirmLarge(false);
    void act("/api/staff/earn", { cardId: guest.cardId, billBhd: billNum }, (d) => { setBill(""); setResult({ added: d.added ?? 0, first: d.guest.firstName, total: d.guest.points, ready: d.guest.rewardReady }); return t("Added {n} points for {bill}. {name} now has {total}.", { n: d.added ?? 0, bill: bhd(billNum), name: d.guest.firstName, total: d.guest.points }); });
  }
  function addStamp() {
    if (!guest || busy) return;
    void act("/api/staff/stamp", { cardId: guest.cardId }, (d) => { setResult({ added: 1, first: d.guest.firstName, total: d.guest.points, ready: d.guest.rewardReady, stamp: true }); return t("Stamp added. {name} now has {n} stamps on the card.", { name: d.guest.firstName, n: d.guest.points }); });
  }
  const canUndo = lastEntry !== null;

  // Visit venues: where this phone is, and whether it is a partner counter (gifts only, no visits).
  const here = places?.branches.find((b) => b.id === branchId) ?? null;
  const partner = here?.kind === "partner";
  const mustPick = visitVenue && places !== null && places.branches.length > 1 && !places.fixed && !branchId;
  function pick(id: string | null) { setBranchId(id); save(id); setGuest(null); setVisitDone(null); setMsg(null); }

  async function recordVisit() {
    if (!guest || busy) return;
    setBusy(true); setMsg(null);
    const r = await api<{ visits: number; vouchersIssued: number; guest: Guest }>("/api/staff/visit", { cardId: guest.cardId, branchId });
    setBusy(false);
    if (!r.ok) { if (r.status === 401) signedOut(); else setMsg({ kind: "bad", text: t(r.error) }); return; }
    const unlocked = newVouchers(guest.vouchers, r.data.guest.vouchers).map((v) => (t.lang === "ar" && v.titleAr) || v.title);
    setGuest({ ...r.data.guest, verified: guest.verified });
    setVisitDone({ first: r.data.guest.firstName, visits: r.data.visits, unlocked });
    setMsg({ kind: "ok", text: t("Visit recorded for {name}.", { name: r.data.guest.firstName }) });
    void loadRecent();
  }

  async function redeemGift(v: CardVoucher) {
    if (!guest || busy) return;
    setBusy(true); setMsg(null);
    const r = await api<{ redeemedAt: string; guest: Guest }>("/api/staff/voucher/redeem", { cardId: guest.cardId, cardVoucherId: v.id, branchId, ...(scanned ? { qr: scanned } : {}) });
    setBusy(false);
    if (!r.ok) { if (r.status === 401) signedOut(); else setMsg({ kind: "bad", text: t(r.error) }); return; }
    setGuest({ ...r.data.guest, verified: guest.verified });
    setJustUsed(v.id);
    setMsg({ kind: "ok", text: t("Gift used. It is now marked as used on {name}'s card.", { name: r.data.guest.firstName }) });
  }


  if (!me) return <PinPad role="staff" busy={busy} error={loginError} onSubmit={signIn} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} />;

  const first = me.name.split(" ")[0];

  return (
    <main className="app staff" dir={t.dir} lang={t.lang}>
      <header className="st-head">
        {brand.mark === "type" ? <VenueMark name={me.venue} slug={brand.slug} type className="st-mark" /> : (
          // eslint-disable-next-line @next/next/no-img-element -- small static brand mark
          <img className="st-crest" src={`/venues/${brand.slug}/crest.png`} alt={`${me.venue}, ${t("staff")}`} width={96} height={96} />
        )}
        <div className="st-actions">
          {!stampVenue && !visitVenue && <a className="chip" href="/staff/board">{t("Table board")}</a>}
          <LangToggle />
          <button className="chip" type="button" onClick={lock}>{t("Lock")}</button>
        </div>
      </header>

      {tab !== "end" && (
        <div className="st-today" aria-label={t("Your day so far")}>
          <span><b>{mine.entries}</b> {t("entries")}</span>
          <span><b>{mine.guests}</b> {t("guests")}</span>
          {!stampVenue && !visitVenue && <span><b>{bhdFull(mine.bhd)}</b> {t("BHD")}</span>}
        </div>
      )}
      {visitVenue && here && places && tab !== "end" && (
        <p className="st-branch note st-left">
          <span>{t("Counter:")} <b>{(t.lang === "ar" && here.nameAr) || here.name}</b></span>
          {!places.fixed && places.branches.length > 1 && <button className="chip" type="button" onClick={() => pick(null)}>{t("Change")}</button>}
        </p>
      )}

      {tab === "guest" ? (
        mustPick && places ? <BranchPicker branches={places.branches} onPick={pick} /> : !guest ? (
          <>
            <div className="eyebrow">{t("Hello {name}", { name: first })}</div>
            <h1 className="st-title">{t("Find the guest")}</h1>
            <p className="sub">{partner ? t("Scan the guest's card to use their gift.") : t("Scan the QR on the guest's Wallet card, or type the 4-digit code under it.")}</p>
            {scanning ? <div className="panel"><QrScanner onCode={find} onClose={() => setScanning(false)} /></div> : (
              <button className="sc" type="button" onClick={() => setScanning(true)}>
                <span className="sc-box" aria-hidden="true"><i /><i /><i /><i /><span className="sc-line" /></span>
                <span className="sc-go">{t("Scan the QR")}</span>
              </button>
            )}
            <div className="panel st-or">
              <form className="row" onSubmit={(e) => { e.preventDefault(); const c = new FormData(e.currentTarget).get("code"); if (c) find(String(c)); }}>
                <label className="field"><span className="lbl">{t("Card code (4 digits)")}</span><input className="in st-code" name="code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="4827" autoComplete="off" required onChange={(e) => { const c = e.target.value.replace(/\D/g, ""); if (c.length === 4 && !busy) find(c); }} /></label>
                <button className="btn" type="submit" disabled={busy}>{t("Find")}</button>
              </form>
            </div>
          </>
        ) : visitDone ? (
          <VisitResult first={visitDone.first} visits={visitDone.visits} unlocked={visitDone.unlocked} onNext={() => { setVisitDone(null); setGuest(null); setMsg(null); }} onBack={() => setVisitDone(null)} />
        ) : guest.visitMode ? (
          <VisitSheet guest={guest} branchId={branchId} partner={partner} busy={busy} justUsed={justUsed} canRedeem={Boolean(guest.verified && scanned) || me.role === "owner" || me.role === "manager"} onScan={() => { setGuest(null); setMsg(null); setScanning(true); }} onVisit={recordVisit} onRedeem={redeemGift} onDone={() => { setGuest(null); setMsg(null); setJustUsed(null); }} />
        ) : result ? (
          <section className="sr" role="status">
            <svg className="sr-check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" pathLength={1} /><path d="M20 33l8 8 16-17" pathLength={1} /></svg>
            <h1 className="st-title">{result.stamp ? t("Stamp added") : t("Points added")}</h1>
            <p className="sr-fig">+<CountUp value={result.added} /><small>{result.stamp ? t("stamp") : t("pts")}</small></p>
            <p className="sub">{result.stamp ? t("{name} now has {n} stamps on the card.", { name: result.first, n: result.total }) : t("{name} now has {n} points.", { name: result.first, n: result.total })}</p>
            {canUndo && <button className="sr-undo" type="button" disabled={busy} onClick={() => act("/api/staff/undo", { ledgerId: lastEntry?.id }, (d) => { setLastEntry(null); setResult(null); return t("Undone. {name} has {n} on the card.", { name: d.guest.firstName, n: d.guest.points }); })}>{t("Added by mistake?")} <u>{t("Undo")}</u> {t("within 10 minutes")}</button>}
            {result.ready && <p className="msg warn">{t("{name} has a reward ready.", { name: result.first })}</p>}
            {result.ready ? <button className="btn primary st-big" type="button" onClick={() => setResult(null)}>{t("Give the reward")}</button> : <button className="btn primary st-big" type="button" onClick={() => { setResult(null); setGuest(null); setMsg(null); }}>{t("Next guest")}</button>}
          </section>
        ) : (
          <>
            {guest.stampMode ? (
              <>
                <section className={`panel st-guest st-sheet${guest.rewardReady ? " st-ready" : ""}`}>
                  <h2 className="st-name">{guest.firstName}</h2>
                  <p className="note st-left">{t("Code {code} · visits: {n}", { code: guest.code, n: guest.visits })}</p>
                  <div className="pts"><b>{guest.points}</b><span>{t("Stamps")}</span></div>
                  <StampLadder g={guest} />
                  <p className={guest.rewardReady ? "msg warn" : "note st-left"}>{guest.rewardReady ? t("Reward ready: {reward}.", { reward: guest.rewardText }) : t("Stamps left to {reward}: {n}", { reward: guest.rewardText, n: guest.goal - guest.points })}</p>
                  {guest.rewardReady && (
                    <button className="btn primary st-big" type="button" disabled={busy} onClick={() => act("/api/staff/redeem", { cardId: guest.cardId }, (d) => t("Reward given. {name} has {n} stamps left.", { name: d.guest.firstName, n: d.guest.points }))}>{t("Give: {reward}", { reward: guest.rewardText })}</button>
                  )}
                </section>
                <div className="panel">
                  <button className="btn primary st-big" type="button" disabled={busy} onClick={addStamp}>{busy ? t("Adding…") : t("Add a stamp for this visit")}</button>
                  <p className="note" style={{ marginTop: 8 }}>{t("One stamp per paid visit. A second stamp within 30 minutes is refused.")}</p>
                  {canUndo && (
                    <button className="btn danger" type="button" disabled={busy} onClick={() => act("/api/staff/undo", { ledgerId: lastEntry?.id }, (d) => { setLastEntry(null); return t("Undone. {name} has {n} stamps.", { name: d.guest.firstName, n: d.guest.points }); })}>{t("Undo my last entry (10 minutes)")}</button>
                  )}
                </div>
                <button className="btn" type="button" onClick={() => { setGuest(null); setMsg(null); }}>{t("Done, next guest")}</button>
              </>
            ) : (<>
            <section className={`panel st-guest st-sheet${guest.rewardReady ? " st-ready" : ""}`}>
              <h2 className="st-name">{guest.firstName}</h2>
              <p className="note st-left">{t("Code {code} · visits: {n}", { code: guest.code, n: guest.visits })}</p>
              <div className="pts"><b>{guest.points}</b><span>{t("Points")}</span></div>
              <div className="bar" aria-hidden="true">{guest.points > 0 && <i style={{ width: `${Math.min(100, Math.round((guest.points / guest.goal) * 100))}%` }} />}</div>
              <p className={guest.rewardReady ? "msg warn" : "note st-left"}>{guest.rewardReady ? t("Reward ready: {reward}. Give it and take {n} points.", { reward: guest.rewardText, n: guest.goal }) : t("Points to the reward: {n}", { n: guest.goal - guest.points })}</p>
              {guest.rewardReady && (
                <button className="btn primary st-big" type="button" disabled={busy} onClick={() => act("/api/staff/redeem", { cardId: guest.cardId }, (d) => t("Reward given. {name} now has {n} points.", { name: d.guest.firstName, n: d.guest.points }))}>{t("Give reward and take {n} points", { n: guest.goal })}</button>
              )}
            </section>
            <form className="panel" onSubmit={(e) => { e.preventDefault(); addPoints(); }}>
              <label className="field">
                <span className="lbl">{t("Bill total (BHD)")}</span>
                <input ref={billBox} className="in st-code" inputMode="decimal" enterKeyHint="done" placeholder="12.500" value={bill} onChange={(e) => { setBill(e.target.value); setConfirmLarge(false); }} autoComplete="off" aria-invalid={billRead.state === "bad" || billRead.state === "too_large" || undefined} aria-describedby="st-bill-note" />
              </label>
              <div className="st-quick" role="group" aria-label={t("Common bill amounts")}>
                {QUICK.map((q) => <button key={q} type="button" className={`chip${billNum === q ? " on" : ""}`} aria-pressed={billNum === q} onClick={() => { setBill(String(q)); setConfirmLarge(false); }}>{q}</button>)}
              </div>
              <p id="st-bill-note" className={`st-billnote${billRead.state === "bad" || billRead.state === "too_large" ? " bad" : confirmLarge ? " warn" : ""}`} aria-live="polite">
                {billRead.state === "bad" ? t("Type the amount in BHD, for example 12.500.")
                  : billRead.state === "too_large" ? t("The most for one bill is BHD {max}.", { max: MAX_BILL_BHD.toLocaleString("en-GB") })
                  : confirmLarge ? t("BHD {bill} is more than {limit}. Tap again if that is right.", { bill: bhdFull(billNum), limit: LARGE_BILL_BHD })
                  : canAdd && preview > 0 ? t("{name} will get {n} points.", { name: guest.firstName, n: preview })
                  : canAdd ? t("Too small for a point.") : " "}
              </p>
              <button className={`btn primary st-big${confirmLarge ? " st-confirm" : ""}`} type="submit" disabled={busy || !canAdd || preview < 1}>
                {busy ? t("Adding…") : confirmLarge ? t("Yes, BHD {bill}", { bill: bhdFull(billNum) }) : preview > 0 ? t("Add {n} points", { n: preview }) : t("Add points")}
              </button>
              {canUndo && (
                <button className="btn danger" type="button" disabled={busy} onClick={() => act("/api/staff/undo", { ledgerId: lastEntry?.id }, (d) => { setLastEntry(null); return t("Undone. {name} has {n} points.", { name: d.guest.firstName, n: d.guest.points }); })}>{t("Undo my last entry (10 minutes)")}</button>
              )}
            </form>
            <button className="btn" type="button" onClick={() => { setGuest(null); setMsg(null); setConfirmLarge(false); }}>{t("Done, next guest")}</button>
            </>)}
          </>
        )
      ) : tab === "recent" ? (
        <>
          <div className="eyebrow">{t("Today")}</div>
          <h1 className="st-title">{t("Recent actions")}</h1>
          <section className="panel feed">
            {recent.length === 0 ? <p className="note">{t("Nothing yet.")}</p> : recent.map((r) => (
              <div key={r.id}>
                <span>{visitVenue && r.kind === "earn" && r.points === 0 ? <b>{t("Visit")}</b> : <b className={r.points >= 0 ? "st-plus" : "st-minus"}>{r.points > 0 ? "+" : ""}{r.points}</b>} {r.guest}{r.billBhd ? ` · ${bhd(Number(r.billBhd))}` : ""}{r.kind === "undo" ? ` · ${t("undo")}` : r.kind === "redeem" ? ` · ${t("reward")}` : ""}{r.by ? ` · ${r.by}` : ""}</span>
                <span>{time(r.at)}</span>
              </div>
            ))}
          </section>
        </>
      ) : tab === "end" ? (
        <>
          <div className="eyebrow">{t("Shift over")}</div>
          <h1 className="st-title">{t("Thank you, {name}", { name: first })}</h1>
          <p className="sub">{t("Guests served today: {guests} · entries: {entries}", { guests: mine.guests, entries: mine.entries })}</p>
          {perks.length > 0 ? perks.map((p) => (
            <section key={p.id} className="panel st-perk" aria-label={t("A thank-you for you")}>
              <div className="eyebrow">{t("A thank-you from {name}", { name: p.from })}</div>
              <h2 className="st-name">{p.title}</h2>
              {p.note && <p className="note st-left">“{p.note}”</p>}
              {p.validUntil && <p className="note st-left">{t("Use it by {date}.", { date: new Date(p.validUntil).toLocaleDateString(t.locale, { day: "numeric", month: "long" }) })}</p>}
              <button className="btn primary st-big" type="button" onClick={() => claim(p)}>{t("Show it and mark as used")}</button>
            </section>
          )) : <section className="panel"><p className="note st-left">{t("Nothing waiting for you today. Have a good evening.")}</p></section>}
          <button className="btn" type="button" onClick={lock}>{t("Lock and finish")}</button>
        </>
      ) : (
        <>
          <div className="eyebrow">{t("Help")}</div>
          <h1 className="st-title">{t("How it works")}</h1>
          <ol className="panel st-help">
            <li>{t("Scan the QR on the guest's card, or type the card code.")}</li>
            <li>{t("Check the first name with the guest.")}</li>
            <li>{visitVenue ? t("Tap Record visit once for each paid visit.") : stampVenue ? t("Tap Add a stamp once for each paid visit.") : t("Type the bill and tap Add points.")}</li>
            <li>{visitVenue ? t("If the card has a gift for this counter, tap Redeem and confirm. A gift is used once.") : t("If a reward is ready, tap Give.")}</li>
            {!visitVenue && <li>{t("Made a mistake? Undo works for 10 minutes.")}</li>}
            <li>{t("At the end of your shift, open End to see your day and any thank-you waiting for you.")}</li>
          </ol>
        </>
      )}

      <Island message={msg} onGone={clearMsg} />
      <nav className="dock" aria-label={t("Staff sections")} style={{ "--n": TABS.length, "--at": TABS.indexOf(tab) } as CSSProperties}>
        {TABS.map((id, i) => (
          <button key={id} type="button" style={{ gridColumn: i + 1 }} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); setMsg(null); if (id === "recent") void loadRecent(); if (id === "end") { void loadRecent(); void loadPerks(); } }}>
            {t(TAB_LABEL[id])}
            {id === "end" && perks.length > 0 && <i className="st-dot" aria-label={t("Rewards waiting: {n}", { n: perks.length })} />}
          </button>
        ))}
      </nav>
      <p className="foot">{[t("Signed in as {name}", { name: me.name }), brand.poweredBy].filter(Boolean).join(" · ")}</p>
    </main>
  );
}
