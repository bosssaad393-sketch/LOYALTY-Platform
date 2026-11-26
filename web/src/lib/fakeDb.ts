import "server-only";
import { SAMPLE_OWNER_PIN, SAMPLE_PARTNER_PIN, SAMPLE_STAFF_PIN } from "./demo";
import { sampleGuests } from "./fakeSeed";
import { pinLookup } from "./pinHash";

/**
 * Stand-in for Supabase in sample mode (demo.ts): LOYALTY_FAKE_DB=1 while developing, or ORBYN_DEMO=1 on a demo site.
 * It keeps invented data in memory (lost on restart) and understands just the query shapes the app uses.
 * It is NOT a database. The guests, visits, menu, tables and staff below are sample data so the screens can be seen.
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

import roshinahMenu from "@/data/menus/roshinah.json";

const uuid = () => crypto.randomUUID();

const VENUE = "00000000-0000-4000-8000-000000000001";
const fakeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * SAMPLE_MENU=<venue>: the sample shows that venue's own menu (src/data/menus/<venue>.json, copied from the venue's
 * public menu, pictures in public/venues/<venue>/menu) instead of the invented one below.
 */
type OwnMenu = { categories: { en: string; ar: string | null; items: { en: string; ar: string | null; noteEn: string | null; noteAr: string | null; fils: number; photo: string | null }[] }[] };
const OWN_MENUS: Record<string, OwnMenu> = { roshinah: roshinahMenu };
const OWN_MENU_NAME = (process.env.SAMPLE_MENU ?? "").trim().toLowerCase();
const OWN_MENU: OwnMenu | null = OWN_MENUS[OWN_MENU_NAME] ?? null;

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

/**
 * A visit-card sample (migration 0022) instead of the points sample: set BRAND_DEFAULT_VENUE to a slug other than
 * "orbyn" together with SAMPLE_CARD_MODE=visits. One business, two branches and a partner counter, one first-visit
 * voucher. Everything here is invented sample data: the branch names come from SAMPLE_BRANCHES ("Sanad,Zallaq").
 */
const VISITS = process.env.SAMPLE_CARD_MODE === "visits";
const SAMPLE_SLUG = (VISITS && /^[a-z0-9-]+$/.test(process.env.BRAND_DEFAULT_VENUE ?? "") ? process.env.BRAND_DEFAULT_VENUE! : "orbyn");
const BRANCH_NAMES = (process.env.SAMPLE_BRANCHES ?? "Main branch,Second branch").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
const PARTNER_NAME = process.env.SAMPLE_PARTNER ?? "Sister restaurant";
const PARTNER = fakeId(590);
const VOUCHER = fakeId(600);
const sampleBranches: Row[] = VISITS
  ? [
      // The first branch can carry the venue's own public details (SAMPLE_MENU_URL, SAMPLE_PHONE, SAMPLE_MAPS_URL,
      // SAMPLE_ADDRESS), so the guest hub of a hosted sample shows working buttons. Unset = no such button.
      ...BRANCH_NAMES.map((name, i) => ({ id: fakeId(500 + i), venue_id: VENUE, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, name_ar: null, kind: "branch", address: (i === 0 && process.env.SAMPLE_ADDRESS) || null, phone: (i === 0 && process.env.SAMPLE_PHONE) || null, maps_url: (i === 0 && process.env.SAMPLE_MAPS_URL) || null, review_url: null, menu_url: (i === 0 && process.env.SAMPLE_MENU_URL) || null, lat: null, lng: null, wide_reach: false, sort: i, active: true })),
      { id: PARTNER, venue_id: VENUE, slug: "partner", name: PARTNER_NAME, name_ar: null, kind: "partner", address: null, phone: null, maps_url: null, review_url: null, menu_url: null, lat: null, lng: null, sort: 9, active: true },
    ]
  : [];
