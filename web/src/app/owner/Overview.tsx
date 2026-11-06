"use client";

import { useMemo, useState } from "react";
import VisitsChart from "./Chart";
import { greeting, longDate, n } from "./format";
import PointsSummary from "./PointsSummary";
import { RewardFields, RewardState, useRewardEditor } from "./RewardForm";
import { Arrow, Count, Loading, LoadError, PageHead, Sheet, useGet } from "./ui";
import type { Call, Guest, Points, Rules, Summary } from "./types";

type SheetName = "points" | "reward" | null;

export default function Overview({ call, isOwner, onSendUpdate }: { call: Call; isOwner: boolean; onSendUpdate: () => void }) {
  const summary = useGet<Summary>(call, "/api/owner/summary");
  // The top-guests list and the quick-action previews are extras: if one fails the rest of the page still works.
  const guests = useGet<{ guests: Guest[] }>(call, "/api/owner/guests?q=");
  const week = useGet<Points>(call, "/api/owner/points?range=7d");
  const rules = useGet<Rules>(call, "/api/owner/rules");
  const [sheet, setSheet] = useState<SheetName>(null);

  const s = summary.data;
  const trend = s && s.visitsPrev7d > 0 ? Math.round(((s.visits7d - s.visitsPrev7d) / s.visitsPrev7d) * 100) : null;
  const top = useMemo(() => (guests.data?.guests ?? []).filter((g) => g.visits > 0).sort((a, b) => b.visits - a.visits || b.points - a.points).slice(0, 3), [guests.data]);

  return (
    <>
      <PageHead eyebrow={greeting()} title="Overview">{longDate()}. Live from the guests and staff at the till.</PageHead>

      {summary.error && <LoadError text={summary.error} onRetry={summary.reload} />}
      {!s && !summary.error && <Loading />}
      {s && (
        <section className="ow-lead" aria-label="This week">
          <div className="ow-lead-main">
            <span>Visits in 7 days</span>
            <b><Count id="ov-visits" value={s.visits7d} /></b>
            {trend !== null ? <em className={trend < 0 ? "down" : trend > 0 ? "up" : ""}>{trend > 0 ? "+" : ""}{trend}% on the 7 days before</em> : <em>No earlier week to compare yet</em>}
          </div>
          <div><span>Members</span><b><Count id="ov-members" value={s.members} /></b><em>+{n(s.newThisWeek)} this week</em></div>
          <div><span>Points held</span><b><Count id="ov-held" value={s.pointsHeld} /></b><em>By all guests</em></div>
          <div><span>Rewards</span><b><Count id="ov-rewards" value={s.rewards30d} /></b><em>In 30 days</em></div>
        </section>
      )}

      <div className="ow-two">
        {s ? (
          <section className="ow-panel" aria-labelledby="ow-h-chart">
            <h2 className="ow-h" id="ow-h-chart">Visits per day, last 14 days</h2>
            <VisitsChart days={s.perDay14} />
          </section>
        ) : <div />}
        <div className="ow-col">
          <section className="ow-panel" aria-labelledby="ow-h-do">
            <h2 className="ow-h" id="ow-h-do">Do next</h2>
            <div className="ow-do">
              {isOwner && <Quick title="Send an update" lead="Today’s reward and bonus" onClick={onSendUpdate} />}
              {isOwner && <Quick title="Change the reward" lead={rules.data ? `${rules.data.rewardText}, at ${n(rules.data.rewardGoal)} points` : "The reward, the goal and points per BHD"} onClick={() => setSheet("reward")} />}
              <Quick title="Points given out" lead={week.data ? `${n(week.data.issued)} in the last 7 days` : "Today, 7 days, 30 days or all time"} onClick={() => setSheet("points")} />
            </div>
          </section>
          {top.length > 0 && (
            <section className="ow-panel" aria-labelledby="ow-h-top">
              <h2 className="ow-h" id="ow-h-top">Top guests</h2>
              <ol className="ow-list ow-ranked">
                {top.map((g, i) => (
                  <li key={g.cardId} className="ow-item">
                    <span className="ow-rank" aria-hidden="true">{i + 1}</span>
                    <span className="ow-item-main"><b>{g.name}</b><small>{n(g.visits)} visits</small></span>
                    <span className="ow-item-side ow-fig">{n(g.points)} pts</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {sheet === "points" && <PointsSummary call={call} onClose={() => setSheet(null)} />}
      {sheet === "reward" && isOwner && <RewardSheet call={call} onSaved={rules.reload} onClose={() => setSheet(null)} />}
    </>
  );
}

function Quick({ title, lead, onClick }: { title: string; lead: string; onClick: () => void }) {
  return (
    <button type="button" className="ow-quick-card" onClick={onClick}>
      <span className="ow-quick-t">{title}</span>
      <span className="ow-quick-s">{lead}</span>
      <Arrow />
    </button>
  );
}

function RewardSheet({ call, onSaved, onClose }: { call: Call; onSaved: () => void; onClose: () => void }) {
  const editor = useRewardEditor(call);
  return (
    <Sheet eyebrow="Programme" title="Change the reward" onClose={onClose}>
      <RewardState editor={editor}>
        {(rules) => <RewardFields editor={editor} rules={rules} isOwner hint onSaved={onSaved} />}
      </RewardState>
    </Sheet>
  );
}
