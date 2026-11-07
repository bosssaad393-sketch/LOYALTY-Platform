"use client";

import { useEffect, useState } from "react";

/** Lets this phone remember the card, so points from table orders are added by themselves; with a way to undo it. */
export default function RememberCard({ cardId }: { cardId: string }) {
  const [state, setState] = useState<"on" | "off">("on");

  useEffect(() => {
    void fetch(`/api/card/${cardId}/remember`, { method: "POST" }).catch(() => {});
  }, [cardId]);

  async function forget() {
    await fetch(`/api/card/${cardId}/remember`, { method: "DELETE" }).catch(() => {});
    setState("off");
  }

  return state === "on" ? (
    <p className="note after" style={{ marginTop: 8 }}>
      This phone remembers your card, so points for what you order at a table are added by themselves.{" "}
      <button type="button" onClick={forget} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", font: "inherit", cursor: "pointer" }}>Not my phone</button>
    </p>
  ) : (
    <p className="note after" role="status" style={{ marginTop: 8 }}>Done. This phone no longer remembers your card.</p>
  );
}
