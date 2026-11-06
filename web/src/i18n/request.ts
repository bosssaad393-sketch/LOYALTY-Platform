import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { brandLanguages } from "@/lib/brand";
import { LOCALE_COOKIE, pickLocale } from "./locale";

// No language in the URL: printed QR codes and Wallet links stay the same.
export default getRequestConfig(async () => {
  const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, brandLanguages());
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
