import type { CSSProperties, ReactNode } from "react";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import LanguageSwitch from "@/components/LanguageSwitch";
import { bookingsOn } from "@/lib/bookingsDb";
import VenueMark from "@/components/VenueMark";
import { VisitCardFace } from "@/components/VisitCard";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, brandMark, poweredBy } from "@/lib/brand";
import { listBranches } from "@/lib/branchesDb";
import { getCardView } from "@/lib/cards";
import { pullSampleCard } from "@/lib/sampleSync";
import { cardArt } from "@/lib/venueArt";
import { GUEST_CARD_COOKIE, guestCardFrom } from "@/lib/table/points";
import { readLinks } from "@/lib/venueLinks";
import { readWifi } from "@/lib/venueWifi";
import { readMenu } from "@/lib/table/db";
import { voucherState } from "@/lib/vouchers";
import { cardVouchers, listVouchers } from "@/lib/vouchersDb";
import type { Venue } from "@/lib/supabase";

const Icon = ({ d }: { d: string }) => (
  <svg className="hub-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const Chevron = () => (
  <svg className="hub-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
);
const IC = {
  menu: "M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-2 1.5-3 4-3 7h3m0-7v18",
  pin: "M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21zm0-8.8a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z",
  star: "M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.6z",
  wifi: "M2.5 9.5a14 14 0 0 1 19 0M5.5 13a9.5 9.5 0 0 1 13 0M8.6 16.4a5 5 0 0 1 6.8 0M12 19.6h.01",
  book: "M7 3v3M17 3v3M4.5 9.5h15M6 5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 5zM9 14l2 2 4-4",
  call: "M6.6 3.5h2.3a1 1 0 0 1 1 .8l.7 3.2a1 1 0 0 1-.5 1.1l-1.6.9a11.5 11.5 0 0 0 5.5 5.5l.9-1.6a1 1 0 0 1 1.1-.5l3.2.7a1 1 0 0 1 .8 1v2.3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z",
  insta: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM17.3 6.7h.01",
};

type RowProps = { href: string; icon: string; title: string; sub?: string | null; external?: boolean; download?: string };
function Row({ href, icon, title, sub, external, download }: RowProps) {
  return (
    <a className="hub-row" href={href} download={download} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <Icon d={icon} />
      <span className="hub-tx"><b>{title}</b>{sub && <small dir="auto">{sub}</small>}</span>
      <Chevron />
    </a>
  );
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, "");
const pretty = (phone: string) => phone.replace(/^(\+\d{3})\s?(\d{4})\s?(\d{4})$/, "$1 $2 $3");

const shortDate = (iso: string, ar: boolean) =>
  new Date(iso).toLocaleDateString(ar ? "ar-BH-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bahrain" });

/**
 * The guest's front door for a visit venue: the page behind the QR code on the table and at the till, and the site's
 * home page. Top to bottom, in the order a guest at a table needs them: the venue's name, their card (the real card
 * face: empty before joining, with their name and visits after, its light on while a gift waits), two buttons (the
 * card and the menu), then one short list of what a restaurant guest asks for: call, directions, review, Wi-Fi,
 * Instagram. Only what the venue has set is shown: there is never a dead row. The Google review link is for every
 * guest, with nothing asked or given in return.
 */
// Runs before the first paint: a guest who has already seen the opening in this visit to the site gets the page at once.
const OPENING = `try{var s=sessionStorage,d=document.documentElement;if(s.getItem("hubSeen"))d.setAttribute("data-hub-seen","");else{s.setItem("hubSeen","1");setTimeout(function(){d.setAttribute("data-hub-seen","")},3200)}}catch(e){}`;

