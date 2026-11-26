import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// The one file that sets up Al Roshinah's database (supabase/roshinah-setup.sql), run on a real Postgres engine
// (PGlite, in this process), on an empty database as it will be run, then used the way the restaurant will use it. It is not a Supabase run: Supabase's
// own roles, storage and auth are stood in for below. Invented guests only.

const root = join(__dirname, "../../supabase");
// Line endings differ between a Windows checkout and the built file; they are not part of what is compared.
const text = (path: string) => readFileSync(path, "utf8").split("\r\n").join("\n");
const setup = text(join(root, "roshinah-setup.sql"));

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await rows<T>(sql, p))[0];
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
  const sql = setup.replace(/create extension if not exists pgcrypto;/gi, "");
  await db.exec(sql);
  // The two seeds alone are safe to run again (a second paste of the seed must not double anything).
  for (const f of ["roshinah.sql", "roshinah-menu.sql"]) await db.exec(readFileSync(join(root, "seeds", f), "utf8"));
}, 120_000);

describe("the setup file", () => {
  it("is built from every migration and both seeds, in order", () => {
    const names = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(names).toHaveLength(31);
    let at = 0;
    for (const n of [...names, "roshinah.sql", "roshinah-menu.sql"]) {
      const found = setup.indexOf(`-- ${n}\n`, at);
      expect(found, n).toBeGreaterThan(-1);
      at = found;
    }
    for (const n of names) expect(setup.includes(text(join(root, "migrations", n)).trim()), n).toBe(true);
  });

  it("gives one business, its three places, its first gift and its menu, once each even after the seeds run again", async () => {
    const venue = await one<{ id: string; card_mode: string; bookings_on: boolean; tills_locked: boolean; table_orders_on: boolean; table_calls_on: boolean }>(
      "select id, card_mode, bookings_on, tills_locked, table_orders_on, table_calls_on from venues where slug = 'roshinah'");
    // Everything that changes how the floor works starts switched off.
    expect(venue).toMatchObject({ card_mode: "visits", bookings_on: false, tills_locked: false, table_orders_on: false, table_calls_on: false });
    expect(await rows("select slug, kind, active, wide_reach from branches where venue_id = $1 order by sort", [venue.id])).toEqual([
      { slug: "sanad", kind: "branch", active: true, wide_reach: false },
      { slug: "zallaq", kind: "branch", active: false, wide_reach: false },
      { slug: "asmak", kind: "partner", active: true, wide_reach: false },
    ]);
    expect(await rows("select title, trigger, valid_days from vouchers where venue_id = $1", [venue.id])).toEqual([{ title: "50% off at Asmak Al Roshinah", trigger: "first_visit", valid_days: null }]);
    expect((await one<{ n: number }>("select count(*)::int as n from menu_categories where venue_id = $1", [venue.id])).n).toBe(14);
    expect((await one<{ n: number }>("select count(*)::int as n from menu_items where venue_id = $1", [venue.id])).n).toBe(90);
    expect((await one<{ n: number }>("select count(*)::int as n from auto_messages where venue_id = $1", [venue.id])).n).toBe(2);
  });

  it("locks every table: nothing in it can be read with the public key", async () => {
    const open = await rows<{ relname: string }>("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1");
    expect(open.map((t) => t.relname)).toEqual([]);
    const policies = await rows<{ tablename: string; roles: string }>("select tablename, roles::text from pg_policies where schemaname = 'public'");
    expect(policies.filter((p) => /anon|public|authenticated/.test(p.roles))).toEqual([]);
  });
});

