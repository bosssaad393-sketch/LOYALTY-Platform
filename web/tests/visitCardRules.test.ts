import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { joinFields, parseBirthday } from "@/lib/joinFields";
import { passVoucher, redeemableHere, sortVouchers, voucherState, type CardVoucher } from "@/lib/vouchers";
import { DEFAULT_MESSAGES, bahrainDate, dueBirthdays, dueWinbacks, liveNotice, type AutoGuest } from "@/lib/autoMessages";
import { MAX_PASS_LOCATIONS, passLocations, toBranch, workingBranch, type Branch } from "@/lib/branches";

const DAY = 86_400_000;

describe("join fields and birthday", () => {
  it("asks for mobile only unless the venue says otherwise", () => {
    expect(joinFields(null)).toEqual(["mobile"]);
    expect(joinFields([])).toEqual(["mobile"]);
    expect(joinFields(["birthday", "EMAIL", "mobile", "passport"])).toEqual(["mobile", "email", "birthday"]);
  });

  it("reads a birthday in the three shapes, and leaves it out when empty", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(parseBirthday("", now)).toBeNull();
    expect(parseBirthday("1994-03-07", now)).toEqual({ day: 7, month: 3, year: 1994 });
    expect(parseBirthday("7/3", now)).toEqual({ day: 7, month: 3, year: null });
    expect(parseBirthday("07/03/1994", now)).toEqual({ day: 7, month: 3, year: 1994 });
    expect(parseBirthday("29/2", now)).toEqual({ day: 29, month: 2, year: null });
  });

  it("refuses dates that do not exist, the future and nonsense", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    for (const bad of ["31/4", "29/02/2023", "2027-01-01", "0/5", "12/13", "1899-01-01", "yesterday"]) expect(parseBirthday(bad, now)).toBe("bad");
  });
});

const voucher = (over: Partial<CardVoucher> = {}): CardVoucher => ({
  id: "v1", voucherId: "d1", title: "50% off", titleAr: null, detail: null, detailAr: null, status: "issued",
  issuedAt: "2026-11-20T08:00:00Z", expiresAt: null, redeemedAt: null, redeemBranchId: "asmak", redeemBranchName: "Asmak", ...over,
});

describe("vouchers", () => {
  const now = Date.parse("2026-11-25T10:00:00Z");
  it("knows ready, used, expired and cancelled", () => {
    expect(voucherState(voucher(), now)).toBe("ready");
    expect(voucherState(voucher({ status: "redeemed" }), now)).toBe("used");
    expect(voucherState(voucher({ status: "void" }), now)).toBe("cancelled");
    expect(voucherState(voucher({ expiresAt: "2026-11-24T00:00:00Z" }), now)).toBe("expired");
  });

  it("can be redeemed only where it is meant for", () => {
    expect(redeemableHere(voucher(), "asmak", now)).toBe(true);
    expect(redeemableHere(voucher(), "sanad", now)).toBe(false);
    expect(redeemableHere(voucher({ redeemBranchId: null }), "sanad", now)).toBe(true);
    expect(redeemableHere(voucher({ status: "redeemed" }), "asmak", now)).toBe(false);
  });

  it("puts the ready one first and shows it on the pass; a used one never shows", () => {
    const list = [voucher({ id: "old", status: "redeemed" }), voucher({ id: "later", expiresAt: "2027-01-01T00:00:00Z" }), voucher({ id: "soon", expiresAt: "2026-12-01T00:00:00Z" })];
    expect(sortVouchers(list, now).map((v) => v.id)).toEqual(["soon", "later", "old"]);
    expect(passVoucher(list, now)?.id).toBe("soon");
    expect(passVoucher([voucher({ status: "redeemed" })], now)).toBeNull();
  });
});

const guest = (over: Partial<AutoGuest> = {}): AutoGuest => ({ cardId: "c1", firstName: "Maryam", consentNews: true, deleted: false, birthDay: null, birthMonth: null, lastVisit: null, ...over });

