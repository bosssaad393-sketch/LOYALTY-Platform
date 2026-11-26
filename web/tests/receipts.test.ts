import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { favourites, type GuestBill } from "@/lib/guestOrders";
import { MAX_PASS_LOCATIONS, passLocations, reachMetres, ringPoints, type Branch } from "@/lib/branches";
import { mapsHostOk, pinFromMapsUrl } from "@/lib/placeLinks";

// Migration 0024 in an in-process Postgres (PGlite): a bill from the till is kept against the guest with its dishes,
// and at a visit-card venue it counts the visit. Proves the SQL rules; it is not a Supabase run. Invented data only.

const dir = join(__dirname, "../../supabase/migrations");
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const POINTS = "bbbbbbbb-0000-4000-8000-000000000001";
const TWO = "cccccccc-0000-4000-8000-000000000001";
const SANAD = "aaaaaaaa-0000-4000-8000-0000000000b1";
const ASMAK = "aaaaaaaa-0000-4000-8000-0000000000b3";
const VOUCHER = "aaaaaaaa-0000-4000-8000-0000000000e1";
const card = (n: number) => `aaaaaaaa-0000-4000-8000-0000000000c${n}`;
const member = (n: number) => `aaaaaaaa-0000-4000-8000-0000000000d${n}`;

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
type Kept = { receipt_id: number; guest_card: string; duplicate: boolean; visit_counted: boolean; visits: number; vouchers_issued: number };
const bill = (code: string, receipt: string, items: unknown = [], branch: string | null = null, venue = V, amount = 12.5) =>
  rows<Kept>("select * from pos_receipt($1,$2,$3,$4,$5::jsonb,$6)", [venue, code, receipt, amount, JSON.stringify(items), branch]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, f), "utf8").replace(/create extension if not exists pgcrypto;/i, ""));
    } catch (e) {
      throw new Error(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await db.exec(`
    insert into venues (id, slug, name, card_mode) values ('${V}','rosh','Al Roshinah','visits'), ('${TWO}','two','Two branches','visits');
    insert into venues (id, slug, name) values ('${POINTS}','pts','Points venue');
    insert into branches (id, venue_id, slug, name, kind) values
      ('${SANAD}','${V}','sanad','Sanad','branch'), ('${ASMAK}','${V}','asmak','Asmak Al Roshinah','partner'),
      ('cccccccc-0000-4000-8000-0000000000b1','${TWO}','north','North','branch'), ('cccccccc-0000-4000-8000-0000000000b2','${TWO}','south','South','branch');
    insert into vouchers (id, venue_id, title, trigger, redeem_branch_id, valid_days) values ('${VOUCHER}','${V}','50% off at Asmak Al Roshinah','first_visit','${ASMAK}', 60);
  `);
  for (let n = 1; n <= 6; n++) {
    await db.exec(`insert into members (id, name, phone, consent_terms) values ('${member(n)}','Guest ${n}','+9730000000${n}',now());
                   insert into cards (id, venue_id, member_id, code) values ('${card(n)}','${V}','${member(n)}','100${n}');`);
  }
  await db.exec(`insert into members (id, name, phone, consent_terms) values ('aaaaaaaa-0000-4000-8000-0000000000d8','P','+97300000008',now()), ('aaaaaaaa-0000-4000-8000-0000000000d9','T','+97300000009',now());
                 insert into cards (id, venue_id, member_id, code) values ('aaaaaaaa-0000-4000-8000-0000000000c8','${POINTS}','aaaaaaaa-0000-4000-8000-0000000000d8','2001'), ('aaaaaaaa-0000-4000-8000-0000000000c9','${TWO}','aaaaaaaa-0000-4000-8000-0000000000d9','3001');`);
});

