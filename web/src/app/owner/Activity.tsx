"use client";

import { useState } from "react";
import { bahrainDayKey, bahrainTime } from "@/lib/format";
import { Loading, LoadError, PageHead, useGet } from "./ui";
import type { Call } from "./types";
import { useT } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";

/** GET /api/owner/activity: newest first, up to 200. `what` is one of ACTIVITY_TEXT in lib/activity.ts (English). */
export type ActivityItem = { id: string; what: string; who: string; branch: string | null; at: string; extra: string | null };
export type ActivityFilter = "all" | "visits" | "gifts" | "settings";

const VISITS = new Set(["Recorded a visit", "Added a stamp", "Gave a reward", "Added points"]);
const GIFTS = new Set(["Used a guest's voucher", "Cancelled a voucher", "Added a gift", "Changed a gift"]);

/** Which filter chip a line belongs to. Everything that is not a visit or a gift is team and settings. */
export function activityGroup(what: string): Exclude<ActivityFilter, "all"> {
  return VISITS.has(what) ? "visits" : GIFTS.has(what) ? "gifts" : "settings";
}

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: tx("All") },
  { id: "visits", label: tx("Visits") },
  { id: "gifts", label: tx("Gifts") },
  { id: "settings", label: tx("Team and settings") },
];

/** The English words the server adds about a person or a line; shown in the screen's language. */
const FIXED = [tx("A guest"), tx("The system"), tx("The till"), tx("Someone no longer on the team"), tx("A gift was unlocked")];
const said = (s: string, t: ReturnType<typeof useT>) => (FIXED.includes(s) ? t(s) : s);

/** Owner only: who did what and where, as a plain list grouped by day, with filter chips. Read only. */
export default function Activity({ call }: { call: Call }) {
  const t = useT();
  const log = useGet<{ activity: ActivityItem[] }>(call, "/api/owner/activity");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const rows = (log.data?.activity ?? []).filter((a) => filter === "all" || activityGroup(a.what) === filter);
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bahrain" });

  // One heading per Bahrain day, then that day's lines.
  const days: { key: string; label: string; items: ActivityItem[] }[] = [];
  for (const a of rows) {
    const key = bahrainDayKey(a.at);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(a);
    else days.push({ key, label: dayLabel(a.at), items: [a] });
  }

  return (
    <>
      <PageHead eyebrow={t("Owner only")} title={t("Activity")}>{t("Who recorded visits, used gifts and changed the team or settings. The last 200 actions, newest first, in Bahrain time.")}</PageHead>
      <div className="ow-chips ow-above" role="group" aria-label={t("Show")}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="ow-pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{t(f.label)}</button>
        ))}
      </div>
      {log.error ? <LoadError text={log.error} onRetry={log.reload} /> : !log.data ? <Loading /> : days.length === 0 ? (
        <section className="ow-panel">
          <p className="ow-note">{filter === "all" ? t("Nothing yet. Each visit recorded, gift used and change to the team or settings will be listed here with who did it.") : t("Nothing of this kind yet.")}</p>
        </section>
      ) : (
        <div className="ow-grid">
          {days.map((d) => (
            <section key={d.key} className="ow-panel ow-flush" aria-label={d.label}>
              <h2 className="ow-h ow-log-day">{d.label}</h2>
              <ul className="ow-list ow-log">
                {d.items.map((a) => (
                  <li key={a.id} className="ow-item">
                    <span className="ow-log-time" dir="ltr">{bahrainTime(a.at)}</span>
                    <span className="ow-item-main">
                      <b>{t(a.what)}</b>
                      <small>{[said(a.who, t), a.branch, a.extra ? said(a.extra, t) : null].filter(Boolean).join(" · ")}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
