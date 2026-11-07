import type { CSSProperties } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import VenueHeader from "@/components/VenueHeader";
import LanguageSwitch from "@/components/LanguageSwitch";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, brandName, brandVenue, poweredBy } from "@/lib/brand";
import { getVenue } from "@/lib/supabase";

// The venue's rules are read live and the guest's language comes from their cookie, so this page is made per request.
export const instant = false;

/**
 * The front door: someone who opens the site's address instead of a QR code. It says what the card is, how it works with this
 * venue's real rules, and gets them to their card. Staff and the owner find their sign-in at the foot.
 */
export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations("home");
  const slug = brandVenue();
  const venue = await getVenue(slug).catch(() => null);
  const name = venue?.name ?? brandName();
  const rate = Number(venue?.points_per_bhd ?? 0);
  const goal = Number(venue?.reward_goal ?? 0);
  const reward = venue?.reward_text?.trim() ?? "";

  const steps = [
    { title: t("step1"), text: t("step1Text") },
    { title: t("step2"), text: t("step2Text") },
    {
      title: t("step3"),
      text: rate > 0 && goal > 0 && reward ? t("step3Text", { rate, goal, reward }) : t("step3Plain"),
    },
  ];

  return (
    <NextIntlClientProvider>
      <NetworkBackdrop fixed />
      <main className="app" lang={locale} dir={directionOf(locale)}>
        <LanguageSwitch languages={brandLanguages()} />
        <div className="dots rv" style={{ "--i": 0 } as CSSProperties}>
          <VenueHeader venueName={name} venueSlug={slug} eyebrow={t("eyebrow", { venue: name })} title={t("title")} sub={t("sub")} />
        </div>

        <div className="actions rv" style={{ "--i": 2 } as CSSProperties}>
          {venue && <a className="btn primary shine" href={`/join/${venue.slug}`}>{t("join")}</a>}
          <p className="note">{venue ? t("hasCard") : t("noVenue")}</p>
        </div>

        <ol className="hm-steps" aria-label={t("howLabel")}>
          {steps.map((s, i) => (
            <li key={i} className="rv" style={{ "--i": 3 + i } as CSSProperties}>
              <span className="hm-n" aria-hidden="true">{i + 1}</span>
              <div>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <nav className="hm-team rv" style={{ "--i": 6 } as CSSProperties} aria-label={t("teamLabel")}>
          <a href="/staff">{t("staff")}</a>
          <span aria-hidden="true">·</span>
          <a href="/owner">{t("owner")}</a>
        </nav>
        {poweredBy() && <p className="foot">{poweredBy()}</p>}
      </main>
    </NextIntlClientProvider>
  );
}
