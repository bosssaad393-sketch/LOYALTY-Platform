"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { AR } from "./uiArabic";

/**
 * The language of the owner and staff screens. The page reads the venue's language (the same choice as the guest pages:
 * the saved cookie, else the venue's first language) and passes it down; every text goes through t() with the English text.
 * Arabic comes from uiArabic.ts, keyed by the English text, so the English stays readable in the code. {name} marks a
 * value filled in at run time. Server error messages go through t() too: known ones are translated, others stay as sent.
 * tests/uiArabic.test.ts fails when a text given to t() has no Arabic.
 */

export type UiLang = "en" | "ar";
export type T = ((en: string, vars?: Record<string, string | number>) => string) & { lang: UiLang; dir: "ltr" | "rtl"; locale: string };

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

export function makeT(lang: UiLang): T {
  const t = ((en: string, vars?: Record<string, string | number>) => fill(lang === "ar" ? AR[en] ?? en : en, vars)) as T;
  t.lang = lang;
  t.dir = lang === "ar" ? "rtl" : "ltr";
  t.locale = lang === "ar" ? "ar-BH" : "en-GB";
  return t;
}

const Ctx = createContext<UiLang>("en");

export function UiLangProvider({ lang, children }: { lang: UiLang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useT(): T {
  const lang = useContext(Ctx);
  return useMemo(() => makeT(lang), [lang]);
}

/** Switches the owner/staff screens (and the guest pages) to the other language and reloads. */
export function LangToggle({ className = "chip" }: { className?: string }) {
  const t = useT();
  const other: UiLang = t.lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      className={className}
      lang={other}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    >
      {other === "ar" ? "العربية" : "English"}
    </button>
  );
}
