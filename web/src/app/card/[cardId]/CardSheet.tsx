import CountUp from "@/components/CountUp";

type Ladder = { position: number; tiers: { at: number; text: string }[]; nextAt: number };

export type SheetWords = {
  point: string; points: string; stamp: string; stamps: string;
  ready: string; more: (n: number, unit: string) => string; reward: string; at: string; aria: string;
};

export const SHEET_EN: SheetWords = {
  point: "point", points: "points", stamp: "stamp", stamps: "stamps",
  ready: "Your reward is ready. Show your code to the staff.",
  more: (n, unit) => `${n} more ${unit} to your reward`,
  reward: "Your reward", at: "At", aria: "Your card",
};

export const SHEET_AR: SheetWords = {
  point: "نقطة", points: "نقاط", stamp: "ختم", stamps: "أختام",
  ready: "مكافأتك جاهزة. اعرض رمزك على الموظف.",
  more: (n, unit) => `باقي ${n} ${unit} على مكافأتك`,
  reward: "مكافأتك", at: "عند", aria: "بطاقتك",
};

/** Under the member's card: points (or stamps), how far to the reward, and the reward itself as a ticket. */
export default function CardSheet({ points, goal, rewardText, ladder, words = SHEET_EN }: { points: number; goal: number; rewardText: string; ladder?: Ladder; words?: SheetWords }) {
  const ready = points >= goal;
  const share = goal > 0 ? Math.min(100, (points / goal) * 100) : 0;
  const one = ladder ? words.stamp : words.point;
  const many = ladder ? words.stamps : words.points;
  const left = goal - points;
  return (
    <section className="cs" aria-label={words.aria}>
      <p className="cs-fig"><b><CountUp value={points} /></b><span>{points === 1 ? one : many}</span></p>
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
      <p className="cs-left">{ready ? <b>{words.ready}</b> : words.more(left, left === 1 ? one : many)}</p>
      <div className={`ticket${ready ? " ready" : ""}`}>
        <div><small>{words.reward}</small><b>{rewardText}</b></div>
        {/* On a stamp ladder the step is where it sits on the ladder (3, 6, 9), matching the dots above. */}
        <div className="ticket-end"><small>{words.at}</small><b>{ladder ? ladder.nextAt : goal}</b></div>
      </div>
    </section>
  );
}
