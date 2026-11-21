"use client";

import { useEffect, useRef, useState } from "react";
import { PointsChart } from "./Chart";
import { n } from "./format";
import { RANGES, bhd, dayLabel, summaryText } from "./pointsText";
import { Count, Loading, LoadError, Sheet, useGet } from "./ui";
import type { Call, Points, PointsRange } from "./types";
import { useT, type T } from "@/lib/uiLang";

/** Copy to the clipboard. The modern call needs a secure page and permission; the old one works almost everywhere else. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    box.remove();
    return ok;
  }
}

function period(p: Points, t: T): string {
  if (p.range === "today") return t("Today, {date}", { date: dayLabel(p.to, t) });
  if (p.from === p.to) return dayLabel(p.to, t);
  return t("{from} to {to}", { from: dayLabel(p.from, t), to: dayLabel(p.to, t) });
}

/** The "Points given out" sheet: one total, four quieter figures, a chart and a paragraph the owner can copy. */
export default function PointsSummary({ call, onClose }: { call: Call; onClose: () => void }) {
  const [range, setRange] = useState<PointsRange>("7d");
  const t = useT();
  const loaded = useGet<Points>(call, `/api/owner/points?range=${range}`);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const p = loaded.data;
  // The previous period stays on screen, dimmed, until the new one arrives.
  const fresh = p !== null && p.range === range;
  const text = p ? summaryText(p, t) : "";

  function pick(r: PointsRange) {
    setRange(r);
    setCopy("idle");
  }

  async function doCopy() {
    if (!p) return;
    const ok = await copyText(text);
    setCopy(ok ? "done" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), 2600);
  }

  return (
    <Sheet eyebrow={t("Overview")} title={t("Given out")} onClose={onClose}>
      <fieldset className="ow-seg">
        <legend className="ow-sr">{t("Period")}</legend>
        <div className="ow-seg-row">
          {RANGES.map((r) => (
            <label key={r.id} className="ow-seg-opt">
              <input type="radio" name="ow-range" value={r.id} checked={range === r.id} onChange={() => pick(r.id)} />
              <span>{t(r.label)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {loaded.error && !fresh && <LoadError text={loaded.error} onRetry={loaded.reload} />}
      {!p && !loaded.error && <Loading />}
      {p && (
        <div className={`ow-sheet-body${fresh ? "" : " is-busy"}`} aria-busy={!fresh}>
          <p className="ow-period">{period(p, t)}</p>
          <div className="ow-total">
            <span className="ow-kpi-l">{t("Given out")}</span>
            <b className="foil"><Count id="pts-issued" value={p.issued} /></b>
          </div>

          <dl className="ow-figs">
            <div>
              <dt>{t("Rewards given")}</dt>
              <dd><b><Count id="pts-rewards" value={p.rewards} /></b><small>{p.rewards === 0 ? t("none in this period") : t("for {n}", { n: n(p.redeemed) })}</small></dd>
            </div>
            <div>
              <dt>{t("Visits")}</dt>
              <dd><b><Count id="pts-visits" value={p.visits} /></b><small>{p.visits > 0 ? t("about {n} a visit", { n: n(Math.round(p.issued / p.visits)) }) : t("no visits yet")}</small></dd>
            </div>
            <div>
              <dt>{t("Total of bills")}</dt>
              <dd><b><Count id="pts-bills" value={p.billBhd} format={bhd} /></b><small>{t("BHD")}</small></dd>
            </div>
            <div>
              <dt>{t("Still held by guests")}</dt>
              <dd><b><Count id="pts-held" value={p.held} /></b><small>{t("right now, any period")}</small></dd>
            </div>
          </dl>

          <section className="ow-sheet-sec" aria-labelledby="ow-h-pchart">
            <h3 className="ow-h" id="ow-h-pchart">{p.perDay.length > 31 ? t("Given out and spent, per week") : t("Given out and spent, per day")}{p.range === "all" ? ` · ${t("last 90 days")}` : ""}</h3>
            {p.perDay.length > 1 ? <PointsChart days={p.perDay} /> : <p className="ow-note">{t("A chart appears when the period covers more than one day.")}</p>}
            {p.range === "all" && p.perDay.length > 1 && p.perDay[0].day > p.from && <p className="ow-note">{t("The figures above cover all time. The chart shows only the last 90 days.")}</p>}
          </section>

          <section className="ow-sheet-sec" aria-labelledby="ow-h-ptext">
            <h3 className="ow-h" id="ow-h-ptext">{t("To paste into a message")}</h3>
            <p className="ow-quote">{text}</p>
            <div className="ow-actions ow-copyrow">
              <button type="button" className="ow-btn primary" onClick={doCopy}>{t("Copy summary")}</button>
              <span className={`ow-copied${copy === "idle" ? "" : " on"}${copy === "failed" ? " bad" : ""}`} role="status">
                {copy === "done" ? t("Copied") : copy === "failed" ? t("Could not copy: select the text above") : ""}
              </span>
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
