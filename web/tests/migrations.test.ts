import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Runs the real SQL migrations (0001..latest) in an in-process Postgres (PGlite) with stand-ins for Supabase's roles and auth.users,
// then calls the ledger functions. Proves the SQL runs and behaves; it is NOT a Supabase run (no RLS-as-user, no PostgREST).

const dir = join(__dirname, "../../supabase/migrations");
const VA = "aaaaaaaa-0000-4000-8000-000000000001";
const VB = "bbbbbbbb-0000-4000-8000-000000000001";
const OWNER_A = "aaaaaaaa-0000-4000-8000-0000000000a1";
const MGR_A = "aaaaaaaa-0000-4000-8000-0000000000a2";
const OWNER_B = "bbbbbbbb-0000-4000-8000-0000000000b1";
const CARD_A = "aaaaaaaa-0000-4000-8000-0000000000c1";
const CARD_B = "bbbbbbbb-0000-4000-8000-0000000000c1";

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const bal = async (card: string) => (await rows<{ points: number }>("select points from cards where id=$1", [card]))[0].points;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      // PGlite has no pgcrypto; gen_random_uuid() is built into Postgres 13+, so only the extension line is dropped.
      await db.exec(readFileSync(join(dir, f), "utf8").replace(/create extension if not exists pgcrypto;/i, ""));
    } catch (e) {
      throw new Error(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await db.exec(`
    insert into venues (id, slug, name, points_per_bhd) values ('${VA}','a','Venue A',2), ('${VB}','b','Venue B',5);
    insert into staff_users (id, venue_id, name, role) values ('${OWNER_A}','${VA}','Owner A','owner'), ('${MGR_A}','${VA}','Mgr A','manager'), ('${OWNER_B}','${VB}','Owner B','owner');
    insert into members (id, name, phone, consent_terms) values ('aaaaaaaa-0000-4000-8000-0000000000d1','Ann','+97300000001',now()), ('bbbbbbbb-0000-4000-8000-0000000000d1','Bob','+97300000002',now());
    insert into cards (id, venue_id, member_id, code) values ('${CARD_A}','${VA}','aaaaaaaa-0000-4000-8000-0000000000d1','1111'), ('${CARD_B}','${VB}','bbbbbbbb-0000-4000-8000-0000000000d1','1111');
  `);
});

describe("migrations 0001..latest", () => {
  it("apply in order without errors and create the new tables", async () => {
    const t = (await rows<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public'")).map((r) => r.table_name);
    for (const n of ["assistant_pending", "assistant_requests", "pos_connections", "pos_events", "audit_log"]) expect(t).toContain(n);
  });
});

describe("showcase seed (supabase/seeds/showcase.sql)", () => {
  it("runs twice on top of the migrations and gives three guests and a team", async () => {
    const fresh = new PGlite();
    await fresh.exec(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
    await fresh.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await fresh.exec(readFileSync(join(dir, f), "utf8").replace(/create extension if not exists pgcrypto;/i, ""));
    const seed = readFileSync(join(dir, "../seeds/showcase.sql"), "utf8");
    await fresh.exec(seed);
    await fresh.exec(seed);
    expect((await fresh.query<{ points: number }>("select points from cards order by code")).rows.map((r) => r.points)).toEqual([40, 380, 520]);
    expect((await fresh.query("select 1 from staff_users where role = 'owner'")).rows.length).toBe(1);
  });
});

describe("one-paste showcase setup (supabase/showcase-setup.sql)", () => {
  it("runs as a single script on an empty database", async () => {
    const fresh = new PGlite();
    await fresh.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
    await fresh.exec(readFileSync(join(dir, "../showcase-setup.sql"), "utf8").replace(/create extension if not exists pgcrypto;/i, ""));
    expect((await fresh.query("select 1 from cards")).rows.length).toBe(3);
    expect((await fresh.query("select 1 from venues where slug = 'orbyn' and name = 'Sol'")).rows.length).toBe(1);
  });
});

describe("ledger_adjust (0005)", () => {
  it("owner of the venue can add and remove points; reason and limits enforced", async () => {
    await db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_A, 50, "welcome gift"]);
    expect(await bal(CARD_A)).toBe(50);
    await db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_A, -20, "correction"]);
    expect(await bal(CARD_A)).toBe(30);
    await expect(db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_A, 1001, "x"])).rejects.toThrow(/between 1 and 1000/);
    await expect(db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_A, 5, " "])).rejects.toThrow(/reason/);
    await expect(db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_A, -500, "too much"])).rejects.toThrow(/below zero/);
    expect(await bal(CARD_A)).toBe(30);
  });
  it("a manager, or the owner of ANOTHER venue, is refused", async () => {
    await expect(db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, MGR_A, 5, "x"])).rejects.toThrow(/only the owner/);
    await expect(db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_B, 5, "x"])).rejects.toThrow(/only the owner/);
    expect(await bal(CARD_A)).toBe(30);
  });
});

