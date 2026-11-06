"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCALE_COOKIE, type Locale } from "@/i18n/locale";

function saveLanguage(code: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
}

/** One button per language the client offers. Saves the guest's choice for a year. Hidden with a single language. */
export default function LanguageSwitch({ languages }: { languages: readonly Locale[] }) {
  const t = useTranslations("language");
  const current = useLocale();
  const router = useRouter();

  if (languages.length < 2) return null;

  function choose(code: Locale) {
    saveLanguage(code);
    router.refresh();
  }

  return (
    <div className="lang-row" role="group" aria-label={t("label")}>
      {languages.map((code) => (
        <button
          key={code}
          className="lang-switch"
          type="button"
          lang={code}
          aria-current={code === current ? "true" : undefined}
          onClick={() => code !== current && choose(code)}
        >
          {LANGUAGES[code].name}
        </button>
      ))}
    </div>
  );
}
