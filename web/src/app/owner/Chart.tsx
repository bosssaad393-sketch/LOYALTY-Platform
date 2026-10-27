"use client";

import { useEffect, useRef, useState } from "react";
import { n } from "./format";
import type { PointsDay } from "./types";

type Day = { day: string; visits: number };

const PAD_L = 32;
const PAD_B = 28;
const PAD_T = 8;

const label = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

/** Top of the scale: an even number, so the middle line is a whole number too. */
function top(max: number): number {
  const raw = Math.max(4, max);
  const unit = raw < 10 ? 2 : 10 ** Math.floor(Math.log10(raw)) * 0.2;
  return Math.ceil(raw / unit) * unit;
}

/**
 * Bars for the last days, drawn at the real width of the box so the text stays 11 px on a phone.
 * Today is the last bar and is the only one in full gold.
 */
export default function VisitsChart({ days }: { days: Day[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = width || 320;
  // Taller on wide screens so the bars keep their proportions.
  const H = Math.round(Math.min(240, Math.max(190, W * 0.34)));
  const max = top(Math.max(0, ...days.map((d) => d.visits)));
  const bw = (W - PAD_L) / days.length;
  const plotH = H - PAD_B - PAD_T;
  const total = days.reduce((s, d) => s + d.visits, 0);
  const busiest = days.reduce((a, b) => (b.visits > a.visits ? b : a), days[0]);
  const summary = total === 0 ? "No visits in the last 14 days." : `Visits per day, last 14 days. ${n(total)} in total. Busiest day: ${label(busiest.day, { weekday: "long", day: "numeric", month: "long" })}, ${n(busiest.visits)} visits.`;

  return (
    <div ref={box} className="ow-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={summary}>
        {[0, max / 2, max].map((g) => {
          const y = H - PAD_B - (plotH * g) / max;
          return (
            <g key={g}>
              <line className="ow-axis" x1={PAD_L} x2={W} y1={y} y2={y} />
              <text className="ow-tick" x={0} y={y + 4}>{n(g)}</text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const h = (plotH * d.visits) / max;
          const x = PAD_L + i * bw + bw * 0.2;
          const today = i === days.length - 1;
          return (
            <g key={d.day}>
              <rect className={`ow-bar${today ? " today" : ""}`} x={x} y={H - PAD_B - h} width={bw * 0.6} height={h} rx={2}>
                <title>{`${label(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${n(d.visits)} visits`}</title>
              </rect>
              <text className={`ow-tick${today ? " today" : ""}`} x={x + bw * 0.3} y={H - 9} textAnchor="middle">{label(d.day, { weekday: "narrow" })}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** More than this many days and the bars get too thin to read: they are added up per week instead. */
const MAX_GROUPS = 31;

type Group = { start: string; label: string; issued: number; redeemed: number };

function group(days: PointsDay[]): { groups: Group[]; weekly: boolean } {
  if (days.length <= MAX_GROUPS) {
    return { groups: days.map((d) => ({ start: d.day, label: label(d.day, { weekday: "short", day: "numeric", month: "short" }), issued: d.issued, redeemed: d.redeemed })), weekly: false };
  }
  const groups: Group[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const part = days.slice(i, i + 7);
    groups.push({
      start: part[0].day,
      label: `Week of ${label(part[0].day, { day: "numeric", month: "short" })}`,
      issued: part.reduce((s, d) => s + d.issued, 0),
      redeemed: part.reduce((s, d) => s + d.redeemed, 0),
    });
  }
  return { groups, weekly: true };
}

/**
 * Points given out (gold) beside points spent on rewards (cream), per day, or per week for long ranges.
 * Drawn at the real width of the box like the visits chart, so text stays 11 px on a phone.
 */
export function PointsChart({ days }: { days: PointsDay[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { groups, weekly } = group(days);
  const W = width || 320;
  const H = Math.round(Math.min(220, Math.max(176, W * 0.3)));
  const max = top(Math.max(0, ...groups.map((g) => Math.max(g.issued, g.redeemed))));
  const gw = (W - PAD_L) / groups.length;
  const plotH = H - PAD_B - PAD_T;
  const inner = gw * 0.74;
  const bar = Math.max(1.5, inner / 2 - 0.5);
  // One label about every 64 px, always on the first group.
  const every = Math.max(1, Math.ceil(groups.length / Math.max(2, Math.floor((W - PAD_L) / 64))));
  const issued = days.reduce((s, d) => s + d.issued, 0);
  const redeemed = days.reduce((s, d) => s + d.redeemed, 0);
  const best = groups.reduce((a, b) => (b.issued > a.issued ? b : a), groups[0]);
  const summary = issued === 0 && redeemed === 0
    ? "No points given out in this period."
    : `Points given out and spent on rewards, per ${weekly ? "week" : "day"}. ${n(issued)} given out and ${n(redeemed)} spent in total. Busiest ${weekly ? "week" : "day"}: ${best.label}, ${n(best.issued)} points.`;

  return (
    <div ref={box} className="ow-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={summary}>
        {[0, max / 2, max].map((g) => {
          const y = H - PAD_B - (plotH * g) / max;
          return (
            <g key={g}>
              <line className="ow-axis" x1={PAD_L} x2={W} y1={y} y2={y} />
              <text className="ow-tick" x={0} y={y + 4}>{n(g)}</text>
            </g>
          );
        })}
        {groups.map((g, i) => {
          const x0 = PAD_L + i * gw + (gw - inner) / 2;
          const hi = (plotH * g.issued) / max;
          const hr = (plotH * g.redeemed) / max;
          const tick = i % every === 0;
          const tx = Math.min(W - 18, Math.max(PAD_L + 14, x0 + inner / 2));
          return (
            <g key={g.start}>
              <rect className="ow-bar issued" x={x0} y={H - PAD_B - hi} width={bar} height={hi} rx={1}>
                <title>{`${g.label}: ${n(g.issued)} given out, ${n(g.redeemed)} spent`}</title>
              </rect>
              <rect className="ow-bar spent" x={x0 + bar + 1} y={H - PAD_B - hr} width={bar} height={hr} rx={1}>
                <title>{`${g.label}: ${n(g.issued)} given out, ${n(g.redeemed)} spent`}</title>
              </rect>
              {tick && <text className="ow-tick" x={tx} y={H - 9} textAnchor="middle">{label(g.start, { day: "numeric", month: "short" })}</text>}
            </g>
          );
        })}
      </svg>
      <ul className="ow-legend" aria-hidden="true">
        <li><i />Given out</li>
        <li><i className="spent" />Spent on rewards</li>
        {weekly && <li className="ow-legend-note">Added up per week</li>}
      </ul>
    </div>
  );
}
