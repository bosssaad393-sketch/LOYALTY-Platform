"use client";

import { useCallback, useEffect, useState } from "react";
import "./pinpad.css";
import NetworkBackdrop from "./NetworkBackdrop";

type Props = {
  role: "owner" | "staff";
  busy: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  venueName?: string;
  venueSlug?: string;
  poweredBy?: string;
};

const MIN = 4;
const MAX = 8;
const AUTO = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

/** PIN sign-in for staff and owners: a keypad that also takes the keyboard. No email, no password. */
export default function PinPad({ role, busy, error, onSubmit, venueName = "Rewards", venueSlug = "demo", poweredBy = "Powered by LOYALTY" }: Props) {
  const [pin, setPin] = useState("");
  const owner = role === "owner";

  const press = useCallback((k: (typeof KEYS)[number]) => {
    if (busy) return;
    setPin((p) => (k === "clear" ? "" : k === "back" ? p.slice(0, -1) : p.length < MAX ? p + k : p));
  }, [busy]);

  // The dots empty as soon as the PIN is sent, so a wrong try starts clean.
  const send = useCallback(() => { onSubmit(pin); setPin(""); }, [onSubmit, pin]);

  // Six digits sign in at once (a short pause lets a longer PIN keep going); 4, 5, 7 and 8 digits use the button or Enter.
  useEffect(() => {
    if (pin.length !== AUTO || busy) return;
    const t = setTimeout(send, 300);
    return () => clearTimeout(t);
  }, [pin, busy, send]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
      else if (e.key === "Enter" && pin.length >= MIN && !busy) send();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, pin, busy, send]);

  return (
    <main className={`pp pp-${role}`}>
      <NetworkBackdrop />
      <div className="pp-stage">
      <i className="pp-orb o1" aria-hidden="true" /><i className="pp-orb o2" aria-hidden="true" /><i className="pp-orb o3" aria-hidden="true" /><i className="pp-orb o4" aria-hidden="true" />
      <div className="pp-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- brand mark; hidden when the client has no crest file */}
        <img className="pp-crest" src={`/venues/${venueSlug}/crest.png`} alt="" width={140} height={140} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <p className="pp-venue">{venueName}</p>
        <h1 className="pp-title">{owner ? "Owner" : "Staff"}</h1>
        <p className="pp-sub">{owner ? "Enter your PIN" : "Enter your PIN to start your shift"}</p>

        <div className="pp-dots" role="img" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: MAX }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} hidden={i >= Math.max(pin.length + 1, owner ? 6 : 4)} />)}
        </div>
        <p className="pp-err" role="alert">{error ?? ""}</p>

        <div className="pp-keys" role="group" aria-label="PIN keypad">
          {KEYS.map((k) => (
            <button key={k} type="button" className={`pp-key${k === "clear" || k === "back" ? " pp-fn" : ""}`} onClick={() => press(k)} aria-label={k === "clear" ? "Clear" : k === "back" ? "Delete last digit" : k} disabled={busy}>
              {k === "clear" ? "Clear" : k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>

        <button className="pp-go" type="button" disabled={busy || pin.length < MIN} onClick={send}>{busy ? "Checking…" : owner ? "Enter" : "Start my shift"}</button>
        <p className="pp-help">Forgot your PIN? {owner ? "Ask your LOYALTY developer." : "Ask the owner or a manager."}</p>
        {poweredBy && <p className="pp-pw">{poweredBy}</p>}
      </div>
      </div>
    </main>
  );
}
