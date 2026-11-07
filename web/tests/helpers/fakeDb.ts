// A tiny in-memory stand-in for the Supabase client, just enough for the offer code.
// No network, no real database. It understands the calls the offer code makes (select, insert, update, delete and the
// filters eq / is / not-is / in / gte / order / limit / range / maybeSingle / single) and the one embedded relation
// `cards -> members`. It does NOT check column names or types: it only helps to test the logic around the calls.

export type Row = Record<string, unknown>;
export type Call = { table: string; op: string; filters: string[]; payload?: unknown };
/** `failing` = tables whose every call answers with a database error (to test "best effort" code paths). */
export type FakeState = { tables: Record<string, Row[]>; calls: Call[]; failing: Set<string> };

export const newState = (tables: Record<string, Row[]> = {}): FakeState => ({ tables, calls: [], failing: new Set() });

const RELATIONS: Record<string, Record<string, { table: string; fk: string }>> = {
  cards: { members: { table: "members", fk: "member_id" }, venues: { table: "venues", fk: "venue_id" } },
  staff_users: { venues: { table: "venues", fk: "venue_id" } },
};

let seq = 0;

export function makeDb(state: FakeState) {
  return {
    // Just enough of the auth admin API for code that only lists logins (no real accounts are made).
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] as { id: string; email: string }[] }, error: null }),
        getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@login.example.test` } }, error: null }),
      },
    },
    /** rate_hit (migration 0014): counts hits per bucket inside the window, like the database function. */
    async rpc(fn: string, args: Record<string, unknown>) {
      if (state.failing.has(`rpc:${fn}`)) return { data: null, error: { message: `${fn} failed (test)` } };
      if (fn === "rate_hit") {
        const hits = (state.tables.rate_hits ??= []);
        const since = Date.now() - Number(args.p_window_seconds) * 1000;
        const recent = hits.filter((h) => h.bucket === args.p_bucket && Number(h.at) > since).length;
        if (recent >= Number(args.p_limit)) return { data: false, error: null };
        hits.push({ bucket: args.p_bucket, at: Date.now() });
        return { data: true, error: null };
      }
      return { data: null, error: { message: `${fn} is not in the test stand-in` } };
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const described: string[] = [];
      let op: "select" | "insert" | "update" | "delete" = "select";
      let payload: unknown;
      let columns = "*";
      let sort: { col: string; asc: boolean } | undefined;
      let max: number | undefined;
      let range: [number, number] | undefined;
      let one: "maybe" | "one" | undefined;
      let returning = false;

      function run(): { data: unknown; error: { message: string } | null } {
        state.calls.push({ table, op, filters: described.slice(), payload });
        if (state.failing.has(table)) return { data: null, error: { message: `fake database failure on ${table}` } };
        const rows = (state.tables[table] ??= []);
        const hit = () => rows.filter((r) => filters.every((f) => f(r)));

        const shape = (list: Row[]): unknown => {
          let out = list.map((r) => {
            const copy: Row = { ...r };
            for (const [name, rel] of Object.entries(RELATIONS[table] ?? {})) {
              if (columns.includes(`${name}(`)) copy[name] = (state.tables[rel.table] ?? []).find((m) => m.id === r[rel.fk]) ?? null;
            }
            return copy;
          });
          if (sort) {
            const { col, asc } = sort;
            out = out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
          }
          if (range) out = out.slice(range[0], range[1] + 1);
          if (max !== undefined) out = out.slice(0, max);
          if (one === "maybe") return out[0] ?? null;
          if (one === "one") return out[0] ?? null;
          return out;
        };

        if (op === "select") return { data: shape(hit()), error: null };
        if (op === "insert") {
          // Like the real table, a new offer gets its send time from the clock and starts not withdrawn.
          // Orders and log lines get their time from the clock too, as they do in the database.
          const defaults: Row = table === "offers" ? { sent_at: new Date().toISOString(), withdrawn_at: null }
            : table === "orders" ? { status: "new", created_at: new Date().toISOString() }
            : table === "audit_log" ? { created_at: new Date().toISOString() } : {};
          // Ids look like the database's UUIDs (routes check for that); the last part counts up so tests can still read them.
          const added = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `ffffffff-0000-4000-8000-${String(++seq).padStart(12, "0")}`, ...defaults, ...(p as Row) }));
          rows.push(...added);
          return { data: returning ? shape(added) : null, error: null };
        }
        if (op === "update") {
          const matched = hit();
          for (const r of matched) Object.assign(r, payload);
          return { data: returning ? shape(matched) : null, error: null };
        }
        const gone = new Set(hit());
        state.tables[table] = rows.filter((r) => !gone.has(r));
        return { data: null, error: null };
      }

      const b = {
        select(c = "*") {
          columns = c;
          if (op !== "select") returning = true;
          return b;
        },
        insert(rows: unknown) {
          op = "insert";
          payload = rows;
          return b;
        },
        update(patch: Row) {
          op = "update";
          payload = patch;
          return b;
        },
        delete() {
          op = "delete";
          return b;
        },
        eq(c: string, v: unknown) {
          filters.push((r) => r[c] === v);
          described.push(`eq ${c}`);
          return b;
        },
        neq(c: string, v: unknown) {
          filters.push((r) => r[c] !== v);
          described.push(`neq ${c}`);
          return b;
        },
        is(c: string, v: null) {
          filters.push((r) => (r[c] ?? null) === v);
          described.push(`is ${c} null`);
          return b;
        },
        not(c: string, operator: string, v: null) {
          if (operator !== "is") throw new Error("fakeDb: only not(col, 'is', null) is supported");
          filters.push((r) => (r[c] ?? null) !== v);
          described.push(`not ${c} is null`);
          return b;
        },
        in(c: string, list: unknown[]) {
          filters.push((r) => list.includes(r[c]));
          described.push(`in ${c}`);
          return b;
        },
        gte(c: string, v: string) {
          filters.push((r) => String(r[c]) >= v);
          described.push(`gte ${c}`);
          return b;
        },
        order(col: string, o?: { ascending?: boolean }) {
          sort = { col, asc: o?.ascending !== false };
          return b;
        },
        limit(n: number) {
          max = n;
          return b;
        },
        range(from: number, to: number) {
          range = [from, to];
          return b;
        },
        maybeSingle() {
          one = "maybe";
          return b;
        },
        single() {
          one = "one";
          return b;
        },
        then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(ok, bad);
        },
      };
      return b;
    },
  };
}
