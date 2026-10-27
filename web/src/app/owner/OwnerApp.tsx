"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignIn, { type SignInLook } from "@/components/SignIn";
import type { BrandProps } from "@/lib/brand";
import { api } from "./api";
import Guests from "./Guests";
import Offers from "./Offers";
import Overview from "./Overview";
import Privacy from "./Privacy";
import Rules from "./Rules";
import Team from "./Team";
import type { Call, Me, Tab } from "./types";

const TABS: { id: Tab; label: string; ownerOnly?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "guests", label: "Guests" },
  { id: "rules", label: "Rules" },
  { id: "offers", label: "Offers" },
  { id: "team", label: "Team", ownerOnly: true },
  { id: "privacy", label: "Data and privacy", ownerOnly: true },
];

type Props = {
  initialMe: Me | null;
  /** Development only: run on fake data. page.tsx sets this, and api.ts checks the environment again. */
  mock?: boolean;
  initialTab?: Tab;
  /** Which sign-in design to show (A or B). */
  look?: SignInLook;
  /** The client's name and venue folder (public/venues/<slug>), from src/lib/brand.ts. */
  brand: BrandProps;
};

export default function OwnerApp({ initialMe, mock = false, initialTab = "overview", look = "a", brand }: Props) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const [tab, setTab] = useState<Tab>(initialTab);
  // Is 1 after "Send an update" is chosen on the Overview, so Offers opens with the form ready. Any other tab click clears it.
  const [compose, setCompose] = useState(0);

  const isOwner = me?.role === "owner";
  const canSee = me?.role === "owner" || me?.role === "manager";
  const out = useCallback(() => setMe(null), []);
  const call: Call = useCallback(
    <T,>(path: string, method?: string, body?: unknown) =>
      api<T>(path, method, body, mock).then((r) => {
        if (!r.ok && r.status === 401) out();
        return r;
      }),
    [mock, out],
  );

  const tabs = TABS.filter((t) => !t.ownerOnly || isOwner);
  // A manager cannot open owner-only sections, even through a stale tab value.
  const current: Tab = tabs.some((t) => t.id === tab) ? tab : "overview";
  const label = TABS.find((t) => t.id === current)?.label ?? "Overview";

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
    document.title = me && canSee ? `${label} · ${me.venue} Owner` : `${me?.venue ?? brand.name} Owner`;
  }, [label, me, canSee, brand.name]);

  /** Used by the sign-in block below. Returns an error text, or null when the login worked. */
  async function signIn(email: string, password: string): Promise<string | null> {
    const r = await api<Me>("/api/staff/login", "POST", { email, password }, mock);
    if (r.ok) { setMe(r.data); return null; }
    return r.error;
  }

  async function lock() {
    await call("/api/staff/logout", "POST", {});
    out();
  }

  if (!me) return <OwnerSignIn onSignIn={signIn} look={look} brand={brand} />;

  const venue = me.venue;

  return (
    <div className="ow">
      <a className="ow-skip" href="#ow-main">Skip to the content</a>
      <div className="ow-shell">
        <aside className="ow-side">
          <div className="ow-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark; hidden when the client has no crest file */}
            <img className="ow-crest" src={`/venues/${brand.slug}/crest.png`} alt="" width={36} height={36} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <span className="ow-name">{venue}<small>Owner</small></span>
          </div>
          <button className="ow-chip ow-lock" type="button" onClick={lock}>Lock</button>
          {canSee && (
            <nav className="ow-nav" aria-label="Owner sections">
              {tabs.map((t) => (
                <button key={t.id} type="button" className="ow-navbtn" aria-current={current === t.id ? "page" : undefined} onClick={() => { setCompose(0); setTab(t.id); }}>{t.label}</button>
              ))}
            </nav>
          )}
          <p className="ow-who">Signed in as {me.name}{brand.poweredBy && <><br />{brand.poweredBy}</>}</p>
        </aside>

        <main className="ow-main" id="ow-main" tabIndex={-1}>
          {!canSee ? (
            <section className="ow-panel">
              <p className="ow-msg bad">This login is for staff. The owner dashboard needs an owner or manager login.</p>
              <div className="ow-actions"><a className="ow-btn" href="/staff">Open the staff app</a></div>
            </section>
          ) : (
            <>
              {current === "overview" && <Overview call={call} isOwner={isOwner} onSendUpdate={() => { setCompose((c) => c + 1); setTab("offers"); }} />}
              {current === "guests" && <Guests call={call} isOwner={isOwner} mock={mock} />}
              {current === "rules" && <Rules call={call} isOwner={isOwner} />}
              {current === "offers" && <Offers call={call} isOwner={isOwner} venue={venue} composeSignal={compose} />}
              {current === "team" && isOwner && <Team call={call} />}
              {current === "privacy" && isOwner && <Privacy call={call} venue={venue} mock={mock} />}
            </>
          )}
          <p className="ow-end">Signed in as {me.name}{brand.poweredBy ? ` · ${brand.poweredBy}` : ""}</p>
        </main>
      </div>
      {mock && <span className="ow-mockflag">Mock data</span>}
    </div>
  );
}

/** The owner sign-in: the shared SignIn component (look A or B). onSignIn resolves to an error text, or null when the login worked. */
function OwnerSignIn({ onSignIn, look, brand }: { onSignIn: (email: string, password: string) => Promise<string | null>; look: SignInLook; brand: BrandProps }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(email: string, password: string) {
    setBusy(true); setError(null);
    const err = await onSignIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return <SignIn role="owner" look={look} busy={busy} error={error} onSubmit={submit} venueName={brand.name} venueSlug={brand.slug} poweredBy={brand.poweredBy} />;
}
