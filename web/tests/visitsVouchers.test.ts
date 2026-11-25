import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Migration 0022 in an in-process Postgres (PGlite): branches, visit cards, one-time vouchers.
// Proves the SQL rules; it is not a Supabase run.

const dir = join(__dirname, "../../supabase/migrations");
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000001";
const SANAD = "aaaaaaaa-0000-4000-8000-0000000000b1";
const ZALLAQ = "aaaaaaaa-0000-4000-8000-0000000000b2";
const ASMAK = "aaaaaaaa-0000-4000-8000-0000000000b3";
const OWNER = "aaaaaaaa-0000-4000-8000-0000000000a1";
const STAFF_SANAD = "aaaaaaaa-0000-4000-8000-0000000000a2";
const STAFF_ASMAK = "aaaaaaaa-0000-4000-8000-0000000000a3";
const STAFF_OTHER = "bbbbbbbb-0000-4000-8000-0000000000a1";
const VOUCHER = "aaaaaaaa-0000-4000-8000-0000000000e1";
const card = (n: number) => `aaaaaaaa-0000-4000-8000-0000000000c${n}`;
const member = (n: number) => `aaaaaaaa-0000-4000-8000-0000000000d${n}`;

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const visit = (c: string, staff = STAFF_SANAD, branch: string | null = SANAD) =>
  rows<{ ledger_id: number; visits: number; vouchers_issued: number }>("select * from ledger_visit($1,$2,$3)", [c, staff, branch]);
