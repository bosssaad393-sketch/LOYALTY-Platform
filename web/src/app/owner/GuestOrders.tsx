"use client";

import { filsMoney } from "@/lib/format";
import type { Favourite, GuestBill } from "@/lib/guestOrders";
import { n } from "./format";
import { Loading, LoadError, useGet } from "./ui";
import type { Call } from "./types";
import { useT } from "@/lib/uiLang";

type Orders = { bills: GuestBill[]; favourites: Favourite[]; spentFils: number; billCount: number };

/**
 * What one guest ordered: the bills the till sent for their card and the rounds they ordered from a table's code,
 * newest first, with what they order most. Empty until a till is connected or guests order from the table code.
 */
export default function GuestOrders({ call, cardId }: { call: Call; cardId: string }) {
  const t = useT();
  const list = useGet<Orders>(call, `/api/owner/guests/orders?cardId=${cardId}`);
  const day = (iso: string) => new Date(iso).toLocaleDateString(`${t.locale}-u-nu-latn`, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bahrain" });

  if (list.error) return <LoadError text={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const { bills, favourites, spentFils, billCount } = list.data;

  if (bills.length === 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <p className="ow-note">{t("No orders on this card yet.")}</p>
        <p className="ow-note">{t("Orders appear here in two ways: your till sends each paid bill with the guest's 4-digit card code, or the guest orders from the code on their table. Ask Orbyn to connect your till.")}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <dl className="ow-counts go-sum">
        <div><dt>{t("Bills")}</dt><dd>{n(billCount)}</dd></div>
        <div><dt>{t("Spent")}</dt><dd dir="ltr">{filsMoney(spentFils)}</dd></div>
      </dl>
      {favourites.length > 0 && (
        <section aria-label={t("Orders most")}>
          <h3 className="ow-h">{t("Orders most")}</h3>
          <ul className="ow-list">
            {favourites.map((f) => (
              <li key={f.name} className="ow-item">
                <span className="ow-item-main"><b dir="auto">{f.name}</b></span>
                <span className="ow-item-side">{t("in {n} of {total} bills", { n: n(f.bills), total: n(billCount) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label={t("Every bill")}>
        <h3 className="ow-h">{t("Every bill")}</h3>
        <ul className="ow-list">
          {bills.map((b) => (
            <li key={b.id} className="ow-item go-bill">
              <div className="go-head">
                <b>{day(b.at)}</b>
                <span dir="ltr">{filsMoney(b.totalFils)}</span>
              </div>
              <small className="go-meta">
                {b.from === "till" ? t("From the till") : t("Ordered at the table")}
                {b.place ? ` · ${b.place}` : ""}
                {b.refunded ? ` · ${t("Refunded")}` : ""}
              </small>
              {b.items.length === 0 ? <small className="go-meta">{t("The till sent the total only, no dishes.")}</small> : (
                <ul className="go-lines">
                  {b.items.map((l, i) => (
                    <li key={i}><span dir="ltr" className="go-qty">{l.qty} ×</span><span dir="auto" className="go-name">{l.name}</span>{l.priceFils !== null && <span dir="ltr" className="go-price">{filsMoney(l.priceFils * l.qty)}</span>}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
