"use client";

import { filsMoney } from "@/lib/format";
import { QUIET_DAYS, SPEND_DAYS, SPENDER_DAYS, type Spending } from "@/lib/guestOrders";
import { n } from "./format";
import { useGet } from "./ui";
import type { Call } from "./types";
import { useT } from "@/lib/uiLang";

/**
 * Overview: what members spend and order, from the bills the till sent. Shown only once there is a bill to count;
 * a venue with no till connected sees nothing here.
 */
export default function SpendingPanel({ call }: { call: Call }) {
  const t = useT();
  const got = useGet<Spending & { complete: boolean }>(call, "/api/owner/spending");
  const s = got.data;
  if (!s || (s.bills === 0 && s.spenders.length === 0)) return null;
  return (
    <section className="ow-panel ow-insights" aria-labelledby="ow-h-spend">
      <h2 className="ow-h" id="ow-h-spend">{t("What members order")}</h2>
      <p className="ow-note">{t("From the bills your till sent with a guest's card code. Guests without a card are not in these figures.")}</p>
      <dl className="ow-counts sp-counts">
        <div><dt>{t("Bills, {days} days", { days: SPEND_DAYS })}</dt><dd>{n(s.bills)}</dd></div>
        <div><dt>{t("Total")}</dt><dd dir="ltr">{filsMoney(s.totalFils)}</dd></div>
        <div><dt>{t("Average bill")}</dt><dd dir="ltr">{s.avgFils === null ? "–" : filsMoney(s.avgFils)}</dd></div>
      </dl>
      {s.dishes.length > 0 && (
        <>
          <h3 className="ow-h sp-h">{t("Ordered most, {days} days", { days: SPEND_DAYS })}</h3>
          <ol className="ow-list ow-ranked">
            {s.dishes.map((d, i) => (
              <li key={d.name} className="ow-item">
                <span className="ow-rank" aria-hidden="true">{i + 1}</span>
                <span className="ow-item-main"><b dir="auto">{d.name}</b></span>
                <span className="ow-item-side ow-fig">× {n(d.qty)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {s.spenders.length > 0 && (
        <>
          <h3 className="ow-h sp-h">{t("Spent most, {days} days", { days: SPENDER_DAYS })}</h3>
          <ol className="ow-list ow-ranked">
            {s.spenders.map((g, i) => (
              <li key={g.cardId} className="ow-item">
                <span className="ow-rank" aria-hidden="true">{i + 1}</span>
                <span className="ow-item-main"><b>{g.name}</b><small>{t("Bills: {n}", { n: n(g.bills) })}</small></span>
                <span className="ow-item-side ow-fig" dir="ltr">{filsMoney(g.spentFils)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {s.quiet.length > 0 && (
        <>
          <h3 className="ow-h sp-h">{t("Good spenders not seen for {days} days", { days: QUIET_DAYS })}</h3>
          <ul className="ow-list">
            {s.quiet.map((g) => (
              <li key={g.cardId} className="ow-item">
                <span className="ow-item-main"><b>{g.name}</b></span>
                <span className="ow-item-side ow-fig" dir="ltr">{filsMoney(g.spentFils)}</span>
              </li>
            ))}
          </ul>
          <p className="ow-note">{t("An offer to guests not seen lately reaches them: Offers, then choose who gets it.")}</p>
        </>
      )}
      {!s.complete && <p className="ow-note">{t("Counted over the latest 10,000 bills, so these figures are a little low.")}</p>}
    </section>
  );
}