describe("POS functions (0006)", () => {
  it("sale adds floor(bill x rate) and the same receipt twice changes nothing", async () => {
    const a = (await rows<{ points_added: number; new_balance: number; duplicate: boolean }>("select * from ledger_pos_sale($1,$2,$3,$4)", [VA, "1111", 12.5, "R-1"]))[0];
    expect(a).toMatchObject({ points_added: 25, new_balance: 55, duplicate: false });
    const b = (await rows<{ points_added: number; duplicate: boolean }>("select * from ledger_pos_sale($1,$2,$3,$4)", [VA, "1111", 12.5, "R-1"]))[0];
    expect(b).toMatchObject({ points_added: 0, duplicate: true });
    expect(await bal(CARD_A)).toBe(55);
  });
  it("a card code of another venue is not found; bad bills are refused", async () => {
    await expect(db.query("select * from ledger_pos_sale($1,$2,$3,$4)", [VA, "9999", 5, "R-2"])).rejects.toThrow(/card not found/);
    await expect(db.query("select * from ledger_pos_sale($1,$2,$3,$4)", [VA, "1111", 0, "R-2"])).rejects.toThrow(/invalid bill/);
    await expect(db.query("select * from ledger_pos_sale($1,$2,$3,$4)", [VA, "1111", 0.1, "R-2"])).rejects.toThrow(/too small/);
  });
  it("the same code in venue B is a different card (venue isolation)", async () => {
    await db.query("select * from ledger_pos_sale($1,$2,$3,$4)", [VB, "1111", 2, "R-1"]);
    expect(await bal(CARD_B)).toBe(10);
    expect(await bal(CARD_A)).toBe(55);
  });
  it("refund takes the points back once; unknown receipt refused; other venue cannot refund it", async () => {
    await expect(db.query("select * from ledger_pos_refund($1,$2)", [VB, "R-NOPE"])).rejects.toThrow(/receipt not found/);
    const r = (await rows<{ points_removed: number; duplicate: boolean }>("select * from ledger_pos_refund($1,$2)", [VA, "R-1"]))[0];
    expect(r).toMatchObject({ points_removed: 25, duplicate: false });
    expect(await bal(CARD_A)).toBe(30);
    const again = (await rows<{ points_removed: number; duplicate: boolean }>("select * from ledger_pos_refund($1,$2)", [VA, "R-1"]))[0];
    expect(again).toMatchObject({ points_removed: 0, duplicate: true });
    expect(await bal(CARD_A)).toBe(30);
    expect(await bal(CARD_B)).toBe(10);
  });
  it("refund is refused when the guest already spent the points", async () => {
    await db.query("select * from ledger_pos_sale($1,$2,$3,$4)", [VA, "1111", 10, "R-3"]);
    await db.query("select * from ledger_adjust($1,$2,$3,$4)", [CARD_A, OWNER_A, -45, "spent"]);
    await expect(db.query("select * from ledger_pos_refund($1,$2)", [VA, "R-3"])).rejects.toThrow(/below zero/);
  });
});

describe("table service tables (0010)", () => {
  const V = "cccccccc-0000-4000-8000-000000000001";
  const T = "cccccccc-0000-4000-8000-000000000002";

  beforeAll(async () => {
    await db.query("insert into venues (id, slug, name) values ($1, 'table-test', 'Table Test')", [V]);
    await db.query("insert into venue_tables (id, venue_id, label, token) values ($1, $2, '1', 'a-long-random-table-code')", [T, V]);
  });

  it("allows one open tab per table, and a new one after it is paid", async () => {
    const [tab] = await rows<{ id: string }>("insert into tabs (venue_id, table_id) values ($1, $2) returning id", [V, T]);
    await expect(db.query("insert into tabs (venue_id, table_id) values ($1, $2)", [V, T])).rejects.toThrow(/tabs_one_open_per_table/);
    await db.query("update tabs set status = 'paid', paid_method = 'cash' where id = $1", [tab.id]);
    await db.query("insert into tabs (venue_id, table_id) values ($1, $2)", [V, T]);
  });

  it("keeps one open call of each kind on a tab, so the clock keeps the first tap", async () => {
    const [tab] = await rows<{ id: string }>("select id from tabs where table_id = $1 and status = 'open'", [T]);
    const add = (kind: string) => db.query("insert into table_requests (venue_id, tab_id, table_id, kind) values ($1, $2, $3, $4)", [V, tab.id, T, kind]);
    await add("coal");
    await expect(add("coal")).rejects.toThrow(/table_requests_one_open/);
    await add("bill");
    await db.query("update table_requests set handled_at = now() where tab_id = $1 and kind = 'coal'", [tab.id]);
    await add("coal");
  });

  it("refuses a ready time other than 10 or 20 minutes, and a negative price", async () => {
    const [tab] = await rows<{ id: string }>("select id from tabs where table_id = $1 and status = 'open'", [T]);
    await expect(db.query("insert into orders (venue_id, tab_id, table_id, ready_minutes) values ($1, $2, $3, 15)", [V, tab.id, T])).rejects.toThrow(/check/);
    const [c] = await rows<{ id: string }>("insert into menu_categories (venue_id, name_en) values ($1, 'Drinks') returning id", [V]);
    await expect(db.query("insert into menu_items (venue_id, category_id, name_en, price_fils) values ($1, $2, 'Tea', -1)", [V, c.id])).rejects.toThrow(/check/);
  });

  it("creates a public photo folder that takes only WebP and JPEG", async () => {
    const [b] = await rows<{ public: boolean; allowed_mime_types: string[] }>("select public, allowed_mime_types from storage.buckets where id = 'menu'");
    expect(b).toEqual({ public: true, allowed_mime_types: ["image/webp", "image/jpeg"] });
  });
});