if (VISITS) {
  // A visit card has no points: the sample guests keep their visits and dates only, spread over the branches.
  for (const c of guests.cards) c.points = 0;
  guests.ledger = guests.ledger.filter((l) => l.kind === "earn").map((l, i) => ({ ...l, points: 0, bill_bhd: null, note: "visit", branch_id: fakeId(500 + (i % BRANCH_NAMES.length)) }));
  guests.members.forEach((m, i) => { if (i % 3 === 0) { m.birth_day = 1 + (i % 28); m.birth_month = 1 + (i % 12); } });
}

/**
 * Sample bills for the owner's "Orders" view: the regulars each get a few invented bills made of dishes from the
 * sample's own menu. Fixed arithmetic instead of chance, so the sample reads the same on every start.
 */
function sampleReceipts(): { receipts: Row[]; receipt_items: Row[] } {
  const menu: { name: string; fils: number }[] = OWN_MENU
    ? OWN_MENU.categories.flatMap((c) => c.items.map((it) => ({ name: it.en, fils: it.fils })))
    : sampleItems.map(([, , en, , fils]) => ({ name: en, fils }));
  const receipts: Row[] = [];
  const receipt_items: Row[] = [];
  if (!menu.length) return { receipts, receipt_items };
  guests.cards.filter((c) => Number(c.visits) > 0).forEach((c, g) => {
    // The newest bill is the guest's last visit; the older ones step back about nine days each.
    const last = c.last_visit ? new Date(String(c.last_visit)).getTime() : Date.now() - 86_400_000;
    const bills = Math.min(Number(c.visits), 1 + (g % 4));
    for (let b = 0; b < bills; b++) {
      const id = receipts.length + 1;
      const lines = 2 + ((g + b) % 3);
      let total = 0;
      for (let l = 0; l < lines; l++) {
        // A regular comes back to the same first dish; the rest of the bill moves around the menu.
        const dish = menu[(l === 0 ? g * 7 : g * 7 + b * 13 + l * 5) % menu.length];
        const qty = 1 + ((g + l) % 2);
        total += dish.fils * qty;
        receipt_items.push({ id: receipt_items.length + 1, receipt_id: id, venue_id: VENUE, name: dish.name, qty, price_fils: dish.fils });
      }
      receipts.push({ id, venue_id: VENUE, card_id: c.id, branch_id: VISITS ? fakeId(500 + (g % BRANCH_NAMES.length)) : null, receipt: `SAMPLE-${1000 + id}`, total_fils: total, refunded_at: null, created_at: new Date(last - b * 9 * 86_400_000 - b * (g % 5) * 3_600_000).toISOString() });
    }
  });
  return { receipts, receipt_items };
}

