import "server-only";
import { SAMPLE_OWNER_PIN, SAMPLE_STAFF_PIN } from "./demo";
import { sampleGuests } from "./fakeSeed";
import { pinLookup } from "./pinHash";

/**
 * Stand-in for Supabase in sample mode (demo.ts): LOYALTY_FAKE_DB=1 while developing, or ORBYN_DEMO=1 on a demo site.
 * It keeps invented data in memory (lost on restart) and understands just the query shapes the app uses.
 * It is NOT a database. The guests, visits, menu, tables and staff below are sample data so the screens can be seen.
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

const uuid = () => crypto.randomUUID();

const VENUE = "00000000-0000-4000-8000-000000000001";
const fakeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Sample photos are open-licence pictures, for the sample only: public/menu-photos/CREDITS.txt
const sampleCategories = [
  { n: 101, en: "Coffee and tea", ar: "قهوة وشاي" },
  { n: 102, en: "Cold drinks", ar: "مشروبات باردة" },
  { n: 103, en: "Food", ar: "طعام" },
  { n: 104, en: "Dessert", ar: "حلويات" },
];
const sampleItems: [number, number, string, string, number, string][] = [
  [201, 101, "Karak tea", "شاي كرك", 800, "karak-tea"],
  [202, 101, "Espresso", "إسبريسو", 1200, "espresso"],
  [203, 101, "Cappuccino", "كابتشينو", 1600, "cappuccino"],
  [204, 101, "Mint tea pot", "إبريق شاي بالنعناع", 2500, "mint-tea"],
  [205, 102, "Fresh lemon mint", "ليمون بالنعناع", 1800, "lemon-mint"],
  [206, 102, "Blood orange juice", "عصير البرتقال الأحمر", 2000, "blood-orange"],
  [207, 103, "Hummus", "حمص", 2200, "hummus"],
  [208, 103, "Grilled halloumi", "حلوم مشوي", 3200, "halloumi"],
  [209, 103, "Chicken fattoush", "فتوش بالدجاج", 3800, "fattoush"],
  [210, 103, "Club sandwich", "كلوب ساندويتش", 4200, "club-sandwich"],
  [211, 104, "Strawberry cheesecake", "تشيز كيك بالفراولة", 2800, "cheesecake"],
];

// Two months of invented guests and visits (fakeSeed.ts), so the owner's screens have something to show.
const guests = sampleGuests(Date.now(), VENUE, { pointsPerBhd: 2, rewardGoal: 500, staffId: fakeId(902) });

/** The sample PINs are stored hashed like real ones. Without a server secret nobody can sign in, as before. */
function samplePin(pin: string): string | null {
  try {
    return pinLookup(pin);
  } catch {
    return null;
  }
}

const store: Record<string, Row[]> = (globalThis as { __fakeDb?: Record<string, Row[]> }).__fakeDb ??= {
  venues: [
    {
      id: VENUE,
      slug: "orbyn",
      name: "Orbyn",
      points_per_bhd: 2,
      reward_goal: 500,
      reward_text: "A dessert on the house",
      active: true,
    },
  ],
  ...guests,
  staff_users: [
    { id: fakeId(900), venue_id: VENUE, name: "Saad", role: "owner", active: true, pin_lookup: samplePin(SAMPLE_OWNER_PIN) },
    { id: fakeId(901), venue_id: VENUE, name: "Saad", role: "developer", active: true },
    { id: fakeId(902), venue_id: VENUE, name: "Sample staff", role: "staff", active: true, pin_lookup: samplePin(SAMPLE_STAFF_PIN) },
  ],
  venue_tables: [1, 2, 3, 4, 5, 6].map((n) => ({ id: fakeId(n + 10), venue_id: VENUE, label: String(n), token: `orbyn-table-code-${n}`, active: true })),
  menu_categories: sampleCategories.map((c, i) => ({ id: fakeId(c.n), venue_id: VENUE, name_en: c.en, name_ar: c.ar, sort: i, active: true })),
  menu_items: sampleItems.map(([n, cat, en, ar, fils, photo], i) => ({ id: fakeId(n), venue_id: VENUE, category_id: fakeId(cat), name_en: en, name_ar: ar, note_en: null, note_ar: null, image_url: `/menu-photos/${photo}.webp`, price_fils: fils, available: true, active: true, sort: i })),
  tabs: [],
  orders: [],
  order_items: [],
  table_requests: [],
  payments: [],
  audit_log: [],
  // Sample feedback so the owner's Feedback screen is not empty in the demo. The words are examples, not real guests'.
  feedback: ([
    [5, "Sample: lovely evening, the staff remembered our usual order.", 2],
    [4, "Sample: great coffee. The corner table by the window is a little dark.", 9],
    [2, "Sample: waited twenty minutes for the bill on Friday night.", 26],
    [5, "", 50],
    [4, "Sample: the points card is easy, I showed it to my brother.", 75],
    [3, "Sample: music was loud after ten, otherwise good.", 120],
  ] as [number, string, number][]).map(([rating, message, hoursAgo], i) => ({ id: fakeId(700 + i), venue_id: VENUE, card_id: guests.cards[i % guests.cards.length]?.id, rating, message: message || null, created_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString() })),
};

