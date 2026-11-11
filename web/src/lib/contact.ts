// The venue's contact card: what "Save Contact" puts into a guest's phone book.
// Set per client in the environment (BRAND_PHONE, BRAND_WHATSAPP, BRAND_EMAIL, BRAND_WEBSITE). Anything missing or
// malformed is left out of the card; nothing is ever made up.

type Env = Record<string, string | undefined>;

export type Contact = { phone: string | null; whatsapp: string | null; email: string | null; website: string | null };

const phone = (v: string | undefined) => {
  const p = (v ?? "").replace(/[\s()-]/g, "");
  return /^\+?\d{7,15}$/.test(p) ? p : null;
};

export function venueContact(env: Env = process.env): Contact {
  const email = (env.BRAND_EMAIL ?? "").trim();
  const site = (env.BRAND_WEBSITE ?? "").trim();
  return {
    phone: phone(env.BRAND_PHONE),
    whatsapp: phone(env.BRAND_WHATSAPP),
    email: /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) && email.length <= 120 ? email : null,
    website: /^https:\/\/[^\s/]+\S*$/.test(site) && site.length <= 200 ? site : null,
  };
}

/** Text inside a vCard value: backslash, comma, semicolon and line breaks are escaped. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** A vCard 3.0 (the version every iPhone and Android opens). `fallbackSite` is used when no website is set. */
export function vcard(name: string, c: Contact, fallbackSite?: string | null): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:;${esc(name)};;;`, `FN:${esc(name)}`, `ORG:${esc(name)}`];
  if (c.phone) lines.push(`TEL;TYPE=WORK,VOICE:${c.phone}`);
  if (c.email) lines.push(`EMAIL;TYPE=WORK:${c.email}`);
  const site = c.website ?? fallbackSite;
  if (site) lines.push(`URL:${site}`);
  if (c.whatsapp) {
    lines.push(`item1.URL:https://wa.me/${c.whatsapp.replace(/\D/g, "")}`, "item1.X-ABLabel:WhatsApp");
  }
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}
