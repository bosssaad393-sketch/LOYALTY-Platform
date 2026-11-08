import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import LanguageSwitch from "@/components/LanguageSwitch";
import { directionOf } from "@/i18n/locale";
import { brandLanguages, poweredBy } from "@/lib/brand";
import { getVenue } from "@/lib/supabase";
import { readMenu } from "@/lib/table/db";
import { filsText } from "@/lib/table/rules";
import "../../t/[code]/table.css";

// The menu, read only: for guests who open it from the home page or a link, away from a table. Ordering happens at the table.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/menu/[venue]">): Promise<Metadata> {
  const venue = await getVenue((await params).venue).catch(() => null);
  return { title: venue ? `${venue.name}, menu` : "Menu" };
}

export default async function MenuPage({ params }: PageProps<"/menu/[venue]">) {
  const venue = await getVenue((await params).venue);
  if (!venue) notFound();
  const locale = await getLocale();
  const t = await getTranslations("menuPage");
  const ar = locale === "ar";
  const menu = await readMenu(venue.id);
  const name = (x: { nameEn: string; nameAr: string | null }) => (ar && x.nameAr) || x.nameEn;

  return (
    <NextIntlClientProvider>
      <main className="app tb" lang={locale} dir={directionOf(locale)}>
        <LanguageSwitch languages={brandLanguages()} />
        <header className="tb-head rv" style={{ "--i": 0 } as CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
          <img className="tb-crest" src={`/venues/${venue.slug}/crest.png`} alt={venue.name} width={64} height={64} />
          <div>
            <p className="tb-venue">{venue.name}</p>
            <h1 className="tb-table">{t("title")}</h1>
          </div>
        </header>
        <p className="note rv" style={{ "--i": 1, textAlign: "start", marginTop: 14 } as CSSProperties}>{t("atTable")}</p>
        {menu.length === 0 && <p className="tb-empty">{t("empty")}</p>}
        {menu.length > 1 && (
          <nav className="tb-chips" aria-label={t("title")}>
            {menu.map((c) => <a key={c.id} className="tb-chip" href={`#m-${c.id}`}>{name(c)}</a>)}
          </nav>
        )}
        {menu.map((c) => (
          <section key={c.id} className="tb-cat" id={`m-${c.id}`} aria-labelledby={`mh-${c.id}`}>
            <h2 className="tb-cat-h" id={`mh-${c.id}`}>{name(c)}</h2>
            <ul className="tb-items">
              {c.items.map((i, k) => {
                const note = (ar && i.noteAr) || i.noteEn;
                return (
                  <li key={i.id} className={`tb-item rv${i.available ? "" : " off"}`} style={{ "--i": 2 + Math.min(k, 6) } as CSSProperties}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- menu photos come from the venue's own storage */}
                    {i.imageUrl && <img className="tb-photo" src={i.imageUrl} alt="" width={88} height={88} loading="lazy" decoding="async" />}
                    <div className="tb-item-main">
                      <b>{name(i)}</b>
                      {note && <small>{note}</small>}
                      <span className="tb-price">{i.available ? t("money", { amount: filsText(i.priceFils) }) : t("soldOut")}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="foot">{[venue.name, poweredBy()].filter(Boolean).join(" · ")}</p>
      </main>
    </NextIntlClientProvider>
  );
}
