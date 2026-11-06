"use client";

import { useState } from "react";

type Venue = { slug: string; name: string };

export default function JoinTeam({ token, venue }: { token: string; venue: Venue | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; pin: string } | null>(null);

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    setBusy(true); setError(null);
    const r = await fetch("/api/staff/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, name }) }).catch(() => null);
    const body = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (r?.ok && body?.pin) setDone({ name: body.name, pin: body.pin });
    else setError(body?.error ?? "Something went wrong. Please try again.");
  }

  return (
    <main className="ow tj">
      <div className="tj-in">
        {venue && (
          // eslint-disable-next-line @next/next/no-img-element -- small brand mark; hidden when the client has no crest file
          <img className="tj-crest" src={`/venues/${venue.slug}/crest.png`} alt="" width={96} height={96} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        {!venue ? (
          <section className="ow-panel">
            <h1 className="ow-h">This link has run out</h1>
            <p className="ow-sub">Ask the owner for a new one.</p>
          </section>
        ) : done ? (
          <section className="ow-panel" aria-live="polite">
            <h1 className="ow-h">You&apos;re nearly in, {done.name}</h1>
            <p className="ow-sub">This is your PIN. Save it now, because it is shown only once.</p>
            <p className="ow-pin">{done.pin}</p>
            <p className="ow-sub">It starts working as soon as the owner approves you.</p>
            <div className="ow-actions tj-go"><a className="ow-btn primary" href="/staff">Go to sign in</a></div>
          </section>
        ) : (
          <form className="ow-panel" onSubmit={join}>
            <h1 className="ow-h">Join the {venue.name} team</h1>
            <p className="ow-sub">Type your name. The owner approves you with one tap.</p>
            <div className="ow-field"><label className="ow-lbl" htmlFor="tj-name">Your name</label><input className="ow-in" id="tj-name" name="name" required minLength={2} maxLength={60} autoComplete="name" /></div>
            {error && <p className="ow-msg bad" role="alert">{error}</p>}
            <div className="ow-actions tj-go"><button className="ow-btn primary" type="submit" disabled={busy}>{busy ? "Joining…" : "Join the team"}</button></div>
          </form>
        )}
      </div>
    </main>
  );
}