describe("a guest's first weeks, on that database", () => {
  let venue: string, sanad: string, asmak: string;
  const OWNER = id(1), TILL = id(2), ASMAK_TILL = id(3), MEMBER = id(10), CARD = id(20), FRIEND_M = id(11), FRIEND_C = id(21);

  beforeAll(async () => {
    venue = (await one<{ id: string }>("select id from venues where slug = 'roshinah'")).id;
    sanad = (await one<{ id: string }>("select id from branches where venue_id = $1 and slug = 'sanad'", [venue])).id;
    asmak = (await one<{ id: string }>("select id from branches where venue_id = $1 and slug = 'asmak'", [venue])).id;
    await db.exec(`
      insert into staff_users (id, venue_id, name, role, branch_id) values ('${OWNER}','${venue}','Owner','owner',null), ('${TILL}','${venue}','Sanad till','staff','${sanad}'), ('${ASMAK_TILL}','${venue}','Asmak till','staff','${asmak}');
      insert into members (id, name, phone, consent_terms, consent_news, birth_day, birth_month) values ('${MEMBER}','Maryam Test','+97333330001',now(),true,12,3), ('${FRIEND_M}','Noor Test','+97333330002',now(),false,null,null);
      insert into cards (id, venue_id, member_id, code, invite) values ('${CARD}','${venue}','${MEMBER}','4821','abcdefgh23');
      insert into cards (id, venue_id, member_id, code, invited_by) values ('${FRIEND_C}','${venue}','${FRIEND_M}','4822','${CARD}');
    `);
  });

  it("a till bill with its dishes counts the first visit and unlocks the Asmak gift", async () => {
    const r = await one<{ visit_counted: boolean; visits: number; vouchers_issued: number }>(
      "select * from pos_receipt($1,$2,$3,$4,$5::jsonb,$6)", [venue, "4821", "INV-1", 11.4, JSON.stringify([{ name: "Chicken Machboos", qty: 2, priceBhd: 3.9 }, { name: "Karak tea", qty: 2, priceBhd: 0.8 }]), null]);
    // Sanad is the only switched-on branch, so the till need not name it.
    expect(r).toMatchObject({ visit_counted: true, visits: 1, vouchers_issued: 1 });
    expect((await one<{ n: number }>("select count(*)::int as n from receipt_items")).n).toBe(2);
  });

  it("the gift is used once, at Asmak only", async () => {
    const gift = await one<{ id: string }>("select id from card_vouchers where card_id = $1", [CARD]);
    await expect(rows("select * from voucher_redeem($1,$2,$3)", [gift.id, TILL, sanad])).rejects.toThrow(/cannot be used at this branch/);
    await rows("select * from voucher_redeem($1,$2,$3)", [gift.id, ASMAK_TILL, asmak]);
    await expect(rows("select * from voucher_redeem($1,$2,$3)", [gift.id, ASMAK_TILL, asmak])).rejects.toThrow(/already used/);
  });

  it("a staff scan the same evening is the same visit; the next day is a new one", async () => {
    await expect(rows("select * from ledger_visit($1,$2,$3)", [CARD, TILL, sanad])).rejects.toThrow(/visit already recorded/);
    await db.exec(`update ledger set created_at = created_at - interval '1 day' where card_id = '${CARD}'`);
    expect((await one<{ visits: number }>("select * from ledger_visit($1,$2,$3)", [CARD, TILL, sanad])).visits).toBe(2);
    await expect(rows("select * from ledger_visit($1,$2,$3)", [CARD, ASMAK_TILL, asmak])).rejects.toThrow(/cannot be recorded at this counter|not allowed/);
  });

  it("gifts the owner adds later work: a chosen visit, a birthday, a friend", async () => {
    await db.exec(`insert into vouchers (venue_id, title, trigger, at_visit) values ('${venue}','A dessert on us','visit_count',3);
                   insert into vouchers (venue_id, title, trigger, valid_days) values ('${venue}','A birthday cake','birthday',14), ('${venue}','A coffee for bringing a friend','friend',30);`);
    await db.exec(`update ledger set created_at = created_at - interval '1 day' where card_id = '${CARD}'`);
    expect((await one<{ visits: number; vouchers_issued: number }>("select * from ledger_visit($1,$2,$3)", [CARD, TILL, sanad]))).toMatchObject({ visits: 3, vouchers_issued: 1 });
    expect((await rows("select * from birthday_gifts($1,3,12,2027,false)", [venue]))).toEqual([{ gift_card: CARD }]);
    await rows("select * from ledger_visit($1,$2,$3)", [FRIEND_C, TILL, sanad]);
    const mine = await rows<{ title: string }>("select v.title from card_vouchers cv join vouchers v on v.id = cv.voucher_id where cv.card_id = $1 order by v.title", [CARD]);
    expect(mine.map((g) => g.title)).toEqual(["50% off at Asmak Al Roshinah", "A birthday cake", "A coffee for bringing a friend", "A dessert on us"]);
  });

  it("holds a table request, a trusted till, a phone that asked for alerts and an offer to one group", async () => {
    await db.exec(`
      insert into bookings (venue_id, card_id, token, name, phone, party, at) values ('${venue}','${CARD}','k'||repeat('a',23),'Maryam Test','+97333330001',4, now() + interval '2 days');
      insert into trusted_devices (venue_id, name, key_hash, created_by) values ('${venue}','Sanad counter iPad', repeat('b',64), '${OWNER}');
      insert into push_subscriptions (venue_id, staff_id, endpoint) values ('${venue}','${TILL}','https://fcm.googleapis.com/fcm/send/abc123def456');
      insert into offers (venue_id, message, audience, sent_by, recipients, segment, target_cards) values ('${venue}','We have missed you.','all','${OWNER}',1,'quiet', array['${CARD}']::uuid[]);
      update venues set bookings_on = true, tills_locked = true, table_calls_on = true where id = '${venue}';
      update branches set lat = 26.151234, lng = 50.601987, wide_reach = true where id = '${sanad}';
    `);
    await expect(db.exec(`insert into bookings (venue_id, token, name, phone, party, at) values ('${venue}','k'||repeat('c',23),'X','+97333330003',31, now())`)).rejects.toThrow();
    await expect(db.exec(`insert into offers (venue_id, message, audience, recipients, segment) values ('${venue}','x','all',0,'everyone')`)).rejects.toThrow(/offers_segment_check/);
  });

  it("erasing the guest takes their card, bills, gifts and table request with them", async () => {
    await db.exec(`delete from members where id = '${MEMBER}'`);
    for (const t of ["cards", "receipts", "card_vouchers", "bookings"]) {
      const where = t === "cards" ? "id" : "card_id";
      expect((await one<{ n: number }>(`select count(*)::int as n from ${t} where ${where} = $1`, [CARD])).n, t).toBe(0);
    }
    // The friend keeps their own card; only the link to who invited them is cleared.
    expect((await one<{ invited_by: string | null }>("select invited_by from cards where id = $1", [FRIEND_C])).invited_by).toBeNull();
  });
});