describe("automatic notices", () => {
  it("uses the Bahrain day, not the UTC day", () => {
    expect(bahrainDate(Date.parse("2026-11-25T22:30:00Z"))).toMatchObject({ day: 26, month: 11, year: 2026 });
  });

  it("greets a birthday once, with the guest's first name, only with consent", () => {
    const now = Date.parse("2026-03-07T06:00:00Z");
    const due = dueBirthdays([
      guest({ cardId: "a", birthDay: 7, birthMonth: 3 }),
      guest({ cardId: "b", birthDay: 8, birthMonth: 3 }),
      guest({ cardId: "c", birthDay: 7, birthMonth: 3, consentNews: false }),
      guest({ cardId: "d", birthDay: 7, birthMonth: 3, deleted: true }),
      guest({ cardId: "e" }),
    ], DEFAULT_MESSAGES.birthday, now);
    expect(due).toEqual([{ cardId: "a", kind: "birthday", period: "2026", message: "Happy birthday, Maryam. Come in and celebrate with us." }]);
    expect(dueBirthdays([guest({ birthDay: 7, birthMonth: 3 })], { ...DEFAULT_MESSAGES.birthday, enabled: false }, now)).toEqual([]);
  });

  it("greets 29 February on the 28th when the year has no 29th", () => {
    const born = [guest({ birthDay: 29, birthMonth: 2 })];
    expect(dueBirthdays(born, DEFAULT_MESSAGES.birthday, Date.parse("2027-02-28T06:00:00Z"))).toHaveLength(1);
    expect(dueBirthdays(born, DEFAULT_MESSAGES.birthday, Date.parse("2028-02-28T06:00:00Z"))).toHaveLength(0);
    expect(dueBirthdays(born, DEFAULT_MESSAGES.birthday, Date.parse("2028-02-29T06:00:00Z"))).toHaveLength(1);
  });

  it("misses a guest after 14 quiet days, once per quiet spell, and never someone who never came", () => {
    const now = Date.parse("2026-11-25T06:00:00Z");
    const ago = (d: number) => new Date(now - d * DAY).toISOString();
    const due = dueWinbacks([
      guest({ cardId: "13d", lastVisit: ago(13) }),
      guest({ cardId: "14d", lastVisit: ago(14.2) }),
      guest({ cardId: "20d", lastVisit: ago(20) }),
      guest({ cardId: "long", lastVisit: ago(90) }),
      guest({ cardId: "never" }),
      guest({ cardId: "no-consent", lastVisit: ago(15), consentNews: false }),
    ], DEFAULT_MESSAGES.winback, now);
    expect(due.map((d) => d.cardId)).toEqual(["14d", "20d"]);
    // The period is the day of the last visit: the unique key in message_log stops a second notice for the same spell.
    expect(due[0].period).toBe(ago(14.2).slice(0, 10));
  });

  it("keeps a notice on the card for a week", () => {
    const now = Date.parse("2026-11-25T06:00:00Z");
    const log = [{ message: "old", sent_at: new Date(now - 9 * DAY).toISOString() }, { message: "new", sent_at: new Date(now - 2 * DAY).toISOString() }];
    expect(liveNotice(log, now)?.message).toBe("new");
    expect(liveNotice([log[0]], now)).toBeNull();
  });
});

const branch = (over: Partial<Branch> & { id: string }): Branch => ({ slug: over.id, name: over.id, nameAr: null, kind: "branch", address: null, phone: null, mapsUrl: null, reviewUrl: null, menuUrl: null, lat: null, lng: null, active: true, ...over });

describe("branches", () => {
  const sanad = branch({ id: "sanad", lat: 26.1, lng: 50.5 });
  const zallaq = branch({ id: "zallaq" });
  const asmak = branch({ id: "asmak", kind: "partner", lat: 26.2, lng: 50.6 });

  it("puts only places with a map pin on the pass, own branches first, never more than Apple allows", () => {
    expect(passLocations([asmak, zallaq, sanad], "Al Roshinah").map((l) => l.latitude)).toEqual([26.1, 26.2]);
    const many = Array.from({ length: 14 }, (_, i) => branch({ id: `b${i}`, lat: 26 + i / 100, lng: 50 }));
    expect(passLocations(many, "X")).toHaveLength(MAX_PASS_LOCATIONS);
    expect(passLocations([branch({ id: "off", lat: 1, lng: 1, active: false })], "X")).toEqual([]);
  });

  it("keeps a till to its own branch and makes the owner choose", () => {
    const all = [sanad, zallaq, asmak];
    expect(workingBranch("sanad", null, all)).toBe("sanad");
    expect(workingBranch("sanad", "zallaq", all)).toBe("forbidden");
    expect(workingBranch(null, null, all)).toBe("choose");
    expect(workingBranch(null, "zallaq", all)).toBe("zallaq");
    expect(workingBranch(null, "elsewhere", all)).toBe("forbidden");
    expect(workingBranch(null, null, [sanad])).toBe("sanad");
    expect(workingBranch(null, null, [])).toBeNull();
    expect(workingBranch("closed", null, [sanad])).toBe("forbidden");
  });

  it("reads a database row", () => {
    expect(toBranch({ id: "1", slug: "sanad", name: "Sanad", kind: "partner", lat: "26.15", lng: 50.6, active: true })).toMatchObject({ kind: "partner", lat: 26.15, lng: 50.6, address: null });
  });
});

describe("Al Roshinah seed (supabase/seeds/roshinah.sql)", () => {
  it("runs twice on the migrations: one business, Sanad live, Zallaq waiting, Asmak as the redeem counter", async () => {
    const dir = join(__dirname, "../../supabase/migrations");
    const db = new PGlite();
    await db.exec(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8").replace(/create extension if not exists pgcrypto;/i, ""));
    const seed = readFileSync(join(dir, "../seeds/roshinah.sql"), "utf8");
    await db.exec(seed);
    await db.exec(seed);
    const q = async <T>(sql: string) => (await db.query<T>(sql)).rows;
    expect(await q("select card_mode, join_fields from venues where slug = 'roshinah'")).toEqual([{ card_mode: "visits", join_fields: ["mobile", "email", "birthday"] }]);
    expect(await q("select slug, kind, active from branches order by sort")).toEqual([
      { slug: "sanad", kind: "branch", active: true }, { slug: "zallaq", kind: "branch", active: false }, { slug: "asmak", kind: "partner", active: true },
    ]);
    expect(await q("select v.trigger, b.slug from vouchers v join branches b on b.id = v.redeem_branch_id")).toEqual([{ trigger: "first_visit", slug: "asmak" }]);
    expect((await q("select kind from auto_messages order by kind")).length).toBe(2);
  });
});