describe("pos_receipt", () => {
  it("keeps the bill with its dishes, counts the visit and unlocks the first-visit gift", async () => {
    const [r] = await bill("1001", "INV-1", [{ name: "  Chicken Machboos ", qty: 2, priceBhd: 3.5 }, { name: "Karak tea" }, { name: "   " }]);
    expect(r).toMatchObject({ duplicate: false, visit_counted: true, visits: 1, vouchers_issued: 1, guest_card: card(1) });
    const [kept] = await rows<{ total_fils: number; branch_id: string }>("select total_fils, branch_id from receipts where id=$1", [r.receipt_id]);
    expect(kept).toEqual({ total_fils: 12500, branch_id: SANAD });
    expect(await rows("select name, qty, price_fils from receipt_items where receipt_id=$1 order by id", [r.receipt_id])).toEqual([
      { name: "Chicken Machboos", qty: 2, price_fils: 3500 },
      { name: "Karak tea", qty: 1, price_fils: null },
    ]);
    const [l] = await rows<{ note: string; source: string; branch_id: string; points: number; staff_id: string | null }>("select note, source, branch_id, points, staff_id from ledger where card_id=$1", [card(1)]);
    expect(l).toEqual({ note: "visit", source: "pos", branch_id: SANAD, points: 0, staff_id: null });
    const [g] = await rows<{ status: string; expires: boolean }>("select status, expires_at is not null as expires from card_vouchers where card_id=$1", [card(1)]);
    expect(g).toEqual({ status: "issued", expires: true });
  });

  it("the same receipt again changes nothing", async () => {
    const [again] = await bill("1001", "INV-1", [{ name: "Something else" }]);
    expect(again).toMatchObject({ duplicate: true, visit_counted: false, visits: 1 });
    expect((await rows("select 1 from receipts where venue_id=$1 and receipt='INV-1'", [V]))).toHaveLength(1);
    expect((await rows("select 1 from ledger where card_id=$1", [card(1)]))).toHaveLength(1);
  });

  it("a second bill in the same sitting is kept but is not a second visit", async () => {
    const [r] = await bill("1001", "INV-2", [{ name: "Dessert", qty: 1, priceBhd: 2 }]);
    expect(r).toMatchObject({ duplicate: false, visit_counted: false, visits: 1, vouchers_issued: 0 });
    expect((await rows("select 1 from receipts where card_id=$1", [card(1)]))).toHaveLength(2);
  });

  it("a staff scan first, then the bill: one visit, not two", async () => {
    await db.exec(`insert into staff_users (id, venue_id, name, role, branch_id) values ('aaaaaaaa-0000-4000-8000-0000000000a2','${V}','Sanad till','staff','${SANAD}') on conflict do nothing`);
    await rows("select * from ledger_visit($1,$2,$3)", [card(2), "aaaaaaaa-0000-4000-8000-0000000000a2", SANAD]);
    const [r] = await bill("1002", "INV-3");
    expect(r).toMatchObject({ visit_counted: false, visits: 1 });
  });

  it("a partner counter and a venue whose till names no branch keep the bill only", async () => {
    const [atPartner] = await bill("1003", "INV-4", [], "asmak");
    expect(atPartner).toMatchObject({ visit_counted: false, visits: 0 });
    const [noBranch] = await bill("3001", "T-1", [], null, TWO);
    expect(noBranch).toMatchObject({ visit_counted: false, visits: 0 });
    const [named] = await bill("3001", "T-2", [], "South", TWO);
    expect(named).toMatchObject({ visit_counted: true, visits: 1 });
  });

  it("a points venue keeps the bill and adds no visit of its own", async () => {
    const [r] = await bill("2001", "P-1", [{ name: "Latte", qty: 1, priceBhd: 1.6 }], null, POINTS);
    expect(r).toMatchObject({ duplicate: false, visit_counted: false });
    expect(await rows("select 1 from ledger where venue_id=$1", [POINTS])).toHaveLength(0);
  });

  it("refuses an unknown card, an unknown branch, a bad amount and items that are not a list", async () => {
    await expect(bill("9999", "INV-9")).rejects.toThrow(/card not found/);
    await expect(bill("1004", "INV-9", [], "nowhere")).rejects.toThrow(/branch not found/);
    await expect(bill("1004", "INV-9", [], null, V, 0)).rejects.toThrow(/invalid bill amount/);
    await expect(bill("1004", "INV-9", { name: "x" })).rejects.toThrow(/invalid items/);
    expect(await rows("select 1 from receipts where receipt='INV-9'")).toHaveLength(0);
  });

  it("one venue's receipt number does not collide with another's, and a card code is looked up inside the venue", async () => {
    const [r] = await bill("2001", "INV-1", [], null, POINTS);
    expect(r).toMatchObject({ duplicate: false, guest_card: "aaaaaaaa-0000-4000-8000-0000000000c8" });
    await expect(bill("1001", "X-1", [], null, POINTS)).rejects.toThrow(/card not found/);
  });

  it("a refund marks the bill once, and needs a bill of that venue", async () => {
    const first = await rows<{ duplicate: boolean }>("select * from pos_receipt_refund($1,$2)", [V, "INV-2"]);
    expect(first[0].duplicate).toBe(false);
    const again = await rows<{ duplicate: boolean }>("select * from pos_receipt_refund($1,$2)", [V, "INV-2"]);
    expect(again[0].duplicate).toBe(true);
    await expect(rows("select * from pos_receipt_refund($1,$2)", [POINTS, "INV-2"])).rejects.toThrow(/receipt not found/);
    expect((await rows<{ n: number }>("select count(*)::int as n from receipts where refunded_at is not null"))[0].n).toBe(1);
  });

  it("erasing the guest erases their bills", async () => {
    await db.exec(`delete from members where id='${member(1)}'`);
    expect(await rows("select 1 from receipts where card_id=$1", [card(1)])).toHaveLength(0);
    expect(await rows("select 1 from receipt_items i where not exists (select 1 from receipts r where r.id = i.receipt_id)")).toHaveLength(0);
  });

  it("only the server may call the functions and read the tables", async () => {
    const acl = await rows<{ proname: string; ok: boolean }>("select proname, has_function_privilege('anon', oid, 'execute') as ok from pg_proc where proname in ('pos_receipt','pos_receipt_refund')");
    expect(acl).toHaveLength(2);
    expect(acl.every((a) => a.ok === false)).toBe(true);
    const rls = await rows<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname in ('receipts','receipt_items')");
    expect(rls.every((t) => t.relrowsecurity)).toBe(true);
  });
});

