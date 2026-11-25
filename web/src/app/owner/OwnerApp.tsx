"use client";

import NetworkBackdrop from "@/components/NetworkBackdrop";
import { useCallback, useEffect, useRef, useState } from "react";
import PinPad from "@/components/PinPad";
import type { SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";
import type { SampleNote } from "@/lib/demo";
import { api } from "./api";
import Feedback from "./Feedback";
import Guests from "./Guests";
import Assistant from "./Assistant";
import Offers from "./Offers";
import Overview from "./Overview";
import Privacy from "./Privacy";
import Rules from "./Rules";
import Service from "./Service";
import Team from "./Team";
import Branches from "./Branches";
import Gifts from "./Gifts";
import AutoMessages from "./AutoMessages";
import Activity from "./Activity";
import VenueMark from "@/components/VenueMark";
import type { Call, Me, Tab } from "./types";
import { LangToggle, UiLangProvider, useT, type UiLang } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";

/**
 * pointsOnly: tables, table orders and the points assistant; hidden for stamp venues (salons, barbers, spas).
 * notVisit: the points assistant; hidden for visit-card venues (a restaurant on visits keeps its tables and menu).
 * visitOnly: branches, gifts, automatic messages and the activity log (migration 0022), only for visit-card venues.
 */
const TABS: { id: Tab; label: string; ownerOnly?: boolean; pointsOnly?: boolean; visitOnly?: boolean; notVisit?: boolean }[] = [
  { id: "overview", label: tx("Overview") },
  { id: "service", label: tx("Tables and menu"), pointsOnly: true },
  { id: "guests", label: tx("Guests") },
  { id: "feedback", label: tx("Feedback") },
  { id: "rules", label: tx("Rules") },
  { id: "offers", label: tx("Offers") },
  { id: "branches", label: tx("Branches"), visitOnly: true },
  { id: "gifts", label: tx("Gifts"), visitOnly: true },
  { id: "messages", label: tx("Automatic messages"), visitOnly: true },
  { id: "assistant", label: tx("Assistant"), ownerOnly: true, pointsOnly: true, notVisit: true },
  { id: "team", label: tx("Team"), ownerOnly: true },
  { id: "activity", label: tx("Activity"), ownerOnly: true, visitOnly: true },
  { id: "privacy", label: tx("Data and privacy"), ownerOnly: true },
];

/** The sections this person sees: owner-only ones for the owner, points-only ones not at stamp venues, visit-only ones at visit venues. */
export function visibleTabs(isOwner: boolean, stampVenue: boolean, visitVenue = false) {
  return TABS.filter((x) => (!x.ownerOnly || isOwner) && !(stampVenue && x.pointsOnly) && !(visitVenue && x.notVisit) && (!x.visitOnly || visitVenue));
}

type Props = {
  initialMe: Me | null;
  /** Sample mode (lib/demo.ts): the PINs to show on the sign-in screen, and a ribbon over the data. */
  sample?: SampleNote | null;
  initialTab?: Tab;
  /** Which sign-in design to show (A or B). */
  look?: SignInLook;
  /** The client's name and venue folder (public/venues/<slug>), from src/lib/brand.ts. */
  brand: BrandProps;
  /** The venue's language for these screens. */
  lang?: UiLang;
  /** Stamp venue (salon, barber, spa): no tables, no bills, no points per BHD. */
  stampVenue?: boolean;
  /** Visit-card venue (0022): branches, gifts and automatic messages instead of tables and the points assistant. */
  visitVenue?: boolean;
};

/** The owner dashboard in the venue's language (Arabic or English). */
export default function OwnerApp({ lang = "en", ...props }: Props) {
  return <UiLangProvider lang={lang}><OwnerScreen {...props} /></UiLangProvider>;
}

function OwnerScreen({ initialMe, initialTab = "overview", brand, sample = null, stampVenue = false, visitVenue = false }: Props) {
  const t = useT();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [tab, setTab] = useState<Tab>(initialTab);
  // Is 1 after "Send an update" is chosen on the Overview, so Offers opens with the form ready. Any other tab click clears it.
  const [compose, setCompose] = useState(0);

  const isOwner = me?.role === "owner";
  const canSee = me?.role === "owner" || me?.role === "manager";
  const out = useCallback(() => setMe(null), []);
  const call: Call = useCallback(
    <T,>(path: string, method?: string, body?: unknown) =>
      api<T>(path, method, body).then((r) => {
        if (!r.ok && r.status === 401) out();
        return r;
      }),
    [out],
  );

  const tabs = visibleTabs(isOwner, stampVenue, visitVenue);
  // A manager cannot open owner-only sections, even through a stale tab value.
  const current: Tab = tabs.some((x) => x.id === tab) ? tab : "overview";
  const label = t(TABS.find((x) => x.id === current)?.label ?? "Overview");

  // After a section change, move the cursor to the new page title so keyboard and screen-reader users land on it.
  const shown = useRef(current);
  useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    document.getElementById("ow-title")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [current]);

  // On a phone the section tabs scroll sideways: keep the open one in view.
  // (Scrolls the strip itself. scrollIntoView would also move the keyboard starting point past the skip link.)
  useEffect(() => {
    const btn = document.querySelector<HTMLElement>(".ow-navbtn[aria-current='page']");
    const nav = btn?.parentElement;
    if (!btn || !nav) return;
    const a = nav.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    if (b.left < a.left + 20) nav.scrollLeft += b.left - a.left - 20;
    else if (b.right > a.right - 20) nav.scrollLeft += b.right - a.right + 20;
  }, [current, canSee]);

  useEffect(() => {
    document.title = me && canSee ? `${label} · ${me.venue}` : `${me?.venue ?? brand.name} · ${t("Owner")}`;
  }, [label, me, canSee, brand.name, t]);

  /** Used by the sign-in block below. Returns an error text, or null when the login worked. */
  async function signIn(pin: string): Promise<string | null> {
    const r = await api<Me>("/api/staff/pin-login", "POST", { pin, area: "owner", venue: brand.slug });
    if (r.ok) { setMe(r.data); return null; }
    return t(r.error);
  }

  async function lock() {
    await call("/api/staff/logout", "POST", { area: "owner" });
    out();
  }

  if (!me) return <OwnerSignIn onSignIn={signIn} brand={brand} note={sample ? t("Sample data. Owner PIN {pin}", { pin: sample.ownerPin }) : undefined} />;

  const venue = me.venue;

  return (
    <div className="ow" dir={t.dir} lang={t.lang}>
      <NetworkBackdrop fixed />
      <a className="ow-skip" href="#ow-main">{t("Skip to the content")}</a>
      <div className="ow-shell">
        <aside className="ow-side">
          <div className="ow-brand">
            {brand.mark === "type" ? <VenueMark name={venue} slug={brand.slug} type className="ow-mark" /> : (
            // eslint-disable-next-line @next/next/no-img-element -- small static brand mark; hidden when the client has no crest file
            <img className="ow-crest" src={`/venues/${brand.slug}/crest.png`} alt={`${venue}, ${t("owner")}`} width={112} height={112} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
          </div>
          <button className="ow-chip ow-lock" type="button" onClick={lock}>{t("Lock")}</button>
          <LangToggle className="ow-chip" />
          {canSee && (
            <nav className="ow-nav" aria-label={t("Owner sections")}>
              {tabs.map((x) => (
                <button key={x.id} type="button" className="ow-navbtn" aria-current={current === x.id ? "page" : undefined} onClick={() => { setCompose(0); setTab(x.id); }}>{t(x.label)}</button>
              ))}
            </nav>
          )}
          <p className="ow-who">{t("Signed in as {name}", { name: me.name })}{brand.poweredBy && <><br />{brand.poweredBy}</>}</p>
        </aside>

        <main className="ow-main" id="ow-main" tabIndex={-1}>
          {sample && canSee && <p className="ow-sample" role="note"><b>{t("Sample data")}</b> {t("These guests and visits are invented so you can see the dashboard working. Nothing here is a real customer.")}</p>}
          {!canSee ? (
            <section className="ow-panel">
              <p className="ow-msg bad">{t("This login is for staff. The owner dashboard needs an owner or manager login.")}</p>
              <div className="ow-actions"><a className="ow-btn" href="/staff">{t("Open the staff app")}</a></div>
            </section>
          ) : (
            <>
              {current === "overview" && <Overview call={call} isOwner={isOwner} stampVenue={stampVenue} visitVenue={visitVenue} onOpen={(x) => { setCompose(0); setTab(x); }} onSendUpdate={() => { setCompose((c) => c + 1); setTab("offers"); }} />}
              {current === "service" && !stampVenue && <Service call={call} />}
              {current === "guests" && <Guests call={call} isOwner={isOwner} visitVenue={visitVenue} />}
              {current === "feedback" && <Feedback call={call} stampVenue={stampVenue} />}
              {current === "rules" && <Rules call={call} isOwner={isOwner} visitVenue={visitVenue} />}
              {current === "offers" && <Offers call={call} isOwner={isOwner} venue={venue} composeSignal={compose} />}
              {current === "assistant" && isOwner && !stampVenue && <Assistant call={call} />}
              {current === "team" && isOwner && <Team call={call} />}
              {current === "privacy" && isOwner && <Privacy call={call} venue={venue} />}
              {current === "branches" && visitVenue && <Branches call={call} isOwner={isOwner} />}
              {current === "gifts" && visitVenue && <Gifts call={call} isOwner={isOwner} />}
              {current === "messages" && visitVenue && <AutoMessages call={call} isOwner={isOwner} />}
              {current === "activity" && isOwner && <Activity call={call} />}
            </>
          )}
          <p className="ow-end">{t("Signed in as {name}", { name: me.name })}{brand.poweredBy ? ` · ${brand.poweredBy}` : ""}</p>
        </main>
      </div>
    </div>
  );
}

/** The owner sign-in: the shared SignIn component (look A or B). onSignIn resolves to an error text, or null when the login worked. */
function OwnerSignIn({ onSignIn, brand, note }: { onSignIn: (pin: string) => Promise<string | null>; brand: BrandProps; note?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(pin: string) {
    setBusy(true); setError(null);
    const err = await onSignIn(pin);
    setBusy(false);
    if (err) setError(err);
  }

  return <PinPad role="owner" busy={busy} error={error} onSubmit={submit} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} note={note} />;
}
