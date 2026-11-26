"use client";

import { useState } from "react";

type Words = { title: string; lead: string; button: string; copied: string; failed: string; shareText: string };

/**
 * Bring a friend: the guest shares their own invite link. It opens the join page, never this card. The link is made
 * on the first tap (POST /api/card/<id>/invite), then handed to the phone's share sheet, or copied where there is none.
 */
export default function InviteFriend({ cardId, words }: { cardId: string; words: Words }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/card/${cardId}/invite`, { method: "POST" });
      const { url } = (await res.json()) as { url?: string };
      if (!res.ok || !url) throw new Error("no link");
      if (typeof navigator.share === "function") {
        await navigator.share({ text: words.shareText, url }).catch((e: unknown) => { if ((e as { name?: string })?.name !== "AbortError") throw e; });
      } else {
        await navigator.clipboard.writeText(url);
        setNote(words.copied);
      }
    } catch {
      setNote(words.failed);
    }
    setBusy(false);
  }

  return (
    <section className="gs iv" aria-labelledby="iv-h">
      <h2 className="gs-h" id="iv-h">{words.title}</h2>
      <p className="iv-lead" dir="auto">{words.lead}</p>
      <button type="button" className="btn" onClick={share} disabled={busy}>{words.button}</button>
      <p className="note iv-note" role="status">{note ?? ""}</p>
    </section>
  );
}