describe("what a guest orders most", () => {
  const b = (items: [string, number][], refunded = false): GuestBill => ({ id: String(Math.random()), from: "till", at: "2026-11-01T10:00:00Z", place: null, totalFils: 1000, refunded, items: items.map(([name, qty]) => ({ name, qty, priceFils: 500 })) });
  it("counts by bills first, then by quantity, and reads a name the same whatever its capitals", () => {
    const top = favourites([b([["Karak tea", 1], ["Hummus", 4]]), b([["karak  Tea", 1]]), b([["KARAK TEA", 1], ["Kunafa", 1]])]);
    expect(top.map((f) => [f.name, f.bills, f.qty])).toEqual([["Karak tea", 3, 3], ["Hummus", 1, 4], ["Kunafa", 1, 1]]);
    expect(favourites([])).toEqual([]);
  });
});

describe("the lock-screen area", () => {
  const place = (over: Partial<Branch> & { id: string }): Branch => ({ slug: over.id, name: over.id, nameAr: null, kind: "branch", address: null, phone: null, mapsUrl: null, reviewUrl: null, menuUrl: null, lat: null, lng: null, active: true, ...over });
  const metres = (a: { latitude: number; longitude: number }, lat: number, lng: number) => Math.hypot((a.latitude - lat) * 111_320, (a.longitude - lng) * 111_320 * Math.cos((lat * Math.PI) / 180));

  it("a wide branch gets a ring of six points 170 m out; a plain one keeps its single pin", () => {
    const sanad = place({ id: "sanad", lat: 26.15, lng: 50.6, wideReach: true });
    const asmak = place({ id: "asmak", kind: "partner", lat: 26.2, lng: 50.55 });
    const all = passLocations([sanad, asmak], "Al Roshinah");
    expect(all).toHaveLength(8);
    expect(all.slice(0, 2).map((l) => l.latitude)).toEqual([26.15, 26.2]);
    for (const p of all.slice(2)) {
      expect(Math.round(metres(p, 26.15, 50.6))).toBeGreaterThanOrEqual(168);
      expect(Math.round(metres(p, 26.15, 50.6))).toBeLessThanOrEqual(172);
      expect(p.relevantText).toBe("Welcome to Al Roshinah, sanad. Show your card.");
    }
    expect(ringPoints([sanad, asmak]).get("sanad")).toBe(6);
    expect(reachMetres(6)).toBe(270);
    expect(reachMetres(0)).toBe(100);
  });

  it("never passes Apple's ten points: the ring shrinks, and under four spare points there is none", () => {
    const seven = Array.from({ length: 6 }, (_, i) => place({ id: `b${i}`, lat: 26 + i / 100, lng: 50 }));
    const wide = place({ id: "w", lat: 26.5, lng: 50.5, wideReach: true });
    expect(passLocations([wide, ...seven.slice(0, 5)], "X")).toHaveLength(MAX_PASS_LOCATIONS);
    expect(ringPoints([wide, ...seven.slice(0, 5)]).get("w")).toBe(4);
    expect(passLocations([wide, ...seven, place({ id: "x", lat: 27, lng: 50 })], "X")).toHaveLength(8);
    expect(ringPoints([wide, ...seven, place({ id: "x", lat: 27, lng: 50 })]).size).toBe(0);
    expect(passLocations([place({ id: "nopin", wideReach: true })], "X")).toEqual([]);
  });
});

