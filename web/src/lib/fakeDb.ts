import "server-only";

/**
 * Design-time stand-in for Supabase. Used only when LOYALTY_FAKE_DB=1.
 * It keeps venues, members and cards in memory (lost on restart) and understands just the
 * query shapes the app uses today. It is NOT a database: production always uses Supabase.
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

const uuid = () => crypto.randomUUID();

const store: Record<string, Row[]> = (globalThis as { __fakeDb?: Record<string, Row[]> }).__fakeDb ??= {
  venues: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "demo",
      name: "Demo Venue",
      points_per_bhd: 2,
      reward_goal: 500,
      reward_text: "Reward chosen by Demo Venue",
      active: true,
    },
  ],
  members: [],
  cards: [],
};

class Query implements PromiseLike<Result> {
  private filters: Array<[string, unknown]> = [];
  private insertRow: Row | null = null;
  private columns = "*";

  constructor(private table: string) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  insert(row: Row) {
    this.insertRow = row;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
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
    const rows = store[this.table];
    if (this.insertRow) {
      // LOYALTY_FAKE_POINTS lets a designer see a card with points on it (design only).
      const start = this.table === "cards" ? Number(process.env.LOYALTY_FAKE_POINTS ?? 0) || 0 : 0;
      const row: Row = { id: uuid(), points: start, visits: 0, created_at: new Date().toISOString(), ...this.insertRow };
      if (this.table === "cards" && rows.some((r) => r.venue_id === row.venue_id && r.code === row.code)) {
        return { data: null, error: { code: "23505", message: "duplicate code" } };
      }
      rows.push(row);
      return { data: one ? this.project(row) : [this.project(row)], error: null };
    }
    const hits = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v)).map((r) => this.project(r));
    if (one) {
      if (hits.length === 0 && mustExist) return { data: null, error: { code: "PGRST116", message: "no rows" } };
      return { data: hits[0] ?? null, error: null };
    }
    return { data: hits, error: null };
  }

  /** Copies the row and resolves the two joins the app asks for: members(...) and venues(...). */
  private project(row: Row): Row {
    const out: Row = { ...row };
    if (this.table === "cards") {
      if (this.columns.includes("members(")) out.members = store.members.find((m) => m.id === row.member_id) ?? null;
      if (this.columns.includes("venues(")) out.venues = store.venues.find((v) => v.id === row.venue_id) ?? null;
    }
    return out;
  }
}

export const fakeDb = () => ({ from: (table: string) => new Query(table) });
