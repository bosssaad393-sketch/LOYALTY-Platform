"use client";

import { useState, type CSSProperties } from "react";

type FieldName = "name" | "mobile" | "email" | "terms";
/** Which fields an answer from the server is about, so they can be marked and the first one focused. */
export function fieldsFor(code: string | undefined, form: { name: string; mobile: string; email: string; terms: boolean }): FieldName[] {
  if (code === "bad_email") return ["email"];
  if (code === "bad_mobile") return ["mobile"];
  if (code === "contact_required") return ["mobile", "email"];
  if (code === "incomplete") return [...(form.name.trim() ? [] : ["name" as const]), ...(form.terms ? [] : ["terms" as const])];
  return [];
}
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function JoinForm({ venue, venueName }: { venue: string; venueName: string }) {
  const t = useTranslations("join");
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
        email: form.get("email"),
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
    const fields = fieldsFor(body.code, { name: String(form.get("name") ?? ""), mobile: String(form.get("mobile") ?? ""), email: String(form.get("email") ?? ""), terms: form.get("terms") === "on" });
    setBad(fields);
    if (fields[0]) (el.elements.namedItem(fields[0]) as HTMLElement | null)?.focus();
  }

  return (
    <>
    <div className="jp rv" style={{ "--i": 1 } as CSSProperties} aria-hidden="true">
      <span className="beam" />
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
      <img className="jp-crest" src={`/venues/${venue}/crest.png`} alt="" width={54} height={54} />
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
        <input className="in" name="mobile" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+973 …" maxLength={30} onChange={() => { clear("mobile"); clear("email"); }} {...mark("mobile")} />
      </label>
      <label className="field">
        <span className="lbl">{t("email")}</span>
        <input className="in" name="email" type="email" dir="ltr" inputMode="email" autoComplete="email" autoCapitalize="off" placeholder="name@email.com" maxLength={120} onChange={() => { clear("email"); clear("mobile"); }} {...mark("email")} />
      </label>
      <p className="note" style={{ textAlign: "start", marginTop: -6 }}>{t("atLeastOne")}</p>
      <label className="check">
        <input type="checkbox" name="news" />
        <span>{t("news", { venue: venueName })}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="terms" required onChange={() => clear("terms")} {...mark("terms")} />
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