describe("Tap payments (0012)", () => {
  const V = "dddddddd-0000-4000-8000-000000000001";
  const T = "dddddddd-0000-4000-8000-000000000002";
  let tab: string;

  beforeAll(async () => {
    await db.query("insert into venues (id, slug, name) values ($1, 'pay-test', 'Pay Test')", [V]);
    await db.query("insert into venue_tables (id, venue_id, label, token) values ($1, $2, '1', 'a-long-random-pay-code')", [T, V]);
    tab = (await rows<{ id: string }>("insert into tabs (venue_id, table_id) values ($1, $2) returning id", [V, T]))[0].id;
  });

  it("a tab can close as paid by card or card plus cash, and nothing else", async () => {
    await db.query("update tabs set paid_method = 'tap' where id = $1", [tab]);
    await db.query("update tabs set paid_method = 'mixed' where id = $1", [tab]);
    await db.query("update tabs set paid_method = 'cash' where id = $1", [tab]);
    await expect(db.query("update tabs set paid_method = 'cheque' where id = $1", [tab])).rejects.toThrow(/tabs_paid_method_check/);
  });

  it("takes a cash call, and still refuses an unknown kind", async () => {
    await db.query("insert into table_requests (venue_id, tab_id, table_id, kind) values ($1, $2, $3, 'cash')", [V, tab, T]);
    await expect(db.query("insert into table_requests (venue_id, tab_id, table_id, kind) values ($1, $2, $3, 'dance')", [V, tab, T])).rejects.toThrow(/table_requests_kind_check/);
  });

  it("stores payments in BHD fils, above zero, with each Tap charge only once", async () => {
    const add = (amount: number, charge: string | null, currency = "BHD") =>
      db.query("insert into payments (venue_id, tab_id, amount_fils, charge_id, currency) values ($1, $2, $3, $4, $5)", [V, tab, amount, charge, currency]);
    await add(5200, "chg_TEST00000001");
    await expect(add(5200, "chg_TEST00000001")).rejects.toThrow(/unique|duplicate/);
    await expect(add(0, null)).rejects.toThrow(/check/);
    await expect(add(100, null, "USD")).rejects.toThrow(/check/);
    const [p] = await rows<{ status: string }>("select status from payments where charge_id = 'chg_TEST00000001'");
    expect(p.status).toBe("initiated");
    await expect(db.query("update payments set status = 'refunded' where charge_id = 'chg_TEST00000001'")).rejects.toThrow(/check/);
  });

  it("runs twice without harm", async () => {
    await db.exec(readFileSync(join(dir, "0012_tap_payments.sql"), "utf8"));
  });
});

describe("points for a table's bill (0013)", () => {
  it("links a tab to a card, lets the card go without losing the tab, and refuses negative points", async () => {
    const V = "eeeeeeee-0000-4000-8000-000000000001";
    const T = "eeeeeeee-0000-4000-8000-000000000002";
    await db.query("insert into venues (id, slug, name) values ($1, 'points-test', 'Points Test')", [V]);
    await db.query("insert into venue_tables (id, venue_id, label, token) values ($1, $2, '1', 'a-long-random-points-code')", [T, V]);
    const [m] = await rows<{ id: string }>("insert into members (name, phone, consent_terms) values ('Pat', '+97300000009', now()) returning id");
    const [c] = await rows<{ id: string }>("insert into cards (venue_id, member_id, code) values ($1, $2, '4321') returning id", [V, m.id]);
    const [t] = await rows<{ id: string }>("insert into tabs (venue_id, table_id, card_id) values ($1, $2, $3) returning id", [V, T, c.id]);
    await expect(db.query("update tabs set points_added = -1 where id = $1", [t.id])).rejects.toThrow(/check/);
    await db.query("update tabs set points_added = 8 where id = $1", [t.id]);
    await db.query("delete from cards where id = $1", [c.id]);
    const [after] = await rows<{ card_id: string | null; points_added: number }>("select card_id, points_added from tabs where id = $1", [t.id]);
    expect(after).toEqual({ card_id: null, points_added: 8 });
  });
});
