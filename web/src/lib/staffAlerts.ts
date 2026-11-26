// What a staff alert says (migration 0031). Pure, so the wording is easy to test.

export type WaitingCall = { table: string; kind: string };
export type Waiting = { calls: WaitingCall[]; newOrders: string[]; bookings: number };
export type AlertText = { title: string; body: string; url: string };

const CALL: Record<string, string> = {
  waiter: "calls the waiter",
  bill: "asks for the bill",
  cash: "wants to pay in cash",
  coal: "asks for coal",
  reward: "asks for their reward",
};

/** One short line a waiter can read on a watch: what is waiting, most urgent first, and where to tap. */
export function alertText(venueName: string, w: Waiting): AlertText {
  const lines = [
    ...w.calls.map((c) => `Table ${c.table} ${CALL[c.kind] ?? "needs you"}`),
    ...w.newOrders.map((t) => `Table ${t}: new order`),
    ...(w.bookings > 0 ? [w.bookings === 1 ? "A table request to answer" : `${w.bookings} table requests to answer`] : []),
  ];
  const floor = w.calls.length + w.newOrders.length > 0;
  if (!lines.length) return { title: venueName, body: "Something needs you. Open the table board.", url: "/staff/board" };
  const shown = lines.slice(0, 3).join(" · ");
  return { title: venueName, body: lines.length > 3 ? `${shown} · +${lines.length - 3} more` : shown, url: floor ? "/staff/board" : "/owner" };
}

/** The push services a staff device may register: the phone makers' own. Anything else is refused. */
export function pushHostOk(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "fcm.googleapis.com" || h.endsWith(".push.apple.com") || h === "updates.push.services.mozilla.com" || h.endsWith(".push.services.mozilla.com") || h.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}
