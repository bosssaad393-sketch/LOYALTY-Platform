import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import GuestDoor, { DoorButtons } from "@/components/GuestDoor";
import { Go, Save } from "@/components/doorIcons";
import LanguageSwitch from "@/components/LanguageSwitch";
import NetworkBackdrop from "@/components/NetworkBackdrop";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, poweredBy } from "@/lib/brand";
import { findTable, readMenu, tableView } from "@/lib/table/db";
import { GUEST_CARD_COOKIE, guestCardFrom, venueCard } from "@/lib/table/points";
import { SENT_COOKIE, sentOrdersFrom } from "@/lib/table/sentOrders";
import TableApp from "./TableApp";

// Live data on every request: allow this page to block instead of prerendering.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/t/[code]">): Promise<Metadata> {
  const table = await findTable((await params).code);
  return { title: table ? `${table.venueName}, table ${table.label}` : "Table", robots: { index: false } };
}

/** The page behind a table's QR code. No sign-in and nothing to install. */
export default async function TablePage({ params, searchParams }: PageProps<"/t/[code]">) {
  const { code: token } = await params;
  const table = await findTable(token);
  if (!table) notFound();
  const locale = await getLocale();
  // The tab reads the clock (is a payment page still open?), so this page is always rendered at request time.
  await connection();
  const jar = await cookies();
  const phone = jar.get(GUEST_CARD_COOKIE)?.value;
  const sent = jar.get(SENT_COOKIE)?.value;
  const cardId = guestCardFrom(phone ? `${GUEST_CARD_COOKIE}=${phone}` : null);
  const sentOrders = sentOrdersFrom(sent ? `${SENT_COOKIE}=${sent}` : null);

  // A fresh scan opens the door: logo and three buttons. A guest who is ordering or paying goes straight back to the table.
  const q = await searchParams;
  if (!q.view && !q.pay && !q.tap_id && sentOrders.size === 0) {
    const t = await getTranslations("door");
    const card = cardId ? await venueCard(table.venueId, cardId) : null;
    const slug = encodeURIComponent(table.venueSlug);
    return (
      <NextIntlClientProvider>
        <NetworkBackdrop fixed />
        <main className="app" lang={locale} dir={directionOf(locale)}>
          <LanguageSwitch languages={brandLanguages()} />
          <GuestDoor venueName={table.venueName} venueSlug={table.venueSlug} line={t("tableLine", { label: table.label })}>
            <DoorButtons>
              <a className="btn primary" href={`/t/${encodeURIComponent(token)}?view=menu`}>{t("menu")}<Go /></a>
              <a className="btn" href={card ? `/card/${card.id}` : `/join/${slug}`}>{t("card")}<Go /></a>
              <a className="btn quiet" href={`/api/contact/${slug}`} download={`${table.venueSlug}.vcf`}>{t("save")}<Save /></a>
            </DoorButtons>
          </GuestDoor>
          <p className="foot">{poweredBy()}</p>
        </main>
      </NextIntlClientProvider>
    );
  }

  const [menu, tab] = await Promise.all([readMenu(table.venueId), tableView(table, cardId, sentOrders)]);

  return (
    <NextIntlClientProvider>
      <main className="app tb" lang={locale} dir={directionOf(locale)}>
        <LanguageSwitch languages={brandLanguages()} />
        <TableApp token={token} label={table.label} venueName={table.venueName} venueSlug={table.venueSlug} menu={menu} initialTab={tab} poweredBy={poweredBy()} />
      </main>
    </NextIntlClientProvider>
  );
}
