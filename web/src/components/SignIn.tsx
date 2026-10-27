"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import "./signin.css";

/** Two designs per role. The client picks the letter; nothing else in the app depends on it. */
export type SignInLook = "a" | "b";

type Props = {
  role: "owner" | "staff";
  look: SignInLook;
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => void;
  venueName?: string;
  venueSlug?: string;
  /** The "Powered by ..." line; empty hides it. */
  poweredBy?: string;
};

const Icon = ({ d }: { d: ReactNode }) => (
  <svg className="si-ic" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
);
/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */
const Crest = ({ src, size }: { src: string; size: number }) => <img src={src} alt="" width={size} height={size} />;
const MAIL = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>;
const LOCK = <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>;
const EYE = <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>;
const EYE_OFF = <><path d="M3 3l18 18" /><path d="M10.6 6.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.5 7.5A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 4-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>;
const ARROW = <path d="M5 12h14M13 6l6 6-6 6" />;
const SCAN = <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />;
const PLUS = <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>;
const SMILE = <><circle cx="12" cy="12" r="9" /><path d="M8 14.5s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01" /></>;

export default function SignIn({ role, look, busy, error, onSubmit, venueName = "Rewards", venueSlug = "demo", poweredBy = "Powered by LOYALTY" }: Props) {
  const [show, setShow] = useState(false);
  const crest = `/venues/${venueSlug}/crest.png`;
  const marble = `/venues/${venueSlug}/marble.jpg`;
  const key = `${role}-${look}`;
  const staff = role === "staff";
  const label = busy ? "Signing in…" : key === "owner-a" || key === "owner-b" ? "Enter" : key === "staff-a" ? "Let’s go" : "Start my shift";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSubmit(String(f.get("email") ?? "").trim(), String(f.get("password") ?? ""));
  }

  const form = (
    <form className="si-form" onSubmit={submit}>
      <label className="si-f">
        <span className="si-l">Email</span>
        <span className="si-in">
          {staff && look === "a" && <Icon d={MAIL} />}
          <input name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required placeholder={staff ? "Your email" : "name@email.com"} />
          {!(staff && look === "a") && <Icon d={MAIL} />}
        </span>
      </label>
      <label className="si-f">
        <span className="si-l">Password</span>
        <span className="si-in">
          {staff && look === "a" && <Icon d={LOCK} />}
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required placeholder={staff && look === "a" ? "Password" : "Your password"} />
          {!(staff && look === "a") && (
            <button type="button" className="si-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
              <Icon d={show ? EYE_OFF : EYE} />
            </button>
          )}
        </span>
      </label>
      {error && <p className="si-err" role="alert">{error}</p>}
      <button className="si-go" type="submit" disabled={busy}>
        <span>{label}</span>
        {staff && !busy && <Icon d={ARROW} />}
      </button>
    </form>
  );

  const powered = poweredBy ? <p className="si-pw">{poweredBy}</p> : null;

  return (
    <main className={`si si-${key}`} style={{ "--si-marble": `url(${marble})` } as React.CSSProperties}>
      {key === "owner-a" && (
        <div className="si-col">
          <div className="si-frame" aria-hidden="true" />
          <header className="si-brand">
            <Crest src={crest} size={44} />
            <h1 className="si-name foil">{venueName}</h1>
            <i className="si-rule" aria-hidden="true" />
            <span className="si-tag">Owner</span>
          </header>
          <section className="si-body">
            <h2 className="si-h">Welcome back</h2>
            <p className="si-s">Sign in with your own login.</p>
            {form}
          </section>
          {powered}
        </div>
      )}

      {key === "owner-b" && (
        <div className="si-col">
          <div className="si-card" aria-hidden="true">
            <span className="si-plate"><Crest src={crest} size={22} /></span>
            <span className="si-ck foil">{venueName}</span>
            <span className="si-ct">Owner</span>
            <span className="si-cw">Private access</span>
          </div>
          <section className="si-body">
            <h1 className="si-h">Welcome back</h1>
            <p className="si-s">Your guests, your rules, your offers.</p>
            {form}
          </section>
          {powered}
        </div>
      )}

      {key === "staff-a" && (
        <>
        <div className="si-rays" aria-hidden="true" />
        <div className="si-warm" aria-hidden="true" />
        <div className="si-col">
          <header className="si-brand">
            <span className="si-badge"><Crest src={crest} size={56} /></span>
          </header>
          <section className="si-body">
            <h1 className="si-h">Ready for <em>service?</em></h1>
            <p className="si-s">Sign in and give every guest a reason to come back.</p>
            {form}
            <ul className="si-steps" aria-hidden="true">
              <li><i><Icon d={SCAN} /></i>Scan the card</li>
              <li><i><Icon d={PLUS} /></i>Add the points</li>
              <li><i><Icon d={SMILE} /></i>Make their day</li>
            </ul>
          </section>
          {powered}
        </div>
        </>
      )}

      {key === "staff-b" && (
        <div className="si-col">
          <header className="si-top" aria-hidden="false">
            <span className="si-dot d1" aria-hidden="true" /><span className="si-dot d2" aria-hidden="true" /><span className="si-dot d3" aria-hidden="true" />
            <div className="si-hi">
              <small>{venueName} staff</small>
              <h1>Hey,<br />team.</h1>
              <p>Let&rsquo;s make tonight a good one.</p>
            </div>
            <span className="si-tile" aria-hidden="true"><Crest src={crest} size={34} /></span>
          </header>
          <section className="si-sheet">{form}</section>
          <p className="si-tip" aria-hidden="true">Scan. Add points. <b>Smile.</b></p>
          {powered}
        </div>
      )}
    </main>
  );
}