export default async function VisitHub({ venue, branchSlug, tableLabel }: { venue: Venue; branchSlug?: string; /** Opened from a table's QR code: the table is named at the top. */ tableLabel?: string }) {
  const locale = await getLocale();
  const ar = locale === "ar";
  const t = await getTranslations("hub");
  const raw = (await cookies()).get(GUEST_CARD_COOKIE)?.value;
  const cardId = guestCardFrom(raw ? `${GUEST_CARD_COOKIE}=${raw}` : null);
  if (cardId) await pullSampleCard(cardId);
  const [view, links, wifi, branches, gifts, ownMenu] = await Promise.all([
    cardId ? getCardView(cardId).catch(() => null) : null,
    readLinks(venue.id),
    readWifi(venue.id),
    listBranches(venue.id),
    listVouchers(venue.id).catch(() => []),
    readMenu(venue.id).then((m) => m.some((c) => c.items.length > 0)).catch(() => false),
  ]);
  // The card in the cookie counts only when it is this venue's.
  const mine = view && view.venue.id === venue.id ? view : null;
  const held = mine ? await cardVouchers(mine.card.id, venue.id).catch(() => []) : [];
  const giftReady = held.some((v) => voucherState(v) === "ready");
  const giftAhead = !mine && gifts.some((g) => g.active && g.trigger === "first_visit");

  const own = branches.filter((b) => b.kind === "branch");
  const here = own.find((b) => b.slug === branchSlug) ?? own[0];
  const join = `/join/${encodeURIComponent(venue.slug)}${here && branchSlug ? `?b=${encodeURIComponent(here.slug)}` : ""}`;
  const to = mine ? `/card/${mine.card.id}` : join;
  // The venue's own menu in Orbyn wins. It is the first branch's menu: another branch keeps its own link if it has one.
  const ours = `/menu/${encodeURIComponent(venue.slug)}`;
  const outside = ownMenu && here?.id === own[0]?.id ? null : here?.menuUrl ?? null;
  const menu = outside ?? ours;
  const review = here?.reviewUrl ?? links.googleReview;
  const art = cardArt(venue.slug);
  const first = mine?.memberName.trim().split(/\s+/)[0] ?? "";

  const canBook = await bookingsOn(venue.id);
  const rows: ReactNode[] = [];
  if (canBook) rows.push(<Row key="book" href={`/book/${encodeURIComponent(venue.slug)}`} icon={IC.book} title={t("book")} sub={t("bookSub")} />);
  if (here?.phone) rows.push(<Row key="call" href={`tel:${digits(here.phone)}`} icon={IC.call} title={t("call")} sub={pretty(here.phone)} />);
  if (here?.mapsUrl) rows.push(<Row key="map" href={here.mapsUrl} external icon={IC.pin} title={t("directions")} sub={here.address ?? (own.length > 1 ? here.name : null)} />);
  if (review) rows.push(<Row key="review" href={review} external icon={IC.star} title={t("review")} sub={t("reviewSub")} />);
  if (wifi.name) {
    rows.push(
      <details key="wifi" className="hub-row hub-wifi">
        <summary>
          <Icon d={IC.wifi} />
          <span className="hub-tx"><b>{t("wifi")}</b><small>{t("wifiSub")}</small></span>
          <Chevron />
        </summary>
        <dl className="hub-wifi-in">
          <div><dt>{t("network")}</dt><dd dir="ltr">{wifi.name}</dd></div>
          {wifi.password && <div><dt>{t("password")}</dt><dd dir="ltr">{wifi.password}</dd></div>}
        </dl>
      </details>,
    );
  }
  if (links.instagram) rows.push(<Row key="insta" href={links.instagram} external icon={IC.insta} title="Instagram" sub={`@${links.instagram.replace(/\/+$/, "").split("/").pop()}`} />);
  // The heading is the name, large: the venue's before joining, the guest's own after.
  const big = mine ? first : venue.name;

  return (
    <main className="app hub" lang={locale} dir={directionOf(locale)}>
      <script dangerouslySetInnerHTML={{ __html: OPENING }} />
      <div className="hub-intro" aria-hidden="true">
        <VenueMark name={venue.name} slug={venue.slug} type={brandMark() === "type"} className="hub-intro-mark" size={168} />
      </div>
      <div className="hub-bar rv" style={{ "--i": 0 } as CSSProperties}>
        {/* The card just below carries the name set in type; only a real logo file earns a second place up here. */}
        {tableLabel ? <span className="hub-table">{t("table", { label: tableLabel })}</span>
          : brandMark() === "type" && art ? <span /> : <VenueMark name={venue.name} slug={venue.slug} type={brandMark() === "type"} className="hub-mark" size={72} />}
        <LanguageSwitch languages={brandLanguages()} />
      </div>

      <header className="hub-head rv" style={{ "--i": 0 } as CSSProperties}>
        <h1 className={`hub-title${big.length > 12 ? " long" : ""}`}>
          <span className="hub-pre">{mine ? t("helloPre") : t("titlePre")}</span>{" "}
          <span className={`hub-name${/[؀-ۿ]/.test(big) ? " ar" : ""}`} dir="auto"><span>{big}</span></span>
        </h1>
        <p className="hub-lead">{mine ? (giftReady ? t("leadGift") : t("leadMember")) : t("lead")}</p>
      </header>

      {art && (
        <a className="hub-hero rv" style={{ "--i": 1 } as CSSProperties} href={to} aria-label={mine ? t("myCard") : t("getCard")}>
          <VisitCardFace
            venueName={venue.name}
            venueSlug={venue.slug}
            markType={brandMark() === "type"}
            name={mine ? mine.memberName : t("yourName")}
            empty={!mine}
            since={mine?.card.created_at ? t("since", { date: shortDate(mine.card.created_at, ar) }) : venue.name}
            visits={mine ? mine.card.visits : null}
            visitsLabel={t("visits")}
            art={art}
            lit={giftReady}
            breathe={giftAhead}
          />
        </a>
      )}

      <div className="hub-act rv" style={{ "--i": 2 } as CSSProperties}>
        <div className="hub-two">
          <a className="btn primary hub-cta" href={to}>
            {mine ? t("openCard") : t("getCard")}
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
          <a className="btn hub-menu" href={menu} {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <Icon d={IC.menu} />
            {t("menu")}
          </a>
        </div>
        <p className="hub-note">{mine ? t("myCardSub") : giftAhead ? t("getCardGift") : t("getCardFree")}</p>
      </div>

      {rows.length > 0 && (
        <nav className="hub-sheet rv" style={{ "--i": 3 } as CSSProperties} aria-label={t("listLabel")}>
          {rows}
        </nav>
      )}

      {own.length > 1 && (
        <p className="hub-branches rv" style={{ "--i": 4 } as CSSProperties}>
          <span>{t("branches")}</span>
          {own.map((b) => (b.id === here?.id ? <b key={b.id} aria-current="true">{b.name}</b> : <a key={b.id} href={`?b=${encodeURIComponent(b.slug)}`}>{b.name}</a>))}
        </p>
      )}
      <p className="foot">{poweredBy()}</p>
    </main>
  );
}
