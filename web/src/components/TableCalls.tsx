"use client";

import { useState } from "react";

type Words = { waiter: string; bill: string; sent: string; failed: string };

/**
 * On a table's page: call the waiter, or ask for the bill. The call goes to the staff's table board and wakes their
 * phones. A call stays "on its way" until the page is opened again; pressing twice changes nothing.
 */
export default function TableCalls({ token, words }: { token: string; words: Words }) {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function call(kind: "waiter" | "bill") {
    setBusy(kind); setFailed(false);
    const res = await fetch(`/api/table/${encodeURIComponent(token)}/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) }).catch(() => null);
    setBusy(null);
    if (res?.ok) setSent((s) => ({ ...s, [kind]: true }));
    else setFailed(true);
  }

  return (
    <div className="hub-calls">
      <div className="hub-calls-two">
        {(["waiter", "bill"] as const).map((k) => (
          <button key={k} type="button" className={`btn hub-call${sent[k] ? " on" : ""}`} onClick={() => call(k)} disabled={busy !== null || sent[k]} aria-pressed={Boolean(sent[k])}>
            {k === "waiter" ? words.waiter : words.bill}
          </button>
        ))}
      </div>
      <p className="note hub-calls-note" role="status">{failed ? words.failed : sent.waiter || sent.bill ? words.sent : ""}</p>
    </div>
  );
}
