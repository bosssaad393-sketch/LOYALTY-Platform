"use client";

import { useCallback, useEffect, useState } from "react";
import "./pinpad.css";
import NetworkBackdrop from "./NetworkBackdrop";
import VenueMark from "./VenueMark";
import { useT } from "@/lib/uiLang";

type Props = {
  role: "owner" | "staff";
  busy: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  venueName?: string;
  venueSlug?: string;
  poweredBy?: string;
  /** Sample mode only: a line under the keypad that says this is sample data and gives the sample PIN. */
  note?: string;
  /** BRAND_MARK=type: the venue name set in a thin frame instead of the crest file. */
  markType?: boolean;
};

const STAFF_LEN = 4;
const OWNER_LEN = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

/** PIN sign-in for staff and owners: a keypad that also takes the keyboard. No email, no password. */
export default function PinPad({ role, busy, error, onSubmit, venueName = "Rewards", venueSlug = "orbyn", poweredBy = "Powered by Orbyn", note, markType }: Props) {
  const [pin, setPin] = useState("");
  const t = useT();
  const owner = role === "owner";
  const max = owner ? OWNER_LEN : STAFF_LEN; // exactly this many digits and dots, no spare one

  const press = useCallback((k: (typeof KEYS)[number]) => {
    if (busy) return;
    setPin((p) => (k === "clear" ? "" : k === "back" ? p.slice(0, -1) : p.length < max ? p + k : p));
  }, [busy, max]);

  // The dots empty as soon as the PIN is sent, so a wrong try starts clean.
  const send = useCallback(() => { onSubmit(pin); setPin(""); }, [onSubmit, pin]);

  // A full PIN (4 for staff, 6 for owners) signs in at once.
  useEffect(() => {
    if (pin.length !== max || busy) return;
    const t = setTimeout(send, 120);
    return () => clearTimeout(t);
  }, [pin, busy, send, max]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
      else if (e.key === "Enter" && pin.length === max && !busy) send();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, pin, busy, send, max]);

  return (
    <main className={`pp pp-${role}`} dir={t.dir} lang={t.lang}>
      <NetworkBackdrop />
      <div className="pp-stage">
      <i className="pp-orb o1" aria-hidden="true" /><i className="pp-orb o2" aria-hidden="true" /><i className="pp-orb o3" aria-hidden="true" /><i className="pp-orb o4" aria-hidden="true" />
      <div className="pp-card">
        <div className="pp-subject">
        {markType ? <VenueMark name={venueName} slug={venueSlug} type className="pp-mark" /> : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- brand mark; hidden when the client has no crest file */}
            <img className="pp-crest" src={`/venues/${venueSlug}/crest.png`} alt="" width={140} height={140} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <p className="pp-venue">{venueName}</p>
          </>
        )}
        <h1 className="pp-title">{owner ? t("Owner") : t("Staff")}</h1>
        <p className="pp-sub">{owner ? t("Enter your PIN") : t("Enter your PIN to start your shift")}</p>
        </div>

        <div className="pp-sheet">
        <div className="pp-dots" dir="ltr" role="img" aria-label={t("{n} digits entered", { n: pin.length })}>
          {Array.from({ length: max }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
        </div>
        <p className="pp-err" role="alert">{error ? t(error) : ""}</p>

        <div className="pp-keys" dir="ltr" role="group" aria-label={t("PIN keypad")}>
          {KEYS.map((k) => (
            <button key={k} type="button" className={`pp-key${k === "clear" || k === "back" ? " pp-fn" : ""}`} onClick={() => press(k)} aria-label={k === "clear" ? t("Clear") : k === "back" ? t("Delete last digit") : k} disabled={busy}>
              {k === "clear" ? t("Clear") : k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>

        <button className="pp-go" type="button" disabled={busy || pin.length < max} onClick={send}>{busy ? t("Checking…") : owner ? t("Enter") : t("Start my shift")}</button>
        <p className="pp-help">{t("Forgot your PIN?")} {owner ? t("Ask your Orbyn developer.") : t("Ask the owner or a manager.")}</p>
        {note && <p className="pp-note">{note}</p>}
        {poweredBy && <p className="pp-pw">{poweredBy}</p>}
        </div>
      </div>
      </div>
    </main>
  );
}
