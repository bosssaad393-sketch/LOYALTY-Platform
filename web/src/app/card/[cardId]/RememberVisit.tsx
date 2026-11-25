"use client";

import { useEffect, useState } from "react";

type Words = { on: string; undo: string; off: string };

/**
 * Visit venues: this phone remembers the card (the same cookie table orders use), so the venue's home page greets the
 * guest by name and opens their card in one tap. One line says so and offers the way out for a borrowed phone.
 */
export default function RememberVisit({ cardId, words }: { cardId: string; words: Words }) {
  const [state, setState] = useState<"on" | "off">("on");
  useEffect(() => {
    void fetch(`/api/card/${cardId}/remember`, { method: "POST" }).catch(() => {});
  }, [cardId]);
  async function forget() {
    await fetch(`/api/card/${cardId}/remember`, { method: "DELETE" }).catch(() => {});
    setState("off");
  }
  return state === "on" ? (
    <p className="note after vp-keep">{words.on} <button type="button" className="vp-undo" onClick={forget}>{words.undo}</button></p>
  ) : (
    <p className="note after vp-keep" role="status">{words.off}</p>
  );
}
