import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import QRCode from "qrcode";
import { getCardView, isUuid } from "@/lib/cards";
import { googleWalletConfigured } from "@/lib/googleWallet";
import { appleWalletConfigured } from "@/lib/appleWallet";
import BlackCard from "@/components/BlackCard";
import CardSheet, { SHEET_AR, SHEET_EN } from "./CardSheet";
import RememberCard from "./RememberCard";
import { brandColors, footerLine } from "@/lib/brand";
import { directionOf } from "@/i18n/locale";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

// The card page speaks the guest's language (the one they joined in).
const WORDS = {
  en: {
    welcome: (n: string) => `Welcome, ${n}. Your card is ready.`,
    keep: (u: string) => `Save it on your phone with the button below. Show it at every visit to collect ${u}.`,
    tip: (u: string) => `Tip: bookmark this page. It always shows your latest ${u}.`,
    stamps: "stamps", points: "points", apple: "Add to Apple Wallet",
    card: { member: "Member", code: "Your code", since: "Member since", ready: "Reward ready", stamps: "Stamps", points: "Points" },
  },
  ar: {
    welcome: (n: string) => `أهلاً ${n}، بطاقتك جاهزة.`,
    keep: (u: string) => `احفظها في جوالك من الزر بالأسفل. اعرضها عند كل زيارة لتجمع ${u}.`,
    tip: (u: string) => `نصيحة: احفظ هذه الصفحة، فهي تعرض دائماً آخر ${u} لك.`,
    stamps: "الأختام", points: "النقاط", apple: "أضف البطاقة إلى جوالك",
    card: { member: "عضو", code: "رمزك", since: "عضو منذ", ready: "المكافأة جاهزة", stamps: "أختام", points: "نقاط" },
  },
};

export default async function CardPage({ params, searchParams }: PageProps<"/card/[cardId]">) {
  const { cardId } = await params;
  const { welcome } = await searchParams;
  if (!isUuid(cardId)) notFound();
  const view = await getCardView(cardId);
  if (!view) notFound();
  const { card, venue, memberName, stamps } = view;
  const locale = await getLocale();
  const ar = locale === "ar";
  const w = ar ? WORDS.ar : WORDS.en;
  const unit = stamps ? w.stamps : w.points;
  // Every guest sees both languages on the two things they must act on (Saad, 2026-11-27): their own first, the other under it.
  const o = ar ? WORDS.en : WORDS.ar, oLang = ar ? "en" : "ar";
  const first = memberName.trim().split(/\s+/)[0];

  // Stamp venues: the reward texts in the guest's language when the venue gave them.
  const tiers = stamps?.tiers.map((t) => ({ at: t.at, text: (ar && t.ar) || t.text }));
  const goal = stamps ? stamps.cost : venue.reward_goal;
  const rewardText = stamps && tiers ? tiers[stamps.index].text : venue.reward_text;
  const qr = await QRCode.toDataURL(`LOYALTY:${venue.slug}:${card.code}`, {
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
            <b>{w.welcome(first)}</b>
            <span>{w.keep(unit)}</span>
            <span className="welcome-2" lang={oLang} dir={directionOf(oLang)}>{o.welcome(first)} {o.keep(stamps ? o.stamps : o.points)}</span>
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
          {appleWalletConfigured() && <a className="btn wallet" href={`/api/wallet/apple/${card.id}`}><span>{ar ? w.apple : ` ${w.apple}`}</span><small lang={oLang} dir={directionOf(oLang)}>{ar ? ` ${o.apple}` : o.apple}</small></a>}
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