describe("the pin inside a Google Maps link", () => {
  it("reads the place's own pin before the centre of the view", () => {
    expect(pinFromMapsUrl("https://www.google.com/maps/place/Al+Roshinah/@26.1501,50.6002,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d26.151234!4d50.601987")).toEqual({ lat: 26.151234, lng: 50.601987 });
    expect(pinFromMapsUrl("https://www.google.com/maps/@26.1501,50.6002,17z")).toEqual({ lat: 26.1501, lng: 50.6002 });
    expect(pinFromMapsUrl("https://maps.google.com/?q=26.1789,50.4931")).toEqual({ lat: 26.1789, lng: 50.4931 });
    expect(pinFromMapsUrl("https://www.google.com/maps/search/?api=1&query=26.1789%2C50.4931")).toEqual({ lat: 26.1789, lng: 50.4931 });
  });
  it("finds nothing in a short link or a link without numbers", () => {
    expect(pinFromMapsUrl("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(pinFromMapsUrl("https://www.google.com/maps/place/Al+Roshinah")).toBeNull();
  });
  it("only Google's own maps addresses are followed", () => {
    expect(mapsHostOk("https://maps.app.goo.gl/x")).toBe(true);
    expect(mapsHostOk("https://www.google.com/maps/place/x")).toBe(true);
    for (const bad of ["http://maps.app.goo.gl/x", "https://maps.app.goo.gl.evil.example/x", "https://evil.example/?u=https://google.com", "https://169.254.169.254/", "not a link"]) expect(mapsHostOk(bad)).toBe(false);
  });
});

// Migration 0025: a gift on a chosen visit, and a birthday gift every year.
describe("gift rules", () => {
  const FIFTH = "aaaaaaaa-0000-4000-8000-0000000000e5";
  const BDAY = "aaaaaaaa-0000-4000-8000-0000000000e6";
  const STAFF = "aaaaaaaa-0000-4000-8000-0000000000a2";
  const gifts = (c: string) => rows<{ voucher_id: string; cycle: number }>("select voucher_id, cycle from card_vouchers where card_id=$1 order by issued_at, cycle", [c]);
  // A visit, then the clock moved back so the next one is a new sitting.
  const visitThenWait = async (c: string) => {
    const r = await rows<{ visits: number; vouchers_issued: number }>("select * from ledger_visit($1,$2,$3)", [c, STAFF, SANAD]);
    await db.exec(`update ledger set created_at = created_at - interval '1 day' where card_id='${c}'`);
    return r[0];
  };

  it("a gift tied to visit 3 unlocks on the third visit only, whether staff scan or the till sends the bill", async () => {
    await db.exec(`insert into vouchers (id, venue_id, title, trigger, at_visit) values ('${FIFTH}','${V}','A dessert on us','visit_count',3)`);
    expect((await visitThenWait(card(5)))).toMatchObject({ visits: 1, vouchers_issued: 1 });
    expect((await visitThenWait(card(5)))).toMatchObject({ visits: 2, vouchers_issued: 0 });
    const [third] = await bill("1005", "INV-30");
    expect(third).toMatchObject({ visit_counted: true, visits: 3, vouchers_issued: 1 });
    await db.exec(`update ledger set created_at = created_at - interval '1 day' where card_id='${card(5)}'`);
    expect((await visitThenWait(card(5)))).toMatchObject({ visits: 4, vouchers_issued: 0 });
    expect((await gifts(card(5))).map((g) => g.voucher_id)).toEqual([VOUCHER, FIFTH]);
  });

  it("a gift tied to a visit needs its number", async () => {
    await expect(db.exec(`insert into vouchers (venue_id, title, trigger) values ('${V}','No number','visit_count')`)).rejects.toThrow(/vouchers_at_visit_needed/);
    await expect(db.exec(`insert into vouchers (venue_id, title, trigger, at_visit) values ('${V}','Visit one','visit_count',1)`)).rejects.toThrow();
  });

  it("the birthday gift unlocks once a year, for guests born that day, and again the next year", async () => {
    await db.exec(`insert into vouchers (id, venue_id, title, trigger, valid_days) values ('${BDAY}','${V}','A birthday cake','birthday',14);
                   update members set birth_day = 12, birth_month = 3 where id = '${member(5)}';
                   update members set birth_day = 29, birth_month = 2 where id = '${member(6)}';`);
    const run = (m: number, d: number, y: number, feb29 = false) => rows<{ gift_card: string }>("select * from birthday_gifts($1,$2,$3,$4,$5)", [V, m, d, y, feb29]);
    expect((await run(3, 12, 2027)).map((r) => r.gift_card)).toEqual([card(5)]);
    expect(await run(3, 12, 2027)).toEqual([]);
    expect(await run(3, 13, 2027)).toEqual([]);
    expect((await run(3, 12, 2028)).map((r) => r.gift_card)).toEqual([card(5)]);
    expect((await gifts(card(5))).filter((g) => g.voucher_id === BDAY).map((g) => g.cycle)).toEqual([2027, 2028]);
    expect((await run(2, 28, 2027, true)).map((r) => r.gift_card)).toEqual([card(6)]);
    expect(await run(2, 28, 2027, false)).toEqual([]);
    expect((await rows("select 1 from audit_log where action='birthday_gift'"))).toHaveLength(3);
  });

  it("a guest who erased their data gets no birthday gift, and a switched-off gift is not given", async () => {
    await db.exec(`update members set deleted_at = now() where id = '${member(5)}'`);
    expect(await rows("select * from birthday_gifts($1,3,12,2029,false)", [V])).toEqual([]);
    await db.exec(`update members set deleted_at = null where id = '${member(5)}'; update vouchers set active = false where id = '${BDAY}'`);
    expect(await rows("select * from birthday_gifts($1,3,12,2029,false)", [V])).toEqual([]);
  });
});
