import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getVenue } from "@/lib/supabase";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import VenueHeader from "@/components/VenueHeader";
import LanguageSwitch from "@/components/LanguageSwitch";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, brandMark, poweredBy } from "@/lib/brand";
import { joinFields } from "@/lib/joinFields";
import JoinForm from "./JoinForm";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

export default async function JoinPage({ params, searchParams }: PageProps<"/join/[venue]">) {
  const { venue: slug } = await params;
  // The branch whose QR the guest scanned (?b=<branch slug>), passed on so the owner sees where guests join.
  const { b } = await searchParams;
  const branch = typeof b === "string" && /^[a-z0-9-]{1,40}$/.test(b) ? b : undefined;
  const markType = brandMark() === "type";
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
        markType={markType}
        eyebrow={t("eyebrow")}
        title={t("title", { venue: venue.name })}
        sub={t("sub")}
      />
      </div>
      <JoinForm venue={venue.slug} venueName={venue.name} fields={joinFields(venue.join_fields)} branch={branch} markType={markType} />
      <p className="foot">{foot}</p>
    </main>
    </NextIntlClientProvider>
  );
}
