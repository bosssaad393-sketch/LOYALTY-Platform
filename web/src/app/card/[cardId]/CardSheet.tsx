import CountUp from "@/components/CountUp";

/** Under the member's card: points, how far to the reward, and the reward itself as a ticket. */
export default function CardSheet({ points, goal, rewardText }: { points: number; goal: number; rewardText: string }) {
  const ready = points >= goal;
  const share = goal > 0 ? Math.min(100, (points / goal) * 100) : 0;
  return (
    <section className="cs" aria-label="Your points">
      <p className="cs-fig"><b><CountUp value={points} /></b><span>{points === 1 ? "point" : "points"}</span></p>
      <div className="cs-meter" aria-hidden="true">{share > 0 && <i style={{ width: `${share}%` }} />}</div>
      <p className="cs-left">{ready ? <b>Your reward is ready. Show your code to the staff.</b> : <><b>{goal - points}</b> more to your reward</>}</p>
      <div className={`ticket${ready ? " ready" : ""}`}>
        <div><small>Your reward</small><b>{rewardText}</b></div>
        <div className="ticket-end"><small>At</small><b>{goal}</b></div>
      </div>
    </section>
  );
}
