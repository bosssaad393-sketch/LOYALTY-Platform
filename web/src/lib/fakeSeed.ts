// Invented guests for sample mode (see demo.ts): about two months of a café's loyalty programme, so every screen has
// something to show. Nobody here is a real person: first name and an initial only, no phone, no email.
// The same numbers come out every time (fixed random seed), counted back from `now`.

type Row = Record<string, unknown>;

export const sampleId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const DAY = 86_400_000;
const FIRST = ["Fatima", "Ali", "Maryam", "Hussain", "Noor", "Yousif", "Zainab", "Ahmed", "Layla", "Khalid", "Sara", "Mohammed", "Hessa", "Omar", "Dana", "Hamad", "Reem", "Jassim", "Aisha", "Salman", "Lulwa", "Nasser", "Mariam", "Faisal", "Shaikha", "Abdulla", "Huda", "Isa", "Amal", "Rashid"];
const LAST = "ABDFHJKMNRSYZ";

/** Small seeded random generator (mulberry32): the sample must be the same on every start. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How each kind of guest behaves: [how many, joined between x and y days ago, days between visits a..b, last visit at least z days ago, most visits]
const KINDS: { count: number; joined: [number, number]; gap: [number, number]; quietFor: number; maxVisits: number }[] = [
  { count: 12, joined: [70, 110], gap: [1.5, 3], quietFor: 0, maxVisits: 99 }, // regulars
  { count: 45, joined: [20, 100], gap: [6, 14], quietFor: 0, maxVisits: 99 }, // come back now and then
  { count: 30, joined: [55, 110], gap: [4, 9], quietFor: 31, maxVisits: 6 }, // came a few times, not seen for a month or more
  { count: 38, joined: [0, 20], gap: [5, 12], quietFor: 0, maxVisits: 2 }, // new
  { count: 15, joined: [1, 40], gap: [1, 1], quietFor: 0, maxVisits: 0 }, // joined, never came back to the till
];

// Thursday, Friday and Saturday are the busy days (index = getUTCDay of the Bahrain day).
const DAY_WEIGHT = [0.6, 0.55, 0.55, 0.6, 0.9, 1, 0.95];

export type SampleGuests = { members: Row[]; cards: Row[]; ledger: Row[] };

export function sampleGuests(now: number, venueId: string, rules: { pointsPerBhd: number; rewardGoal: number; staffId: string }): SampleGuests {
  const rnd = random(20261111);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const members: Row[] = [];
  const cards: Row[] = [];
  const events: { at: number; card: Row; kind: "earn" | "redeem"; points: number; bill: number | null }[] = [];
  let i = 0;

  for (const kind of KINDS) {
    for (let k = 0; k < kind.count; k++, i++) {
      const joined = now - between(kind.joined[0], kind.joined[1]) * DAY - between(0.01, 0.4) * DAY;
      const memberId = sampleId(10_000 + i);
      members.push({
        id: memberId,
        name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}.`,
        phone: null,
        email: null,
        consent_terms: new Date(joined).toISOString(),
        consent_news: rnd() < 0.72,
        deleted_at: null,
        created_at: new Date(joined).toISOString(),
      });
      const card: Row = { id: sampleId(20_000 + i), venue_id: venueId, member_id: memberId, code: String(1001 + i * 53), points: 0, visits: 0, last_visit: null, created_at: new Date(joined).toISOString() };
      cards.push(card);

      const latest = now - kind.quietFor * DAY - 20 * 60_000;
      let at = joined + 5 * 60_000; // the first visit is the one they joined on
      let balance = 0;
      for (let v = 0; v < kind.maxVisits && at <= latest; v++) {
        // Lean towards the busy days: a quiet day is often skipped for the next one.
        let when = at;
        for (let tries = 0; tries < 2 && rnd() > DAY_WEIGHT[new Date(when + 3 * 3600_000).getUTCDay()]; tries++) when += DAY;
        if (when > latest) break;
        if (balance >= rules.rewardGoal && rnd() < 0.7) {
          events.push({ at: when - 60_000, card, kind: "redeem", points: -rules.rewardGoal, bill: null });
          balance -= rules.rewardGoal;
        }
        const bill = Math.round((3 + rnd() * rnd() * 18) * 10) / 10;
        const points = Math.floor(bill * rules.pointsPerBhd);
        events.push({ at: when, card, kind: "earn", points, bill });
        balance += points;
        at = when + between(kind.gap[0], kind.gap[1]) * DAY;
      }
    }
  }

  events.sort((a, b) => a.at - b.at);
  const ledger = events.map((e, n) => {
    const c = e.card;
    c.points = Number(c.points) + e.points;
    if (e.kind === "earn") {
      c.visits = Number(c.visits) + 1;
      c.last_visit = new Date(e.at).toISOString();
    }
    return { id: n + 1, venue_id: venueId, card_id: c.id, staff_id: rules.staffId, kind: e.kind, points: e.points, bill_bhd: e.bill, created_at: new Date(e.at).toISOString() };
  });
  return { members, cards, ledger };
}
