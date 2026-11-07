import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import VenueHeader from "@/components/VenueHeader";
import LanguageSwitch from "@/components/LanguageSwitch";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, brandName, brandVenue, poweredBy } from "@/lib/brand";

// The guest's language comes from their cookie, so this page is made at request time.
export const instant = false;

/** Any link that leads nowhere: a deleted or mistyped card link, an old table code, a wrong venue. In the venue's own look. */
export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");
  const venue = brandVenue();
  return (
    <NextIntlClientProvider>
      <NetworkBackdrop fixed />
      <main className="app" lang={locale} dir={directionOf(locale)}>
        <LanguageSwitch languages={brandLanguages()} />
        <VenueHeader venueName={brandName()} venueSlug={venue} eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
        <div className="actions">
          <a className="btn primary" href={`/join/${venue}`}>{t("join")}</a>
        </div>
        <p className="note" style={{ marginTop: 14 }}>{t("hasCard")}</p>
        {poweredBy() && <p className="foot">{poweredBy()}</p>}
      </main>
    </NextIntlClientProvider>
  );
}
