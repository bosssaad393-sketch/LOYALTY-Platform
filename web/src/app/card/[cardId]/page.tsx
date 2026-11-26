import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import QRCode from "qrcode";
import { qrMessage } from "@/lib/cardQr";
import { getCardView, isUuid } from "@/lib/cards";
import { googleWalletConfigured } from "@/lib/googleWallet";
import { appleWalletConfigured } from "@/lib/appleWallet";
import BlackCard from "@/components/BlackCard";
import CardSheet, { SHEET_AR, SHEET_EN } from "./CardSheet";
import RememberCard from "./RememberCard";
import { brandColors, brandMark, footerLine } from "@/lib/brand";
import { directionOf } from "@/i18n/locale";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import type { CardView } from "@/lib/cards";
import { cardArt } from "@/lib/venueArt";
import { pullSampleCard } from "@/lib/sampleSync";
import { voucherState, nextMilestone } from "@/lib/vouchers";
import VisitCard from "@/components/VisitCard";
import { cardVouchers, listVouchers } from "@/lib/vouchersDb";
import { listBranches } from "@/lib/branchesDb";
import VisitSheet from "./VisitSheet";
import RememberVisit from "./RememberVisit";
import { readMenu } from "@/lib/table/db";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

// The card page speaks the guest's language (the one they joined in).
const WORDS = {
  en: {
    welcome: (n: string) => `Welcome, ${n}. Your card is ready.`,
    keep: (u: string) => `Keep it: add it to your Wallet or bookmark this page. Show it at the counter to collect ${u}.`,
    tip: (u: string) => `Tip: bookmark this page. It always shows your latest ${u}.`,
    stamps: "stamps", points: "points", apple: "Add to Apple Wallet",
    card: { member: "Member", code: "Your code", since: "Member since", ready: "Reward ready", stamps: "Stamps", points: "Points" },
  },
  ar: {
    welcome: (n: string) => `أهلاً ${n}، بطاقتك جاهزة.`,
    keep: (u: string) => `احفظها: أضفها إلى محفظة جوالك أو احفظ هذه الصفحة. اعرضها عند الكاشير لتجمع ${u}.`,
    tip: (u: string) => `نصيحة: احفظ هذه الصفحة، فهي تعرض دائماً آخر ${u} لك.`,
    stamps: "الأختام", points: "النقاط", apple: "أضف إلى Apple Wallet",
    card: { member: "عضو", code: "رمزك", since: "عضو منذ", ready: "المكافأة جاهزة", stamps: "أختام", points: "نقاط" },
  },
};

export default async function CardPage({ params, searchParams }: PageProps<"/card/[cardId]">) {
  const { cardId } = await params;
  const { welcome } = await searchParams;
  if (!isUuid(cardId)) notFound();
  // A hosted sample keeps its data per server process: fetch this card from the API process first (no-op when live).
  await pullSampleCard(cardId);
  const view = await getCardView(cardId);
  if (!view) notFound();
  const { card, venue, memberName, stamps } = view;
  const locale = await getLocale();
  const ar = locale === "ar";
  if (view.visitMode) return <VisitCardPage view={view} locale={locale} ar={ar} welcome={welcome === "1"} />;
  const w = ar ? WORDS.ar : WORDS.en;
  const unit = stamps ? w.stamps : w.points;

  // Stamp venues: the reward texts in the guest's language when the venue gave them.
  const tiers = stamps?.tiers.map((t) => ({ at: t.at, text: (ar && t.ar) || t.text }));
  const goal = stamps ? stamps.cost : venue.reward_goal;
  const rewardText = stamps && tiers ? tiers[stamps.index].text : venue.reward_text;
  const qr = await QRCode.toDataURL(qrMessage(venue.slug, card.code, card.id), {
    margin: 0,
    color: { dark: brandColors().bg, light: brandColors().text },
  });
  const since = card.created_at
    ? new Date(card.created_at).toLocaleDateString("en-GB", { month: "2-digit", year: "2-digit", timeZone: "Asia/Bahrain" })
    : undefined;

  return (
    <>
      <main className="app" lang={locale} dir={directionOf(locale)}>
        {welcome === "1" && (
          <p className="welcome" role="status">
            <b>{w.welcome(memberName.trim().split(/\s+/)[0])}</b>
            <span>{w.keep(unit)}</span>
          </p>
        )}
        <BlackCard
          venueName={venue.name}
          venueSlug={venue.slug}
          memberName={memberName}
          since={since}
          points={card.points}
          goal={goal}
          code={card.code}
          qr={qr}
          unit={stamps ? "stamps" : "points"}
          labels={w.card}
        />
        <div className="rv" style={{ "--i": 2 } as CSSProperties}>
          <CardSheet points={card.points} goal={goal} rewardText={rewardText} words={ar ? SHEET_AR : SHEET_EN}
            ladder={stamps && tiers ? { position: stamps.position, tiers, nextAt: stamps.tiers[stamps.index].at } : undefined} />
        </div>

        <div className="actions after">
          {appleWalletConfigured() && <a className="btn wallet" href={`/api/wallet/apple/${card.id}`}> {w.apple}</a>}
          {googleWalletConfigured() && (
            <a className="gw-badge" href={`/api/wallet/google/${card.id}`} aria-label="Add to Google Wallet">
              {/* eslint-disable-next-line @next/next/no-img-element -- official Google Wallet button artwork */}
              <img src="/badges/add-to-google-wallet-en.svg" alt="Add to Google Wallet" width={283} height={50} />
            </a>
          )}
        </div>
        <p className="note after" style={{ marginTop: 14 }}>{w.tip(unit)}</p>
        {/* Remembering the card only matters for table orders; stamp venues (salons, barbers) have no tables. */}
        {!stamps && <RememberCard cardId={card.id} />}
        <p className="foot after">{footerLine(venue.name)}</p>
      </main>
    </>
  );
}