const issued = async (c: string) => (await rows<{ id: string; status: string }>("select id, status from card_vouchers where card_id=$1", [c]));

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
    insert into venues (id, slug, name, card_mode) values ('${V}','rosh','Al Roshinah','visits'), ('${OTHER}','other','Other', 'visits');
    insert into branches (id, venue_id, slug, name, kind) values
      ('${SANAD}','${V}','sanad','Sanad','branch'), ('${ZALLAQ}','${V}','zallaq','Zallaq','branch'), ('${ASMAK}','${V}','asmak','Asmak Al Roshinah','partner');
    insert into staff_users (id, venue_id, name, role, branch_id) values
      ('${OWNER}','${V}','Owner','owner',null), ('${STAFF_SANAD}','${V}','Sanad till','staff','${SANAD}'),
      ('${STAFF_ASMAK}','${V}','Asmak till','staff','${ASMAK}'), ('${STAFF_OTHER}','${OTHER}','Other till','staff',null);
    insert into vouchers (id, venue_id, title, trigger, redeem_branch_id) values ('${VOUCHER}','${V}','50% off at Asmak Al Roshinah','first_visit','${ASMAK}');
  `);
  for (let n = 1; n <= 6; n++) {
    await db.exec(`insert into members (id, name, phone, consent_terms) values ('${member(n)}','Guest ${n}','+9730000000${n}',now());
                   insert into cards (id, venue_id, member_id, code) values ('${card(n)}','${V}','${member(n)}','100${n}');`);
  }
});

describe("ledger_visit", () => {
  it("records the visit at the branch, counts it and unlocks the first-visit voucher", async () => {
    const [r] = await visit(card(1));
    expect(r.visits).toBe(1);
    expect(r.vouchers_issued).toBe(1);
    const [l] = await rows<{ branch_id: string; points: number; note: string }>("select branch_id, points, note from ledger where id=$1", [r.ledger_id]);
    expect(l).toMatchObject({ branch_id: SANAD, points: 0, note: "visit" });
    expect((await issued(card(1))).map((v) => v.status)).toEqual(["issued"]);
  });

  it("refuses a second scan of the same card in the same sitting", async () => {
    await expect(visit(card(1))).rejects.toThrow(/visit already recorded/);
  });

  it("gives the first-visit voucher only once, however many visits follow", async () => {
    await db.exec(`update ledger set created_at = now() - interval '2 days' where card_id = '${card(1)}'`);
    const [r] = await visit(card(1), OWNER, ZALLAQ);
    expect(r.visits).toBe(2);
    expect(r.vouchers_issued).toBe(0);
    expect(await issued(card(1))).toHaveLength(1);
  });

  it("keeps staff to their own branch, and partner counters cannot record visits", async () => {
    await expect(visit(card(2), STAFF_SANAD, ZALLAQ)).rejects.toThrow(/not allowed at this branch/);
    await expect(visit(card(2), STAFF_ASMAK, ASMAK)).rejects.toThrow(/cannot be recorded at this counter/);
    await expect(visit(card(2), OWNER, null)).rejects.toThrow(/choose a branch/);
  });

  it("refuses staff of another venue and branches of another venue", async () => {
    await expect(visit(card(2), STAFF_OTHER, null)).rejects.toThrow(/not allowed at this venue/);
    const foreign = "bbbbbbbb-0000-4000-8000-0000000000b9";
    await db.exec(`insert into branches (id, venue_id, slug, name) values ('${foreign}','${OTHER}','x','X')`);
    await expect(visit(card(2), OWNER, foreign)).rejects.toThrow(/branch not found/);
  });

  it("stops one staff member at the venue's daily scan limit", async () => {
    await db.exec(`update venues set visit_cap_per_staff = 2 where id = '${V}'`);
    await visit(card(3));
    await visit(card(4));
    await expect(visit(card(5))).rejects.toThrow(/daily scan limit/);
    await db.exec(`update venues set visit_cap_per_staff = 250 where id = '${V}'`);
  });
});

describe("voucher_redeem", () => {
  const redeem = (cv: string, staff = STAFF_ASMAK, branch: string | null = ASMAK) => rows("select * from voucher_redeem($1,$2,$3)", [cv, staff, branch]);

  it("is refused away from the branch the voucher is for", async () => {
    const [v] = await issued(card(1));
    await expect(redeem(v.id, STAFF_SANAD, SANAD)).rejects.toThrow(/cannot be used at this branch/);
    await expect(redeem(v.id, STAFF_OTHER, null)).rejects.toThrow(/not allowed at this venue/);
  });

  it("works once at the right counter, then never again", async () => {
    const [v] = await issued(card(1));
    await redeem(v.id);
    const [after] = await rows<{ status: string; redeemed_by: string; redeemed_branch: string }>("select status, redeemed_by, redeemed_branch from card_vouchers where id=$1", [v.id]);
    expect(after).toEqual({ status: "redeemed", redeemed_by: STAFF_ASMAK, redeemed_branch: ASMAK });
    await expect(redeem(v.id)).rejects.toThrow(/already used/);
    await expect(redeem(v.id, OWNER, ASMAK)).rejects.toThrow(/already used/);
  });

  it("refuses an expired voucher and a cancelled one", async () => {
    const [v3] = await issued(card(3));
    await db.exec(`update card_vouchers set expires_at = now() - interval '1 minute' where id = '${v3.id}'`);
    await expect(redeem(v3.id)).rejects.toThrow(/expired/);
    const [v4] = await issued(card(4));
    await expect(rows("select * from voucher_void($1,$2)", [v4.id, STAFF_SANAD])).rejects.toThrow(/only the owner or a manager/);
    await rows("select * from voucher_void($1,$2)", [v4.id, OWNER]);
    await expect(redeem(v4.id)).rejects.toThrow(/not valid/);
  });

  it("writes every visit and redemption to the audit log", async () => {
    const actions = (await rows<{ action: string }>("select action from audit_log where venue_id=$1", [V])).map((r) => r.action);
    expect(actions.filter((a) => a === "visit").length).toBeGreaterThanOrEqual(4);
    expect(actions).toContain("voucher_redeem");
    expect(actions).toContain("voucher_void");
  });
});

describe("older venues", () => {
  it("a points venue cannot use ledger_visit", async () => {
    await db.exec(`update venues set card_mode = null where id = '${OTHER}';
      insert into members (id, name, phone, consent_terms) values ('bbbbbbbb-0000-4000-8000-0000000000d1','Bob','+97300000099',now());
      insert into cards (id, venue_id, member_id, code) values ('bbbbbbbb-0000-4000-8000-0000000000c1','${OTHER}','bbbbbbbb-0000-4000-8000-0000000000d1','1111');`);
    await expect(rows("select * from ledger_visit($1,$2,$3)", ["bbbbbbbb-0000-4000-8000-0000000000c1", STAFF_OTHER, null])).rejects.toThrow(/does not use visit cards/);
  });
});