const DEFAULTS: Record<string, () => Row> = {
  tabs: () => ({ status: "open", opened_at: new Date().toISOString() }),
  orders: () => ({ status: "new", source: "guest", ready_minutes: null, accepted_at: null, ready_at: null }),
  table_requests: () => ({ handled_at: null }),
  payments: () => ({ status: "initiated", currency: "BHD", charge_id: null, pay_url: null, paid_at: null, note: null }),
  venue_tables: () => ({ active: true }),
  menu_categories: () => ({ active: true }),
  menu_items: () => ({ active: true, available: true }),
};

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private insertRows: Row[] | null = null;
  private patch: Row | null = null;
  private removing = false;
  private columns = "*";
  private sort: { col: string; asc: boolean } | null = null;
  private window: [number, number] | null = null;
  private max: number | null = null;

  constructor(private table: string) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  delete() {
    this.removing = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  gt(column: string, value: number) {
    this.filters.push((r) => Number(r[column]) > value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) >= value);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.sort = { col, asc: o?.ascending !== false };
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    return this.run(true, true);
  }
  maybeSingle() {
    return this.run(true, false);
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run(false, false).then(ok, bad);
  }

  private async run(one: boolean, mustExist: boolean): Promise<Result> {
    const rows = (store[this.table] ??= []);
    if (this.insertRows) {
      // LOYALTY_FAKE_POINTS lets a designer see a card with points on it (design only).
      const start = this.table === "cards" ? Number(process.env.LOYALTY_FAKE_POINTS ?? 0) || 0 : 0;
      const added: Row[] = [];
      for (const input of this.insertRows) {
        const row: Row = { id: uuid(), points: start, visits: 0, created_at: new Date().toISOString(), ...DEFAULTS[this.table]?.(), ...input };
        if (this.table === "cards" && rows.some((r) => r.venue_id === row.venue_id && r.code === row.code)) {
          return { data: null, error: { code: "23505", message: "duplicate code" } };
        }
        if (this.table === "venue_tables" && rows.some((r) => r.venue_id === row.venue_id && r.label === row.label)) {
          return { data: null, error: { code: "23505", message: "duplicate label" } };
        }
        rows.push(row);
        added.push(row);
      }
      return { data: one ? this.project(added[0]) : added.map((r) => this.project(r)), error: null };
    }
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) {
      for (const r of matched) Object.assign(r, this.patch);
      return { data: matched.map((r) => this.project(r)), error: null };
    }
    if (this.removing) {
      store[this.table] = rows.filter((r) => !matched.includes(r));
      return { data: null, error: null };
    }
    let hits = matched.map((r) => this.project(r));
    if (this.sort) {
      const { col, asc } = this.sort;
      const value = (r: Row) => r[col];
      hits = hits.sort((a, b) => {
        const x = value(a), y = value(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return asc ? c : -c;
      });
    }
    if (this.window) hits = hits.slice(this.window[0], this.window[1] + 1);
    if (this.max !== null) hits = hits.slice(0, this.max);
    if (one) {
      if (hits.length === 0 && mustExist) return { data: null, error: { code: "PGRST116", message: "no rows" } };
      return { data: hits[0] ?? null, error: null };
    }
    return { data: hits, error: null };
  }

  /** Copies the row and resolves the joins the app asks for: members(...) and venues(...). */
  private project(row: Row): Row {
    const out: Row = { ...row };
    if (this.columns.includes("venues(")) out.venues = store.venues.find((v) => v.id === row.venue_id) ?? null;
    if (this.table === "cards" && this.columns.includes("members(")) out.members = store.members.find((m) => m.id === row.member_id) ?? null;
    return out;
  }
}