const store: Record<string, Row[]> = (globalThis as { __fakeDb?: Record<string, Row[]> }).__fakeDb ??= {
  venues: [
    {
      id: VENUE,
      slug: SAMPLE_SLUG,
      name: VISITS ? (process.env.BRAND_NAME ?? "Sample venue") : "Orbyn",
      points_per_bhd: 2,
      reward_goal: 500,
      reward_text: "A dessert on the house",
      instagram_url: VISITS ? process.env.SAMPLE_INSTAGRAM_URL ?? null : "https://www.instagram.com/calabos04",
      card_mode: VISITS ? "visits" : null,
      join_fields: VISITS ? ["mobile", "email", "birthday"] : null,
      visit_gap_minutes: 180,
      visit_cap_per_staff: 250,
      active: true,
    },
  ],
  ...guests,
  staff_users: [
    { id: fakeId(900), venue_id: VENUE, name: "Saad", role: "owner", active: true, branch_id: null, pin_lookup: samplePin(SAMPLE_OWNER_PIN) },
    { id: fakeId(901), venue_id: VENUE, name: "Saad", role: "developer", active: true, branch_id: null },
    { id: fakeId(902), venue_id: VENUE, name: "Sample staff", role: "staff", active: true, branch_id: VISITS ? fakeId(500) : null, pin_lookup: samplePin(SAMPLE_STAFF_PIN) },
    ...(VISITS ? [{ id: fakeId(903), venue_id: VENUE, name: `${PARTNER_NAME} till`, role: "staff", active: true, branch_id: PARTNER, pin_lookup: samplePin(SAMPLE_PARTNER_PIN) }] : []),
  ],
  branches: sampleBranches,
  vouchers: VISITS
    ? [{ id: VOUCHER, venue_id: VENUE, title: `50% off at ${PARTNER_NAME}`, title_ar: null, detail: "A thank-you for joining. One visit, one bill.", detail_ar: null, trigger: "first_visit", redeem_branch_id: PARTNER, valid_days: 60, active: true, created_at: new Date(0).toISOString() }]
    : [],
  // Sample: the regulars already had their first-visit voucher; a third of them used it.
  card_vouchers: VISITS
    ? guests.cards.filter((c) => Number(c.visits) > 0).map((c, i) => {
        const issued = new Date(Date.now() - (5 + (i % 40)) * 86_400_000).toISOString();
        const used = i % 3 === 0;
        return { id: fakeId(30_000 + i), card_id: c.id, venue_id: VENUE, voucher_id: VOUCHER, status: used ? "redeemed" : "issued", issued_at: issued, issued_by: fakeId(902), issued_branch: fakeId(500), expires_at: new Date(Date.parse(issued) + 60 * 86_400_000).toISOString(), redeemed_at: used ? new Date(Date.parse(issued) + 4 * 86_400_000).toISOString() : null, redeemed_by: used ? fakeId(903) : null, redeemed_branch: used ? PARTNER : null, voided_at: null, voided_by: null };
      })
    : [],
  auto_messages: [],
  message_log: [],
  ...sampleReceipts(),
  venue_tables: [1, 2, 3, 4, 5, 6].map((n) => ({ id: fakeId(n + 10), venue_id: VENUE, label: String(n), token: `orbyn-table-code-${n}`, active: true })),
  menu_categories: OWN_MENU
    ? OWN_MENU.categories.map((c, i) => ({ id: fakeId(40_000 + i), venue_id: VENUE, name_en: c.en, name_ar: c.ar, sort: i, active: true }))
    : sampleCategories.map((c, i) => ({ id: fakeId(c.n), venue_id: VENUE, name_en: c.en, name_ar: c.ar, sort: i, active: true })),
  menu_items: OWN_MENU
    ? OWN_MENU.categories.flatMap((c, ci) => c.items.map((it, i) => ({ id: fakeId(41_000 + ci * 100 + i), venue_id: VENUE, category_id: fakeId(40_000 + ci), name_en: it.en, name_ar: it.ar, note_en: it.noteEn, note_ar: it.noteAr, image_url: it.photo ? `/venues/${OWN_MENU_NAME}/menu/${it.photo}.webp` : null, price_fils: it.fils, available: true, active: true, sort: i })))
    : sampleItems.map(([n, cat, en, ar, fils, photo], i) => ({ id: fakeId(n), venue_id: VENUE, category_id: fakeId(cat), name_en: en, name_ar: ar, note_en: null, note_ar: null, image_url: `/menu-photos/${photo}.webp`, price_fils: fils, available: true, active: true, sort: i })),
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
    [4, "Sample: the card is easy, I showed it to my brother.", 75],
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
  private sorts: { col: string; asc: boolean }[] = [];
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
  lt(column: string, value: string) {
    this.filters.push((r) => r[column] !== null && r[column] !== undefined && String(r[column]) < value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) >= value);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.sorts.push({ col, asc: o?.ascending !== false });
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
    if (this.sorts.length) {
      // ORDER BY a, b: the first .order() decides, the next ones break ties.
      const by = ({ col, asc }: { col: string; asc: boolean }, a: Row, b: Row) => {
        const x = a[col], y = b[col];
        // Like the app's real queries (nullsFirst: false): rows with no value go last, whichever way the sort runs.
        const xn = x === null || x === undefined, yn = y === null || y === undefined;
        if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return asc ? c : -c;
      };
      hits = hits.sort((a, b) => { for (const s of this.sorts) { const c = by(s, a, b); if (c) return c; } return 0; });
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
    // The till's "Recent" list: who served and which guest.
    if (this.table === "ledger" && this.columns.includes("staff_users(")) out.staff_users = store.staff_users.find((s) => s.id === row.staff_id) ?? null;
    if (this.table === "ledger" && this.columns.includes("cards(members(")) {
      const card = store.cards.find((c) => c.id === row.card_id);
      out.cards = card ? { members: store.members.find((m) => m.id === card.member_id) ?? null } : null;
    }
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
  // Migration 0022, the same rules as the database functions (which are the ones tested in tests/visitsVouchers.test.ts).
  const bad = (message: string): Result => ({ data: null, error: { code: "P0001", message } });
  const staffOf = (id: unknown) => store.staff_users.find((s) => s.id === id && s.active);
  const audit = (venue: unknown, action: string, detail: Row) => (store.audit_log ??= []).push({ id: uuid(), venue_id: venue, actor: args.p_staff, action, detail, branch_id: args.p_branch ?? null, created_at: new Date().toISOString() });
  if (fn === "ledger_visit") {
    const card = cardOf(args.p_card);
    const venue = store.venues.find((v) => v.id === card?.venue_id);
    const staff = staffOf(args.p_staff);
    if (!card || !venue) return bad("card not found");
    if (!staff || staff.venue_id !== card.venue_id) return bad("staff member is not allowed at this venue");
    if (venue.card_mode !== "visits") return bad("this venue does not use visit cards");
    const places = (store.branches ??= []).filter((b) => b.venue_id === card.venue_id && b.active);
    const branch = places.find((b) => b.id === args.p_branch);
    if (args.p_branch && !branch) return bad("branch not found");
    if (branch && branch.kind !== "branch") return bad("visits cannot be recorded at this counter");
    if (!args.p_branch && places.some((b) => b.kind === "branch")) return bad("choose a branch first");
    if (staff.branch_id && staff.branch_id !== args.p_branch) return bad("staff member is not allowed at this branch");
    const undone = new Set(ledger.filter((l) => l.kind === "undo").map((l) => l.undoes));
    const mine = ledger.filter((l) => l.card_id === card.id && l.kind === "earn" && !undone.has(l.id));
    const gap = Number(venue.visit_gap_minutes ?? 180) * 60_000;
    if (mine.some((l) => Date.now() - new Date(String(l.created_at)).getTime() < gap)) return bad("visit already recorded");
    const today = ledger.filter((l) => l.staff_id === args.p_staff && l.note === "visit" && Date.now() - new Date(String(l.created_at)).getTime() < 86_400_000).length;
    if (today >= Number(venue.visit_cap_per_staff ?? 250)) return bad("daily scan limit reached");
    const first = !mine.some((l) => l.note === "visit");
    card.visits = Number(card.visits ?? 0) + 1;
    const row = entry(card, "earn", 0) as Row;
    row.note = "visit";
    row.branch_id = args.p_branch ?? null;
    let issued = 0;
    const held = (store.card_vouchers ??= []);
    for (const v of (store.vouchers ??= []).filter((x) => x.venue_id === card.venue_id && x.active && (x.trigger === "every_visit" || (x.trigger === "first_visit" && first)))) {
      if (held.some((h) => h.card_id === card.id && h.voucher_id === v.id)) continue;
      held.push({ id: uuid(), card_id: card.id, venue_id: card.venue_id, voucher_id: v.id, status: "issued", issued_at: new Date().toISOString(), issued_by: args.p_staff, issued_branch: args.p_branch ?? null, expires_at: v.valid_days ? new Date(Date.now() + Number(v.valid_days) * 86_400_000).toISOString() : null, redeemed_at: null, redeemed_by: null, redeemed_branch: null, voided_at: null, voided_by: null });
      issued++;
    }
    audit(card.venue_id, "visit", { card: card.id, ledger: row.id, vouchers_issued: issued });
    return { data: [{ ledger_id: row.id, visits: card.visits, vouchers_issued: issued }], error: null };
  }
  if (fn === "pos_receipt") {
    const venue = store.venues.find((v) => v.id === args.p_venue);
    if (!venue || !venue.active) return bad("venue is not active");
    const kept = (store.receipts ??= []);
    const old = kept.find((r) => r.venue_id === args.p_venue && r.receipt === args.p_receipt);
    if (old) return { data: [{ receipt_id: old.id, guest_card: old.card_id, duplicate: true, visit_counted: false, visits: cardOf(old.card_id)?.visits ?? 0, vouchers_issued: 0 }], error: null };
    const card = store.cards.find((c) => c.venue_id === args.p_venue && c.code === args.p_code);
    if (!card) return bad("card not found");
    const bill = Number(args.p_bill);
    if (!(bill > 0 && bill <= 5000)) return bad("invalid bill amount");
    const places = (store.branches ??= []).filter((b) => b.venue_id === args.p_venue && b.active);
    const own = places.filter((b) => b.kind === "branch");
    const branch = args.p_branch ? places.find((b) => b.slug === String(args.p_branch).trim().toLowerCase()) : own.length === 1 ? own[0] : undefined;
    if (args.p_branch && !branch) return bad("branch not found");
    const id = kept.length + 1;
    kept.push({ id, venue_id: args.p_venue, card_id: card.id, branch_id: branch?.id ?? null, receipt: args.p_receipt, total_fils: Math.round(bill * 1000), refunded_at: null, created_at: new Date().toISOString() });
    const lines = (store.receipt_items ??= []);
    for (const it of (Array.isArray(args.p_items) ? args.p_items : []) as { name?: string; qty?: number; priceBhd?: number }[]) {
      if (!it.name?.trim()) continue;
      lines.push({ id: lines.length + 1, receipt_id: id, venue_id: args.p_venue, name: it.name.trim().slice(0, 120), qty: it.qty ?? 1, price_fils: it.priceBhd === undefined ? null : Math.round(it.priceBhd * 1000) });
    }
    let counted = false, issued = 0;
    const undone = new Set(ledger.filter((l) => l.kind === "undo").map((l) => l.undoes));
    const mine = ledger.filter((l) => l.card_id === card.id && l.kind === "earn" && !undone.has(l.id));
    const gap = Number(venue.visit_gap_minutes ?? 180) * 60_000;
    if (venue.card_mode === "visits" && branch?.kind === "branch" && !mine.some((l) => Date.now() - new Date(String(l.created_at)).getTime() < gap)) {
      const first = !mine.some((l) => l.note === "visit");
      card.visits = Number(card.visits ?? 0) + 1;
      const row = entry(card, "earn", 0) as Row;
      Object.assign(row, { note: "visit", branch_id: branch.id, staff_id: null, source: "pos", external_ref: args.p_receipt });
      counted = true;
      const held = (store.card_vouchers ??= []);
      for (const v of (store.vouchers ??= []).filter((x) => x.venue_id === card.venue_id && x.active && (x.trigger === "every_visit" || (x.trigger === "first_visit" && first)))) {
        if (held.some((h) => h.card_id === card.id && h.voucher_id === v.id)) continue;
        held.push({ id: uuid(), card_id: card.id, venue_id: card.venue_id, voucher_id: v.id, status: "issued", issued_at: new Date().toISOString(), issued_by: null, issued_branch: branch.id, expires_at: v.valid_days ? new Date(Date.now() + Number(v.valid_days) * 86_400_000).toISOString() : null, redeemed_at: null, redeemed_by: null, redeemed_branch: null, voided_at: null, voided_by: null });
        issued++;
      }
      (store.audit_log ??= []).push({ id: uuid(), venue_id: card.venue_id, actor: "pos", action: "visit", detail: { card: card.id, ledger: row.id, vouchers_issued: issued, receipt: args.p_receipt }, branch_id: branch.id, created_at: new Date().toISOString() });
    }
    return { data: [{ receipt_id: id, guest_card: card.id, duplicate: false, visit_counted: counted, visits: card.visits, vouchers_issued: issued }], error: null };
  }
  if (fn === "pos_receipt_refund") {
    const old = (store.receipts ??= []).find((r) => r.venue_id === args.p_venue && r.receipt === args.p_receipt);
    if (!old) return bad("receipt not found");
    if (old.refunded_at) return { data: [{ receipt_id: old.id, guest_card: old.card_id, duplicate: true }], error: null };
    old.refunded_at = new Date().toISOString();
    return { data: [{ receipt_id: old.id, guest_card: old.card_id, duplicate: false }], error: null };
  }
  if (fn === "voucher_redeem" || fn === "voucher_void") {
    const cv = (store.card_vouchers ??= []).find((h) => h.id === args.p_card_voucher);
    const staff = staffOf(args.p_staff);
    if (!cv) return bad("voucher not found");
    if (!staff || staff.venue_id !== cv.venue_id) return bad("staff member is not allowed at this venue");
    if (fn === "voucher_void") {
      if (staff.role !== "owner" && staff.role !== "manager") return bad("only the owner or a manager can cancel a voucher");
      if (cv.status !== "issued") return bad("voucher is not valid");
      Object.assign(cv, { status: "void", voided_at: new Date().toISOString(), voided_by: args.p_staff });
      audit(cv.venue_id, "voucher_void", { card: cv.card_id, card_voucher: cv.id });
      return { data: [{ card_voucher_id: cv.id }], error: null };
    }
    const def = (store.vouchers ??= []).find((v) => v.id === cv.voucher_id);
    if (args.p_branch && !(store.branches ??= []).some((b) => b.id === args.p_branch && b.venue_id === cv.venue_id && b.active)) return bad("branch not found");
    if (staff.branch_id && staff.branch_id !== args.p_branch) return bad("staff member is not allowed at this branch");
    if (cv.status === "redeemed") return bad("voucher already used");
    if (cv.status !== "issued") return bad("voucher is not valid");
    if (cv.expires_at && new Date(String(cv.expires_at)).getTime() < Date.now()) return bad("voucher has expired");
    if (def?.redeem_branch_id && def.redeem_branch_id !== args.p_branch) return bad("voucher cannot be used at this branch");
    const now = new Date().toISOString();
    Object.assign(cv, { status: "redeemed", redeemed_at: now, redeemed_by: args.p_staff, redeemed_branch: args.p_branch ?? null });
    audit(cv.venue_id, "voucher_redeem", { card: cv.card_id, card_voucher: cv.id, voucher: cv.voucher_id });
    return { data: [{ card_voucher_id: cv.id, redeemed_at: now }], error: null };
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

/**
 * A hosted sample runs as several server processes (on Vercel the pages are one, the API routes another), and each
 * keeps its own copy of this in-memory data. A guest who joins through the API would be unknown to the card page.
 * These two functions carry ONE card across: the API process gives its rows for a card, the page process takes them in.
 * Sample mode only (see lib/sampleSync.ts); a real deployment has a real database and never calls them.
 */
export type SampleCardRows = { card: Row; member: Row | null; card_vouchers: Row[]; ledger: Row[] };

export function sampleCardRows(cardId: string): SampleCardRows | null {
  const card = (store.cards ?? []).find((c) => c.id === cardId);
  if (!card) return null;
  return {
    card,
    member: (store.members ?? []).find((m) => m.id === card.member_id) ?? null,
    card_vouchers: (store.card_vouchers ?? []).filter((v) => v.card_id === cardId),
    ledger: (store.ledger ?? []).filter((l) => l.card_id === cardId).slice(-20),
  };
}

export function sampleTakeCard(rows: SampleCardRows): void {
  const put = (table: string, row: Row | null) => {
    if (!row || typeof row.id === "undefined") return;
    const list = (store[table] ??= []);
    const i = list.findIndex((r) => r.id === row.id);
    if (i >= 0) list[i] = { ...list[i], ...row };
    else list.push({ ...row });
  };
  put("members", rows.member);
  put("cards", rows.card);
  for (const v of rows.card_vouchers ?? []) put("card_vouchers", v);
}
