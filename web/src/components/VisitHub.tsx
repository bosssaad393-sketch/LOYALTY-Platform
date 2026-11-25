import type { CSSProperties, ReactNode } from "react";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import LanguageSwitch from "@/components/LanguageSwitch";
import VenueMark from "@/components/VenueMark";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, brandMark, poweredBy } from "@/lib/brand";
import { listBranches } from "@/lib/branchesDb";
import { cardArt } from "@/lib/venueArt";
import { GUEST_CARD_COOKIE, guestCardFrom, venueCard } from "@/lib/table/points";
import { readLinks } from "@/lib/venueLinks";
import { readWifi } from "@/lib/venueWifi";
import type { Venue } from "@/lib/supabase";

const Icon = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg className="hub-ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const IC = {
  card: "M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9zM3 10h18M7 15h4",
  menu: "M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-2 1.5-3 4-3 7h3m0-7v18",
  chat: "M20.5 11.6a8.4 8.4 0 0 1-12.3 7.5L3.5 20.5l1.4-4.5A8.4 8.4 0 1 1 20.5 11.6z",
  pin: "M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21zm0-8.8a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z",
  star: "M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.6z",
  wifi: "M2.5 9.5a14 14 0 0 1 19 0M5.5 13a9.5 9.5 0 0 1 13 0M8.6 16.4a5 5 0 0 1 6.8 0M12 19.6h.01",
  save: "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6",
  insta: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM17.3 6.7h.01",
  go: "M9 6l6 6-6 6",
};

type RowProps = { href: string; icon: string; title: string; sub?: string | null; i: number; primary?: boolean; external?: boolean; download?: string };
function Row({ href, icon, title, sub, i, primary, external, download }: RowProps) {
  return (
    <a className={`hub-row rv${primary ? " lead" : ""}`} style={{ "--i": i } as CSSProperties} href={href} download={download}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <Icon d={icon} />
      <span className="hub-tx"><b>{title}</b>{sub && <small dir="auto">{sub}</small>}</span>
      <svg className="hub-go" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={IC.go} /></svg>
    </a>
  );
}

const digits = (phone: string) => phone.replace(/\D/g, "");
const pretty = (phone: string) => phone.replace(/^\+973\s?/, "").replace(/(\d{4})(\d{4})$/, "$1 $2");

/**
 * The guest's front door for a visit venue: the page behind the QR code on the table and at the till, and the site's
 * home page. One short column of things a guest actually wants there: the card, the menu, a message, the way, a review,
 * the Wi-Fi, the contact. Only what the venue has set is shown: there is never a dead button. The Google review link is
 * for every guest, with nothing asked or given in return.
 */
export default async function VisitHub({ venue, branchSlug }: { venue: Venue; branchSlug?: string }) {
  const locale = await getLocale();
  const t = await getTranslations("hub");
  const raw = (await cookies()).get(GUEST_CARD_COOKIE)?.value;
  const cardId = guestCardFrom(raw ? `${GUEST_CARD_COOKIE}=${raw}` : null);
  const [card, links, wifi, branches] = await Promise.all([
    cardId ? venueCard(venue.id, cardId) : null,
    readLinks(venue.id),
    readWifi(venue.id),
    listBranches(venue.id),
  ]);
  const own = branches.filter((b) => b.kind === "branch");
  const here = own.find((b) => b.slug === branchSlug) ?? own[0];
  const join = `/join/${encodeURIComponent(venue.slug)}${here && branchSlug ? `?b=${encodeURIComponent(here.slug)}` : ""}`;
  const menu = here?.menuUrl ?? `/menu/${encodeURIComponent(venue.slug)}`;
  const review = here?.reviewUrl ?? links.googleReview;
  const art = cardArt(venue.slug);
  let n = 2;
  const rows: ReactNode[] = [];
  rows.push(<Row key="menu" i={n++} href={menu} external={Boolean(here?.menuUrl)} icon={IC.menu} title={t("menu")} sub={t("menuSub")} />);
  if (here?.phone) rows.push(<Row key="chat" i={n++} href={`https://wa.me/${digits(here.phone)}`} external icon={IC.chat} title={t("message")} sub={t("messageSub", { phone: pretty(here.phone) })} />);
  if (here?.mapsUrl) rows.push(<Row key="map" i={n++} href={here.mapsUrl} external icon={IC.pin} title={t("directions")} sub={here.address ?? (own.length > 1 ? here.name : null)} />);
  if (review) rows.push(<Row key="review" i={n++} href={review} external icon={IC.star} title={t("review")} sub={t("reviewSub")} />);

  return (
    <main className="app hub" lang={locale} dir={directionOf(locale)}>
      <LanguageSwitch languages={brandLanguages()} />
      <header className="hub-head rv" style={{ "--i": 0 } as CSSProperties}>
        <VenueMark name={venue.name} slug={venue.slug} type={brandMark() === "type"} className="hub-mark" size={96} />
        <h1 className="hub-title">{card ? t("hello", { name: card.firstName }) : t("title", { venue: venue.name })}</h1>
        <p className="hub-lead">{card ? t("leadMember") : t("lead")}</p>
      </header>

      <a className={`hub-card rv${art ? " art" : ""}`} style={{ "--i": 1 } as CSSProperties} href={card ? `/card/${card.id}` : join}>
        <span className="hub-card-tx">
          <b>{card ? t("myCard") : t("getCard")}</b>
          <small>{card ? t("myCardSub") : t("getCardSub")}</small>
        </span>
        <span className="hub-card-go">{card ? t("open") : t("join")}</span>
      </a>

      <nav className="hub-list" aria-label={t("listLabel")}>
        {rows}
        {wifi.name && (
          <details className="hub-row hub-wifi rv" style={{ "--i": n++ } as CSSProperties}>
            <summary>
              <Icon d={IC.wifi} />
              <span className="hub-tx"><b>{t("wifi")}</b><small>{t("wifiSub")}</small></span>
              <svg className="hub-go" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={IC.go} /></svg>
            </summary>
            <dl className="hub-wifi-in">
              <div><dt>{t("network")}</dt><dd dir="ltr">{wifi.name}</dd></div>
              {wifi.password && <div><dt>{t("password")}</dt><dd dir="ltr">{wifi.password}</dd></div>}
            </dl>
          </details>
        )}
        <Row i={n++} href={`/api/contact/${encodeURIComponent(venue.slug)}`} download={`${venue.slug}.vcf`} icon={IC.save} title={t("contact")} sub={t("contactSub", { venue: venue.name })} />
        {links.instagram && <Row i={n++} href={links.instagram} external icon={IC.insta} title="Instagram" sub={`@${links.instagram.replace(/\/+$/, "").split("/").pop()}`} />}
      </nav>

      {own.length > 1 && (
        <p className="hub-branches rv" style={{ "--i": n++ } as CSSProperties}>
          {t("branches")}{" "}
          {own.map((b, i) => (
            <span key={b.id}>{i > 0 && " · "}{b.id === here?.id ? <b>{b.name}</b> : <a href={`?b=${encodeURIComponent(b.slug)}`}>{b.name}</a>}</span>
          ))}
        </p>
      )}
      <p className="foot">{poweredBy()}</p>
    </main>
  );
}
