"use client";

import { useEffect, useState } from "react";

export type IslandMessage = { kind: "ok" | "bad" | "warn"; text: string; id?: number };

const ICON = { ok: "✓", bad: "!", warn: "!" } as const;

/**
 * A short message in a dark pill at the top of the screen (the "dynamic island" pattern): it grows out of a small pill,
 * shows the message, and folds away on its own. Errors stay until the next action, so nothing important vanishes unread.
 */
export default function Island({ message, onGone, ms = 3200 }: { message: IslandMessage | null; onGone?: () => void; ms?: number }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!message || message.kind === "bad") return;
    const fold = setTimeout(() => setLeaving(true), ms);
    const gone = setTimeout(() => { setLeaving(false); onGone?.(); }, ms + 280);
    return () => { clearTimeout(fold); clearTimeout(gone); };
  }, [message, ms, onGone]);
  if (!message) return null;
  return (
    <div key={message.id ?? message.text} className={`island ${message.kind}${leaving ? " leaving" : ""}`} role={message.kind === "bad" ? "alert" : "status"}>
      <span className="island-dot" aria-hidden="true">{ICON[message.kind]}</span>
      <span>{message.text}</span>
      {message.kind === "bad" && onGone && <button type="button" className="island-x" aria-label="Close message" onClick={onGone}>×</button>}
    </div>
  );
}
