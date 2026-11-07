import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getVenue } from "@/lib/supabase";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import VenueHeader from "@/components/VenueHeader";
import LanguageSwitch from "@/components/LanguageSwitch";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, poweredBy } from "@/lib/brand";
import JoinForm from "./JoinForm";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

export default async function JoinPage({ params }: PageProps<"/join/[venue]">) {
  const { venue: slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();
  const locale = await getLocale();
  const t = await getTranslations("join");
  const foot = [t("footer", { venue: venue.name }), poweredBy()].filter(Boolean).join(" · ");

  return (
    <NextIntlClientProvider>
    <NetworkBackdrop fixed />
    <main className="app" lang={locale} dir={directionOf(locale)}>
      <LanguageSwitch languages={brandLanguages()} />
      <div className="rv" style={{ "--i": 0 } as CSSProperties}>
      <VenueHeader
        venueName={venue.name}
        venueSlug={venue.slug}
        eyebrow={t("eyebrow")}
        title={t("title", { venue: venue.name })}
        sub={t("sub")}
      />
      </div>
      <JoinForm venue={venue.slug} venueName={venue.name} />
      <p className="foot">{foot}</p>
    </main>
    </NextIntlClientProvider>
  );
}
