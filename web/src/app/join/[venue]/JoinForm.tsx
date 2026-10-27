"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export default function JoinForm({ venue, venueName }: { venue: string; venueName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
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
      router.push(`/card/${body.cardId}`);
      return;
    }
    setError(body.error ?? "No connection. Please try again.");
    setBusy(false);
  }

  return (
    <form className="pane" style={{ "--tex": `url(/venues/${venue}/texture.jpg)` } as CSSProperties} onSubmit={onSubmit}>
      <label className="field">
        <span className="lbl">Your name</span>
        <input className="in" name="name" autoComplete="name" placeholder="e.g. Sara" required maxLength={80} />
      </label>
      <label className="field">
        <span className="lbl">Mobile number</span>
        <input className="in" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="+973 …" maxLength={30} />
      </label>
      <label className="field">
        <span className="lbl">Email</span>
        <input className="in" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" placeholder="name@email.com" maxLength={120} />
      </label>
      <p className="note" style={{ textAlign: "left", marginTop: -6 }}>Please add at least one, so we can reach you about your card.</p>
      <label className="check">
        <input type="checkbox" name="news" />
        <span>Send me {venueName} news and offers as notifications on my Wallet card. (optional)</span>
      </label>
      <label className="check">
        <input type="checkbox" name="terms" required />
        <span>I agree to the <a href={`/join/${venue}/terms`}>Terms &amp; Conditions</a>.</span>
      </label>
      <p className="err" role="alert">{error}</p>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Creating your card…" : "Receive my card"}
      </button>
      <p className="note">Your details are used only to run your {venueName} rewards. You can ask for them to be deleted at any time.</p>
    </form>
  );
}
