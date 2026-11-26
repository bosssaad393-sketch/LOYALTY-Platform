"use client";

import { useState, type CSSProperties } from "react";
import type { JoinField } from "@/lib/joinFields";
import { birthdayValue, daysIn } from "@/lib/joinBirthday";
import VenueMark from "@/components/VenueMark";

// Guests join with name + mobile by default (Saad, 2026-11-22). A venue may also ask for email and a date of birth
// (venues.join_fields, migration 0022); a venue that sets nothing gets exactly the old form.
type FieldName = "name" | "mobile" | "email" | "birthday" | "terms";
/** Which fields an answer from the server is about, so they can be marked and the first one focused. */
export function fieldsFor(code: string | undefined, form: { name: string; mobile: string; email: string; terms: boolean }): FieldName[] {
  if (code === "bad_email" || code === "email_required") return ["email"];
  if (code === "bad_birthday") return ["birthday"];
  if (code === "bad_mobile") return ["mobile"];
  if (code === "contact_required") return ["mobile"];
  if (code === "incomplete") return [...(form.name.trim() ? [] : ["name" as const]), ...(form.terms ? [] : ["terms" as const])];
  return [];
}
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const monthName = (m: number, locale: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", { month: "long", timeZone: "UTC" }).format(Date.UTC(2000, m - 1, 1));

type Props = { venue: string; venueName: string; fields?: JoinField[]; branch?: string; /** A member's invite code (bring a friend). */ invite?: string; markType?: boolean; /** Does the offers box start ticked? (BRAND_OFFERS_BOX) */ newsTicked?: boolean };

export default function JoinForm({ venue, venueName, fields = ["mobile"], branch, invite, markType, newsTicked = true }: Props) {
  const t = useTranslations("join");
  const locale = useLocale();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const askEmail = fields.includes("email");
  const askBirthday = fields.includes("birthday");
  const errors = useTranslations("joinErrors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const [bad, setBad] = useState<FieldName[]>([]);
  const mark = (f: FieldName) => (bad.includes(f) ? { "aria-invalid": true as const, "aria-describedby": "join-err" } : {});
  const clear = (f: FieldName) => { if (bad.includes(f)) setBad((b) => b.filter((x) => x !== f)); };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const form = new FormData(el);
    // Half a birthday (a day but no month): ask for the rest before sending anything.
    const birthday = askBirthday ? birthdayValue(day, month) : "";
    if (birthday === "half") {
      setError(t("birthdayHalf"));
      setBad(["birthday"]);
      (el.elements.namedItem(day ? "bmonth" : "bday") as HTMLElement | null)?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setBad([]);
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        venue,
        name: form.get("name"),
        mobile: form.get("mobile"),
        ...(askEmail ? { email: form.get("email") } : {}),
        ...(askBirthday ? { birthday } : {}),
        ...(branch ? { branch } : {}),
        ...(invite ? { invite } : {}),
        terms: form.get("terms") === "on",
        news: form.get("news") === "on",
      }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && body.cardId) {
      router.push(`/card/${body.cardId}?welcome=1`);
      return;
    }
    setError(errors.has(body.code) ? errors(body.code) : body.error ?? errors("offline"));
    setBusy(false);
    // Mark the fields the answer is about and put the cursor in the first one, so the guest fixes it in one tap.
    const marked = fieldsFor(body.code, { name: String(form.get("name") ?? ""), mobile: String(form.get("mobile") ?? ""), email: String(form.get("email") ?? ""), terms: form.get("terms") === "on" });
    setBad(marked);
    const focus = marked[0] === "birthday" ? "bday" : marked[0];
    if (focus) (el.elements.namedItem(focus) as HTMLElement | null)?.focus();
  }

  return (
    <>
    <div className="jp rv" style={{ "--i": 1 } as CSSProperties} aria-hidden="true">
      <span className="beam" />
      {markType ? <VenueMark name={venueName} slug={venue} type className="jp-mark" /> : (
        // eslint-disable-next-line @next/next/no-img-element -- small static brand mark
        <img className="jp-crest" src={`/venues/${venue}/crest.png`} alt="" width={54} height={54} />
      )}
      <span className="jp-code">••••</span>
      <b className={`jp-name${who.trim() ? "" : " empty"}`}>{who.trim() || t("name")}</b>
      <span className="jp-venue">{venueName}</span>
    </div>
    <form className="pane rv" style={{ "--tex": `url(/venues/${venue}/texture.jpg)`, "--i": 2 } as CSSProperties} onSubmit={onSubmit}>
      <label className="field">
        <span className="lbl">{t("name")}</span>
        <input className="in" name="name" autoComplete="name" placeholder={t("namePlaceholder")} required maxLength={80} onChange={(e) => { setWho(e.target.value); clear("name"); }} {...mark("name")} />
      </label>
      <label className="field">
        <span className="lbl">{t("mobile")}</span>
        <input className="in" name="mobile" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+973 …" required maxLength={30} onChange={() => clear("mobile")} {...mark("mobile")} />
      </label>
      {askEmail && (
        <label className="field">
          <span className="lbl">{t("email")}</span>
          <input className="in" name="email" type="email" dir="ltr" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder={t("emailPlaceholder")} required maxLength={120} onChange={() => clear("email")} {...mark("email")} />
        </label>
      )}
      {askBirthday && (
        <fieldset className="field jb">
          <legend className="lbl">{t("birthday")} <span className="jb-opt">{t("optional")}</span></legend>
          <div className="jb-row">
            <label className="jb-cell">
              <span className="sr-only">{t("day")}</span>
              <select className="in" name="bday" autoComplete="bday-day" value={day} onChange={(e) => { setDay(e.target.value); clear("birthday"); }} {...mark("birthday")}>
                <option value="">{t("day")}</option>
                {Array.from({ length: daysIn(Number(month) || null) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
            <label className="jb-cell">
              <span className="sr-only">{t("month")}</span>
              <select className="in" name="bmonth" autoComplete="bday-month" value={month} onChange={(e) => { setMonth(e.target.value); if (Number(day) > daysIn(Number(e.target.value) || null)) setDay(""); clear("birthday"); }} {...mark("birthday")}>
                <option value="">{t("month")}</option>
                {MONTHS.map((m) => <option key={m} value={m}>{monthName(m, locale)}</option>)}
              </select>
            </label>
          </div>
          <span className="jb-hint">{t("birthdayHint")}</span>
        </fieldset>
      )}
      <label className="check">
        <input type="checkbox" name="news" defaultChecked={newsTicked} />
        <span>{t("news", { venue: venueName })}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="terms" required defaultChecked onChange={() => clear("terms")} {...mark("terms")} />
        <span>{t.rich("terms", { link: (chunks) => <a href={`/join/${venue}/terms`}>{chunks}</a> })}</span>
      </label>
      <p className="err" id="join-err" role="alert">{error}</p>
      <button className="btn primary shine" type="submit" disabled={busy}>
        {busy ? t("busy") : t("submit")}
      </button>
      <p className="note">{t("privacy", { venue: venueName })}</p>
    </form>
    </>
  );
}
