import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getVenue } from "@/lib/supabase";
import { getCardView } from "@/lib/cards";
import LanguageSwitch from "@/components/LanguageSwitch";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, poweredBy } from "@/lib/brand";
import { bookingDays, BOOK_MAX_PARTY } from "@/lib/bookings";
import { bookingsOn } from "@/lib/bookingsDb";
import { listBranches } from "@/lib/branchesDb";
import { telUrl } from "@/lib/placeLinks";
import { GUEST_CARD_COOKIE, guestCardFrom } from "@/lib/table/points";
import BookForm from "./BookForm";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;
export const metadata: Metadata = { robots: { index: false } };

/** Ask for a table. A request, not a promise: the venue answers, and the answer shows on this same page. */
export default async function BookPage({ params }: PageProps<"/book/[venue]">) {
  const venue = await getVenue((await params).venue);
  if (!venue || !(await bookingsOn(venue.id))) notFound();
  await connection();
  const locale = await getLocale();
  const t = await getTranslations("book");
  const jar = await cookies();
  const held = jar.get(GUEST_CARD_COOKIE)?.value;
  const cardId = held ? guestCardFrom(`${GUEST_CARD_COOKIE}=${held}`) : null;
  const view = cardId ? await getCardView(cardId).catch(() => null) : null;
  const mine = view && view.venue.id === venue.id ? view : null;
  const branches = (await listBranches(venue.id)).filter((b) => b.kind === "branch");
  const call = telUrl(branches[0]?.phone ?? null);
  const days = bookingDays();
  const words = Object.fromEntries(["day", "time", "party", "name", "phone", "note", "notePh", "branch", "send", "sending", "sentTitle", "sentLead", "when", "people", "pending", "confirmed", "declined", "cancelled", "past", "reply", "cancel", "another", "failed", "call"].map((k) => [k, t(k)]));

  return (
    <NextIntlClientProvider>
    <main className="app bk" lang={locale} dir={directionOf(locale)}>
      <div className="hub-bar">
        <Link className="hub-back" href="/">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          {venue.name}
        </Link>
        <LanguageSwitch languages={brandLanguages()} />
      </div>
      <header className="vh">
        <h1 className="vh-title">{t("title")}</h1>
        <p className="vh-sub">{t("lead", { venue: venue.name })}</p>
      </header>
      <BookForm venue={venue.slug} locale={locale} days={days} maxParty={BOOK_MAX_PARTY} name={mine?.memberName ?? ""} branches={branches.length > 1 ? branches.map((b) => ({ slug: b.slug, name: (locale === "ar" && b.nameAr) || b.name })) : []} callHref={call} words={words} />
      <p className="foot">{poweredBy()}</p>
    </main>
    </NextIntlClientProvider>
  );
}
