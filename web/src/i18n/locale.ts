/** Every language the app has text for. To add one: add messages/<code>.json and one line here. */
export const LANGUAGES = {
  en: { name: "English", dir: "ltr" },
  ar: { name: "العربية", dir: "rtl" },
} as const;

export type Locale = keyof typeof LANGUAGES;
export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && Object.hasOwn(LANGUAGES, value);
}

/** The guest's own choice if this client offers it, otherwise the client's first language. */
export function pickLocale(cookie: string | undefined, languages: readonly Locale[]): Locale {
  return isLocale(cookie) && languages.includes(cookie) ? cookie : languages[0];
}

export function directionOf(locale: string): "ltr" | "rtl" {
  return isLocale(locale) ? LANGUAGES[locale].dir : "ltr";
}
