import CountUp from "@/components/CountUp";

type Ladder = { position: number; tiers: { at: number; text: string }[] };

/** Under the member's card: points (or stamps), how far to the reward, and the reward itself as a ticket. */
export default function CardSheet({ points, goal, rewardText, ladder }: { points: number; goal: number; rewardText: string; ladder?: Ladder }) {
  const ready = points >= goal;
  const share = goal > 0 ? Math.min(100, (points / goal) * 100) : 0;
  const unit = ladder ? (points === 1 ? "stamp" : "stamps") : points === 1 ? "point" : "points";
  return (
    <section className="cs" aria-label={ladder ? "Your stamps" : "Your points"}>
      <p className="cs-fig"><b><CountUp value={points} /></b><span>{unit}</span></p>
      {ladder ? (
        <div className="st-ladder">
          {ladder.tiers.map((t, i) => {
            const from = i === 0 ? 0 : ladder.tiers[i - 1].at;
            return (
              <div key={t.at} className={`st-step${ladder.position >= t.at ? " got" : ladder.position >= from ? " next" : ""}`}>
                <div className="st-dots">{Array.from({ length: t.at - from }, (_, k) => <i key={k} className={from + k < ladder.position ? "on" : ""} />)}</div>
                <span>{t.text}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cs-meter" aria-hidden="true">{share > 0 && <i style={{ width: `${share}%` }} />}</div>
      )}
      <p className="cs-left">{ready ? <b>Your reward is ready. Show your code to the staff.</b> : <><b>{goal - points}</b> more {ladder ? (goal - points === 1 ? "stamp" : "stamps") : ""} to your reward</>}</p>
      <div className={`ticket${ready ? " ready" : ""}`}>
        <div><small>Your reward</small><b>{rewardText}</b></div>
        <div className="ticket-end"><small>At</small><b>{goal}</b></div>
      </div>
    </section>
  );
}