/** The three point actions staff use, so the staff screens can be seen working. The real rules live in the database (0002_ledger.sql). */
function fakeRpc(fn: string, args: Record<string, unknown>): Result {
  const ledger = (store.ledger ??= []);
  const entry = (card: Row, kind: string, points: number, bill: unknown = null) => {
    card.points = Number(card.points ?? 0) + points;
    if (kind === "earn") card.last_visit = new Date().toISOString();
    const row = { id: ledger.length + 1, venue_id: card.venue_id, card_id: card.id, staff_id: args.p_staff, kind, points, bill_bhd: bill, created_at: new Date().toISOString() };
    ledger.push(row);
    return row;
  };
  const cardOf = (id: unknown) => store.cards.find((c) => c.id === id);
  if (fn === "ledger_earn") {
    const card = cardOf(args.p_card);
    const venue = store.venues.find((v) => v.id === card?.venue_id);
    if (!card || !venue) return { data: null, error: { code: "P0001", message: "card not found" } };
    card.visits = Number(card.visits ?? 0) + 1;
    const added = Math.floor(Number(args.p_bill) * Number(venue.points_per_bhd));
    return { data: [{ ledger_id: entry(card, "earn", added, args.p_bill).id, points_added: added, new_balance: card.points }], error: null };
  }
  if (fn === "ledger_redeem" || fn === "ledger_redeem_guest") {
    const card = cardOf(args.p_card);
    const venue = store.venues.find((v) => v.id === card?.venue_id);
    if (card && venue && Number(card.points) < Number(venue.reward_goal)) return { data: null, error: { code: "P0001", message: "not enough points to redeem" } };
    if (!card || !venue) return { data: null, error: { code: "P0001", message: "card not found" } };
    return { data: [{ ledger_id: entry(card, "redeem", -Number(venue.reward_goal)).id, new_balance: card.points }], error: null };
  }
  if (fn === "ledger_pos_sale") {
    const venue = store.venues.find((v) => v.id === args.p_venue);
    const card = store.cards.find((c) => c.venue_id === args.p_venue && c.code === args.p_code);
    if (!venue || !card) return { data: null, error: { code: "P0001", message: "card not found" } };
    const old = ledger.find((l) => l.venue_id === args.p_venue && l.external_ref === args.p_receipt && l.kind === "earn");
    if (old) return { data: [{ ledger_id: old.id, points_added: 0, new_balance: card.points, duplicate: true }], error: null };
    const added = Math.floor(Number(args.p_bill) * Number(venue.points_per_bhd));
    if (added < 1) return { data: null, error: { code: "P0001", message: "bill is too small to earn points" } };
    card.visits = Number(card.visits ?? 0) + 1;
    const row = entry(card, "earn", added, args.p_bill);
    (row as Record<string, unknown>).external_ref = args.p_receipt;
    return { data: [{ ledger_id: row.id, points_added: added, new_balance: card.points, duplicate: false }], error: null };
  }
  if (fn === "ledger_undo") {
    const was = ledger.find((l) => l.id === args.p_entry);
    const card = cardOf(was?.card_id);
    if (!was || !card) return { data: null, error: { code: "P0001", message: "entry not found" } };
    // Linked to the entry it cancels, like the real ledger, so undone visits drop out of the owner's numbers.
    const undo = entry(card, "undo", -Number(was.points)) as Record<string, unknown>;
    undo.undoes = was.id;
    return { data: [{ ledger_id: undo.id, new_balance: card.points }], error: null };
  }
  // Sample data never limits anyone (migration 0014 does the real counting).
  if (fn === "rate_hit") return { data: true, error: null };
  // Migration 0015's owner_summary, counted the same way over the sample data.
  if (fn === "owner_summary") {
    const venue = args.p_venue;
    const today = new Date(String(args.p_today)).getTime();
    const DAY = 86_400_000;
    const cards = store.cards.filter((c) => c.venue_id === venue);
    const undone = new Set(ledger.filter((l) => l.kind === "undo").map((l) => (l as Record<string, unknown>).undoes));
    const live = ledger.filter((l) => l.venue_id === venue && (l.kind === "earn" || l.kind === "redeem") && !undone.has(l.id) && new Date(String(l.created_at)).getTime() >= today - 29 * DAY);
    const t = (l: Row) => new Date(String(l.created_at)).getTime();
    const visits = live.filter((l) => l.kind === "earn");
    return {
      data: {
        members: cards.length,
        newThisWeek: cards.filter((c) => new Date(String(c.created_at)).getTime() >= today - 6 * DAY).length,
        pointsHeld: cards.reduce((s, c) => s + Number(c.points ?? 0), 0),
        visits7d: visits.filter((l) => t(l) >= today - 6 * DAY).length,
        visitsPrev7d: visits.filter((l) => t(l) >= today - 13 * DAY && t(l) < today - 6 * DAY).length,
        rewards30d: live.filter((l) => l.kind === "redeem").length,
        perDay14: Array.from({ length: 14 }, (_, i) => {
          const start = today - (13 - i) * DAY;
          return { day: new Date(start + 3 * 3600_000).toISOString().slice(0, 10), visits: visits.filter((l) => t(l) >= start && t(l) < start + DAY).length };
        }),
      },
      error: null,
    };
  }
  return { data: null, error: { code: "P0001", message: `${fn} is not part of the sample data` } };
}

export const fakeDb = () => ({ from: (table: string) => new Query(table), rpc: async (fn: string, args: Record<string, unknown>) => fakeRpc(fn, args) });
