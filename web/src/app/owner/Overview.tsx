"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { spotMove } from "@/components/spotlight";
import VisitsChart from "./Chart";
import { greeting, longDate, n } from "./format";
import PointsSummary from "./PointsSummary";
import SpendingPanel from "./SpendingPanel";
import { RewardFields, RewardState, useRewardEditor } from "./RewardForm";
import { Arrow, Count, Loading, LoadError, PageHead, Sheet, useGet } from "./ui";
import { BUSY_WINDOW_DAYS, WEEKDAYS } from "@/lib/ownerInsights";
import type { Call, Guest, Insights, Points, Rules, Summary, Tab } from "./types";
import { useT } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";

const WEEKDAY_EN = [tx("Sunday"), tx("Monday"), tx("Tuesday"), tx("Wednesday"), tx("Thursday"), tx("Friday"), tx("Saturday")];

type SheetName = "points" | "reward" | null;

type OverviewProps = { call: Call; isOwner: boolean; onSendUpdate: () => void; stampVenue?: boolean; visitVenue?: boolean; onOpen?: (tab: Tab) => void };

export default function Overview({ call, isOwner, onSendUpdate, stampVenue = false, visitVenue = false, onOpen }: OverviewProps) {
  const summary = useGet<Summary>(call, "/api/owner/summary");
  // The top-guests list and the quick-action previews are extras: if one fails the rest of the page still works.
  const guests = useGet<{ guests: Guest[] }>(call, "/api/owner/guests?top=3");
  const week = useGet<Points>(call, "/api/owner/points?range=7d");
  const rules = useGet<Rules>(call, "/api/owner/rules");
  const insights = useGet<Insights>(call, "/api/owner/insights");
  const ins = insights.data;
  const [sheet, setSheet] = useState<SheetName>(null);
  const t = useT();

  const s = summary.data;
  const trend = s && s.visitsPrev7d > 0 ? Math.round(((s.visits7d - s.visitsPrev7d) / s.visitsPrev7d) * 100) : null;
  const top = useMemo(() => (guests.data?.guests ?? []).slice(0, 3), [guests.data]);
  const fresh = s !== undefined && s !== null && s.members === 0;
  // Visit-card venues (0022): no points and no reward ladder, so their figures are visits and gifts.
  const vc = visitVenue ? s?.visitCard : undefined;

  return (
    <>
      <PageHead eyebrow={greeting(t)} title={t("Overview")}>{longDate(t)}. {t("Live from the guests and staff at the till.")}</PageHead>

      {summary.error && <LoadError text={summary.error} onRetry={summary.reload} />}
      {!s && !summary.error && <Loading />}
      {fresh && (
        <section className="ow-panel ow-start rv" aria-labelledby="ow-h-start">
          <h2 className="ow-h" id="ow-h-start">{t("No guests yet")}</h2>
          <p className="ow-note">{visitVenue ? t("The numbers here fill in as guests join and staff record their visits. Three steps to the first guest:") : t("The numbers here fill in as guests join and staff add stamps or points. Three steps to the first guest:")}</p>
          <ol className="ow-steps">
            <li><b>{t("Print the QR code.")}</b> {t("Put it where guests wait or pay.")}</li>
            <li><b>{t("Guests scan it")}</b> {t("and get their card in under a minute.")}</li>
            <li><b>{t("Staff sign in")}</b> {visitVenue ? t("with their PIN and record each paid visit.") : t("with their PIN and stamp the card after each paid visit.")}</li>
          </ol>
          {!stampVenue && <div className="ow-actions"><a className="ow-btn primary" href="/owner/qr-kit" target="_blank" rel="noreferrer">{t("Open the QR kit")}</a></div>}
        </section>
      )}
      {s && !fresh && (
        <section className="ow-lead ow-bento" aria-label={t("This week")}>
          <div className="ow-lead-main spot rv" style={{ "--i": 0 } as CSSProperties} onPointerMove={spotMove}>
            <span>{t("Visits in 7 days")}</span>
            <b><Count id="ov-visits" value={s.visits7d} /></b>
            {trend !== null ? <em className={trend < 0 ? "down" : trend > 0 ? "up" : ""}>{t("{trend}% on the 7 days before", { trend: `${trend > 0 ? "+" : ""}${trend}` })}</em> : <em>{t("No earlier week to compare yet")}</em>}
          </div>
          <div className="spot rv" style={{ "--i": 1 } as CSSProperties} onPointerMove={spotMove}><span>{t("Members")}</span><b><Count id="ov-members" value={s.members} /></b><em>{t("+{n} this week", { n: n(s.newThisWeek) })}</em></div>
          {visitVenue ? (
            <>
              <div className="spot rv" style={{ "--i": 2 } as CSSProperties} onPointerMove={spotMove}><span>{t("Gifts waiting")}</span><b><Count id="ov-gw" value={vc?.giftsWaiting ?? 0} /></b><em>{t("On cards, not used yet")}</em></div>
              <div className="spot rv" style={{ "--i": 3 } as CSSProperties} onPointerMove={spotMove}><span>{t("Gifts used")}</span><b><Count id="ov-gu" value={vc?.giftsUsed30d ?? 0} /></b><em>{t("In 30 days")}</em></div>
            </>
          ) : (
            <>
              <div className="spot rv" style={{ "--i": 2 } as CSSProperties} onPointerMove={spotMove}><span>{rules.data?.stampTiers ? t("Stamps held") : t("Points held")}</span><b><Count id="ov-held" value={s.pointsHeld} /></b><em>{t("By all guests")}</em></div>
              <div className="spot rv" style={{ "--i": 3 } as CSSProperties} onPointerMove={spotMove}><span>{t("Rewards")}</span><b><Count id="ov-rewards" value={s.rewards30d} /></b><em>{t("In 30 days")}</em></div>
            </>
          )}
        </section>
      )}

      <div className="ow-two">
        {s && !fresh ? (
          <section className="ow-panel spot rv" style={{ "--i": 4 } as CSSProperties} onPointerMove={spotMove} aria-labelledby="ow-h-chart">
            <h2 className="ow-h" id="ow-h-chart">{t("Visits per day, last 14 days")}</h2>
            <VisitsChart days={s.perDay14} />
          </section>
        ) : <div />}
        <div className="ow-col">
          <section className="ow-panel rv" style={{ "--i": 5 } as CSSProperties} aria-labelledby="ow-h-do">
            <h2 className="ow-h" id="ow-h-do">{t("Do next")}</h2>
            {visitVenue ? (
              <div className="ow-do">
                {isOwner && <Quick title={t("Send an update")} lead={t("A notice on every card of guests who agreed")} onClick={onSendUpdate} />}
                <Quick title={t("Gifts")} lead={vc ? t("{n} waiting, {used} used so far", { n: n(vc.giftsWaiting), used: n(vc.giftsUsed) }) : t("What unlocks on a card, and where it is used")} onClick={() => onOpen?.("gifts")} />
                <Quick title={t("Branches")} lead={t("Menu, directions and review link for each place")} onClick={() => onOpen?.("branches")} />
              </div>
            ) : (
            <div className="ow-do">
              {isOwner && <Quick title={t("Send an update")} lead={t("Today’s reward and bonus")} onClick={onSendUpdate} />}
              {isOwner && <Quick title={t("Change the reward")} lead={rules.data ? (rules.data.stampTiers ? t("Rewards at {steps} stamps", { steps: rules.data.stampTiers.map((x) => x.at).join(t.lang === "ar" ? "، " : ", ") }) : t("{reward}, at {n} points", { reward: rules.data.rewardText, n: n(rules.data.rewardGoal) })) : t("The reward, the goal and points per BHD")} onClick={() => setSheet("reward")} />}
              <Quick title={rules.data?.stampTiers ? t("Stamps given out") : t("Points given out")} lead={week.data ? t("{n} in the last 7 days", { n: n(week.data.issued) }) : t("Today, 7 days, 30 days or all time")} onClick={() => setSheet("points")} />
            </div>
            )}
          </section>
          {vc && vc.perBranch7d.length > 1 && (
            <section className="ow-panel" aria-labelledby="ow-h-branch">
              <h2 className="ow-h" id="ow-h-branch">{t("Visits by branch, last 7 days")}</h2>
              <ul className="ow-list">
                {vc.perBranch7d.map((b) => (
                  <li key={b.branchId} className="ow-item"><span className="ow-item-main"><b>{b.name}</b></span><span className="ow-item-side ow-fig">{n(b.visits)}</span></li>
                ))}
              </ul>
            </section>
          )}
          {top.length > 0 && (
            <section className="ow-panel" aria-labelledby="ow-h-top">
              <h2 className="ow-h" id="ow-h-top">{t("Top guests")}</h2>
              <ol className="ow-list ow-ranked">
                {top.map((g, i) => (
                  <li key={g.cardId} className="ow-item">
                    <span className="ow-rank" aria-hidden="true">{i + 1}</span>
                    {visitVenue ? (
                      <>
                        <span className="ow-item-main"><b>{g.name}</b></span>
                        <span className="ow-item-side ow-fig">{t("Visits: {n}", { n: n(g.visits) })}</span>
                      </>
                    ) : (
                      <>
                        <span className="ow-item-main"><b>{g.name}</b><small>{t("Visits: {n}", { n: n(g.visits) })}</small></span>
                        <span className="ow-item-side ow-fig">{rules.data?.stampTiers ? t("{n} stamps", { n: n(g.points) }) : t("{n} pts", { n: n(g.points) })}</span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {ins && !fresh && s && (
        <section className="ow-panel ow-insights" aria-labelledby="ow-h-ins">
          <h2 className="ow-h" id="ow-h-ins">{t("Your guests")}</h2>
          <ul className="ow-list">
            <Fact label={t("Returning guests")} note={ins.returningRate === null ? t("No visits yet") : t("{n} of {total} guests who visited came back", { n: n(ins.returning), total: n(ins.visited) })} value={ins.returningRate === null ? "–" : `${ins.returningRate}%`} />
            <Fact label={t("Not seen for 30 days or more")} note={t("Visited before, but not in the last 30 days")} value={n(ins.lapsed)} />
            {!visitVenue && <Fact label={t("Near a reward")} note={t("Close to their next reward")} value={n(ins.nearReward)} />}
            {!visitVenue && <Fact label={t("Reward ready")} note={t("Can claim it on the next visit")} value={n(ins.rewardReady)} />}
            <Fact label={t("Busiest day")} note={ins.busiest ? t("{share}% of visits in the last {days} days", { share: ins.busiest.share, days: BUSY_WINDOW_DAYS }) : t("No visits in the last {days} days", { days: BUSY_WINDOW_DAYS })} value={ins.busiest ? t(WEEKDAY_EN[ins.busiest.weekday] ?? WEEKDAYS[ins.busiest.weekday]) : "–"} />
          </ul>
          {!ins.complete && <p className="ow-note">{t("Counted over the first 20,000 records, so these figures are a little low.")}</p>}
        </section>
      )}

      {!fresh && <SpendingPanel call={call} />}

      {sheet === "points" && <PointsSummary call={call} stampVenue={stampVenue} onClose={() => setSheet(null)} />}
      {sheet === "reward" && isOwner && <RewardSheet call={call} onSaved={rules.reload} onClose={() => setSheet(null)} />}
    </>
  );
}

function Fact({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <li className="ow-item">
      <span className="ow-item-main"><b>{label}</b><small>{note}</small></span>
      <span className="ow-item-side ow-fig">{value}</span>
    </li>
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
  const t = useT();
  return (
    <Sheet eyebrow={t("Programme")} title={t("Change the reward")} onClose={onClose}>
      <RewardState editor={editor}>
        {(rules) => <RewardFields editor={editor} rules={rules} isOwner hint onSaved={onSaved} />}
      </RewardState>
    </Sheet>
  );
}