const shortDate = (iso: string, ar: boolean) =>
  new Date(iso).toLocaleDateString(ar ? "ar-BH-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bahrain" });

/**
 * Visit card (migration 0022): the member card with visits instead of points, then the gift, then the branches.
 * Words come from messages/<locale>.json (visitCard). Points and stamp venues never reach this.
 */
async function VisitCardPage({ view, locale, ar, welcome }: { view: CardView; locale: string; ar: boolean; welcome: boolean }) {
  const { card, venue, memberName } = view;
  // A gift's state (ready, expired) depends on today's date, so this part always runs per request.
  await connection();
  const t = await getTranslations("visitCard");
  const [vouchers, defs, branches, hasMenu] = await Promise.all([
    cardVouchers(card.id, venue.id),
    listVouchers(venue.id),
    listBranches(venue.id),
    readMenu(venue.id).then((m) => m.some((c) => c.items.length > 0)).catch(() => false),
  ]);
  // Before the first visit: name the gift the first visit unlocks, if the venue has one switched on.
  const next = !vouchers.length ? defs.find((d) => d.active && d.trigger === "first_visit") : undefined;
  const upcoming = next ? (ar && next.titleAr) || next.title : null;
  // The ladder: the nearest gift tied to a visit number that is still ahead.
  const step = nextMilestone(defs, card.visits, vouchers.map((v) => v.voucherId));
  const ahead = step ? { gift: (ar && step.gift.titleAr) || step.gift.title, left: step.left } : null;
  const qr = await QRCode.toDataURL(qrMessage(venue.slug, card.code, card.id), { margin: 0, color: { dark: brandColors().bg, light: brandColors().text } });
  const first = memberName.trim().split(/\s+/)[0];

  return (
    <main className="app vp" lang={locale} dir={directionOf(locale)}>
      <div className="hub-bar">
        <Link className="hub-back" href="/">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          {venue.name}
        </Link>
      </div>
      {welcome && (
        <p className="welcome" role="status">
          <b>{t("welcome", { name: first })}</b>
          <span>{t("keep")}</span>
        </p>
      )}
      <VisitCard
        venueName={venue.name}
        venueSlug={venue.slug}
        markType={brandMark() === "type"}
        memberName={memberName}
        code={card.code}
        qr={qr}
        visits={card.visits}
        art={cardArt(venue.slug)}
        lit={vouchers.some((v) => voucherState(v) === "ready")}
        labels={{
          show: t("show"),
          aria: t("aria", { venue: venue.name }),
          code: t("code"),
          since: card.created_at ? t("since", { date: shortDate(card.created_at, ar) }) : "",
          visits: t("visits"),
          lastVisit: view.lastVisit ? t("lastVisit", { date: shortDate(view.lastVisit, ar) }) : t("noVisit"),
          noVisit: t("noVisit"),
          qrAlt: t("qrAlt", { code: card.code }),
        }}
      />
      <div className="rv" style={{ "--i": 2 } as CSSProperties}>
        <VisitSheet vouchers={vouchers} upcoming={upcoming} ahead={ahead} branches={branches} ar={ar} ownMenu={hasMenu ? `/menu/${encodeURIComponent(venue.slug)}` : null} />
      </div>
      <div className="actions after">
        {appleWalletConfigured() && <a className="btn wallet" href={`/api/wallet/apple/${card.id}`}> {t("apple")}</a>}
        {googleWalletConfigured() && (
          <a className="gw-badge" href={`/api/wallet/google/${card.id}`} aria-label="Add to Google Wallet">
            {/* eslint-disable-next-line @next/next/no-img-element -- official Google Wallet button artwork */}
            <img src="/badges/add-to-google-wallet-en.svg" alt="Add to Google Wallet" width={283} height={50} />
          </a>
        )}
      </div>
      <p className="note after" style={{ marginTop: 14 }}>{t("tip")}</p>
      <RememberVisit cardId={card.id} words={{ on: t("remembered"), undo: t("notMine"), off: t("forgotten") }} />
      <p className="foot after">{footerLine(venue.name)}</p>
    </main>
  );
}
