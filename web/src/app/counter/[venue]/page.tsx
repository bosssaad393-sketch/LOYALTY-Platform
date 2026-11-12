import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import GuestDoor, { DoorButtons, FollowRow } from "@/components/GuestDoor";
import { Go, Save } from "@/components/doorIcons";
import LanguageSwitch from "@/components/LanguageSwitch";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, poweredBy } from "@/lib/brand";
import { getVenue } from "@/lib/supabase";
import { GUEST_CARD_COOKIE, guestCardFrom, venueCard } from "@/lib/table/points";
import FeedbackForm from "./FeedbackForm";
import { readLinks } from "@/lib/venueLinks";

// Reads the guest's card cookie on every request.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/counter/[venue]">): Promise<Metadata> {
  const venue = await getVenue((await params).venue);
  return { title: venue ? venue.name : "Rewards", robots: { index: false } };
}

/** The page behind the QR code at the till or reception: the rewards card, the contact card, follow us, and feedback for members. */
export default async function CounterPage({ params }: PageProps<"/counter/[venue]">) {
  const { venue: slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();
  const locale = await getLocale();
  const t = await getTranslations("door");
  const raw = (await cookies()).get(GUEST_CARD_COOKIE)?.value;
  const cardId = guestCardFrom(raw ? `${GUEST_CARD_COOKIE}=${raw}` : null);
  const [card, links] = await Promise.all([cardId ? venueCard(venue.id, cardId) : null, readLinks(venue.id)]);
  const join = `/join/${encodeURIComponent(venue.slug)}`;

  return (
    <NextIntlClientProvider>
      <NetworkBackdrop fixed />
      <main className="app" lang={locale} dir={directionOf(locale)}>
        <LanguageSwitch languages={brandLanguages()} />
        <GuestDoor venueName={venue.name} venueSlug={venue.slug} line={card ? t("hello", { name: card.firstName }) : t("counterLine")}>
          <DoorButtons>
            <a className="btn primary" href={card ? `/card/${card.id}` : join}>{card ? t("myCard") : t("getCard")}<Go /></a>
            <a className="btn" href={`/api/contact/${encodeURIComponent(venue.slug)}`} download={`${venue.slug}.vcf`}>{t("save")}<Save /></a>
          </DoorButtons>
          <FollowRow label={t("follow")} i={2} links={{ Instagram: links.instagram }} />
          <section className="door-fb rv" style={{ "--i": 3 } as CSSProperties} aria-labelledby="door-fb-h">
            <h2 className="door-label" id="door-fb-h">{t("fbTitle")}</h2>
            {card ? <FeedbackForm venue={venue.slug} reviewUrl={links.googleReview} /> : (
              <div className="panel">
                <p className="door-msg">{t("fbMembers")}</p>
                <a className="btn" href={join}>{t("getCard")}</a>
              </div>
            )}
          </section>
        </GuestDoor>
        <p className="foot">{poweredBy()}</p>
      </main>
    </NextIntlClientProvider>
  );
}
