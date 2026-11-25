import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Staff } from "../src/lib/staffAuth";

// The whole visit-card journey through the REAL route handlers, on the app's own sample data (lib/fakeDb.ts in visit
// mode): a guest joins, the Sanad till records the visit, the gift unlocks, the partner counter uses it once, and the
// owner sees it all. Every "cannot" sits next to the "can" it protects. Invented data only.

const h = vi.hoisted(() => {
  process.env.LOYALTY_FAKE_DB = "1";
  process.env.SAMPLE_CARD_MODE = "visits";
  process.env.SAMPLE_BRANCHES = "Sanad,Zallaq Springs";
  process.env.SAMPLE_PARTNER = "Asmak";
  process.env.BRAND_DEFAULT_VENUE = "roshinah";
  process.env.BRAND_NAME = "Al Roshinah";
  process.env.STAFF_SESSION_SECRET = "test-secret-test-secret-test-secret-0123";
  return { staff: null as Staff | null };
});

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/apns", () => ({ notifyAppleTokens: async () => 0, notifyAppleDevices: async () => {} }));
vi.mock("../src/lib/googleWallet", () => ({ googleWalletConfigured: () => false, updatePoints: async () => {} }));

import { db } from "../src/lib/supabase";
import { qrMessage } from "../src/lib/cardQr";
import { runDailyMessages } from "../src/lib/autoMessagesDb";
import { bahrainDate } from "../src/lib/autoMessages";
import { POST as join } from "../src/app/api/join/route";
import { GET as staffCard } from "../src/app/api/staff/card/route";
import { GET as staffBranches } from "../src/app/api/staff/branches/route";
import { POST as visit } from "../src/app/api/staff/visit/route";
import { POST as redeem } from "../src/app/api/staff/voucher/redeem/route";
import { GET as ownerBranches, POST as saveBranch } from "../src/app/api/owner/branches/route";
import { GET as ownerVouchers, POST as saveVoucher } from "../src/app/api/owner/vouchers/route";
import { POST as voidVoucher } from "../src/app/api/owner/vouchers/void/route";
import { GET as ownerMessages, POST as saveMessage } from "../src/app/api/owner/auto-messages/route";
import { GET as activity } from "../src/app/api/owner/activity/route";
import { GET as exportGuests } from "../src/app/api/owner/export/route";
import { GET as team, PATCH as moveTeam } from "../src/app/api/owner/team/route";
import { GET as cron } from "../src/app/api/cron/daily/route";
import { GET as guestGifts, POST as giveGift } from "../src/app/api/owner/guests/gifts/route";
import { GET as recent } from "../src/app/api/staff/recent/route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VENUE = id(1), SANAD = id(500), ZALLAQ = id(501), ASMAK = id(590);
const person = (n: number, role: Staff["role"], branchId: string | null): Staff => ({ id: id(n), name: role, role, venueId: VENUE, venueSlug: "roshinah", venueName: "Al Roshinah", branchId });
const OWNER = person(900, "owner", null);
const SANAD_TILL = person(902, "staff", SANAD);
const ASMAK_TILL = person(903, "staff", ASMAK);
const MANAGER = person(910, "manager", null);
const OUTSIDER: Staff = { id: id(999), name: "x", role: "owner", venueId: id(2), venueSlug: "other", venueName: "Other", branchId: null };

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://test.local/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.1.1.1", ...headers }, body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://test.local/api", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const lookup = (code: string) => staffCard(new Request(`http://test.local/api/staff/card?code=${encodeURIComponent(code)}`));
const text = async (r: Response) => (await r.json()).error as string;

let cardId = "", code = "", qr = "", gift = "";

beforeAll(async () => {
  await db().from("staff_users").insert({ id: MANAGER.id, venue_id: VENUE, name: "Manager", role: "manager", active: true, branch_id: null });
});

describe("a guest joins", () => {
  const form = { venue: "roshinah", name: "Maryam Test", mobile: "+973 3600 0001", email: "maryam@example.test", birthday: "07/03", terms: true, news: true, branch: "sanad" };

  it("needs the fields this venue asks for, and a real date when a birthday is given", async () => {
    expect((await (await join(post({ ...form, email: "" }))).json()).code).toBe("email_required");
    expect((await (await join(post({ ...form, mobile: "" }))).json()).code).toBe("contact_required");
    expect((await (await join(post({ ...form, birthday: "31/02" }))).json()).code).toBe("bad_birthday");
    expect((await join(post({ ...form, terms: false }))).status).toBe(400);
  });

  it("gets a card; the birthday (optional) and the branch they joined at are kept", async () => {
    const r = await join(post(form));
    expect(r.status).toBe(200);
    cardId = (await r.json()).cardId;
    const { data: card } = await db().from("cards").select("id, code, member_id, joined_branch").eq("id", cardId).single();
    code = card!.code as string;
    qr = qrMessage("roshinah", code, cardId);
    expect(card!.joined_branch).toBe(SANAD);
    const { data: member } = await db().from("members").select("birth_day, birth_month, email").eq("id", card!.member_id).single();
    expect(member).toMatchObject({ birth_day: 7, birth_month: 3, email: "maryam@example.test" });
    const noBirthday = await join(post({ ...form, mobile: "+973 3600 0002", email: "b@example.test", birthday: "" }));
    expect(noBirthday.status).toBe(200);
  });

  it("cannot join twice with the same mobile or email", async () => {
    expect((await join(post(form))).status).toBe(409);
    expect((await join(post({ ...form, mobile: "+973 3600 0099" }))).status).toBe(409);
  });
});

describe("the Sanad till", () => {
  it("is signed out without a session", async () => {
    h.staff = null;
    expect((await lookup(code)).status).toBe(401);
    expect((await visit(post({ cardId, branchId: SANAD }))).status).toBe(401);
  });

  it("works at its own branch only", async () => {
    h.staff = SANAD_TILL;
    const b = await (await staffBranches()).json();
    expect(b).toEqual({ fixed: true, branches: [{ id: SANAD, name: "Sanad", nameAr: null, kind: "branch" }] });
    expect(await text(await visit(post({ cardId, branchId: ZALLAQ })))).toMatch(/not signed in for that branch/);
  });

  it("finds the guest by scan (verified) or by typed code (not verified), and refuses a made-up QR", async () => {
    const scanned = await (await lookup(qr)).json();
    expect(scanned).toMatchObject({ cardId, firstName: "Maryam", visitMode: true, visits: 0, vouchers: [], verified: true });
    expect(scanned.phone ?? scanned.email).toBeUndefined();
    expect((await (await lookup(code)).json()).verified).toBe(false);
    expect((await lookup(`LOYALTY:roshinah:${code}:AAAAAAAAAAAAAAAA`)).status).toBe(404);
    expect((await lookup(`LOYALTY:other-venue:${code}`)).status).toBe(404);
  });

  it("records the visit once and the gift unlocks", async () => {
    const r = await visit(post({ cardId }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ visits: 1, vouchersIssued: 1 });
    expect(body.guest.vouchers).toHaveLength(1);
    gift = body.guest.vouchers[0].id;
    expect(body.guest.vouchers[0]).toMatchObject({ status: "issued", redeemBranchId: ASMAK, redeemBranchName: "Asmak" });
    expect(await text(await visit(post({ cardId })))).toBe("Visit already recorded.");
  });

  it("cannot use the Asmak gift here, even with the guest's own QR", async () => {
    expect(await text(await redeem(post({ cardId, cardVoucherId: gift, qr })))).toBe("Voucher cannot be used at this branch.");
  });
});

describe("the Asmak counter (partner)", () => {
  it("cannot record visits", async () => {
    h.staff = ASMAK_TILL;
    expect(await text(await visit(post({ cardId })))).toBe("Visits cannot be recorded at this counter.");
  });

  it("cannot use a gift from a typed code, a made-up QR, another guest's QR or another card's voucher", async () => {
    expect((await redeem(post({ cardId, cardVoucherId: gift }))).status).toBe(403);
    expect((await redeem(post({ cardId, cardVoucherId: gift, qr: `LOYALTY:roshinah:${code}` }))).status).toBe(403);
    expect((await redeem(post({ cardId, cardVoucherId: gift, qr: `LOYALTY:roshinah:${code}:AAAAAAAAAAAAAAAA` }))).status).toBe(403);
    const { data: other } = await db().from("card_vouchers").select("id, card_id").eq("status", "issued").neq("card_id", cardId).limit(1);
    expect((await redeem(post({ cardId, cardVoucherId: other![0].id, qr }))).status).toBe(404);
  });

  it("uses it once with the guest's QR, then never again", async () => {
    const r = await redeem(post({ cardId, cardVoucherId: gift, qr }));
    expect(r.status).toBe(200);
    expect((await r.json()).guest.vouchers[0].status).toBe("redeemed");
    expect(await text(await redeem(post({ cardId, cardVoucherId: gift, qr })))).toBe("Voucher already used.");
    h.staff = OWNER;
    expect(await text(await redeem(post({ cardId, cardVoucherId: gift, branchId: ASMAK })))).toBe("Voucher already used.");
  });
});

describe("the owner", () => {
  it("sees the places, the gift with its numbers, and who did what", async () => {
    h.staff = OWNER;
    const places = (await (await ownerBranches()).json()).branches;
    expect(places.map((b: { name: string; kind: string }) => [b.name, b.kind])).toEqual([["Sanad", "branch"], ["Zallaq Springs", "branch"], ["Asmak", "partner"]]);
    const [v] = (await (await ownerVouchers()).json()).vouchers;
    expect(v.counts.issued).toBeGreaterThan(v.counts.redeemed);
    expect(v.counts.redeemed).toBeGreaterThan(0);
    const log = (await (await activity()).json()).activity as { what: string; who: string; branch: string | null; extra: string | null }[];
    expect(log.find((a) => a.what === "Used a guest's voucher")).toMatchObject({ who: "Asmak till", branch: "Asmak" });
    expect(log.find((a) => a.what === "Recorded a visit")).toMatchObject({ who: "Sample staff", branch: "Sanad", extra: "A gift was unlocked" });
  });

  it("adds a branch with a map pin, and a half pin or a non-Google review link is refused", async () => {
    expect((await saveBranch(post({ name: "Riffa", lat: 26.13 }))).status).toBe(400);
    expect((await saveBranch(post({ name: "Riffa", reviewUrl: "https://evil.example/review" }))).status).toBe(400);
    const r = await saveBranch(post({ name: "Riffa", lat: 26.13, lng: 50.555, reviewUrl: "https://g.page/r/abc/review" }));
    expect(r.status).toBe(200);
    expect((await r.json()).branch).toMatchObject({ slug: "riffa", lat: 26.13, lng: 50.555, kind: "branch" });
  });

  it("adds a second gift, changes the wording of a notice, and moves a till to another branch", async () => {
    expect((await saveVoucher(post({ title: "Free karak", trigger: "manual", redeemBranchId: id(12345) }))).status).toBe(400);
    expect((await saveVoucher(post({ title: "Free karak", trigger: "manual", validDays: 30 }))).status).toBe(200);
    expect((await (await ownerVouchers()).json()).vouchers).toHaveLength(2);
    expect((await saveMessage(post({ kind: "winback", enabled: true, textEn: "Come back, {name}.", days: 21 }))).status).toBe(200);
    expect((await (await ownerMessages()).json()).winback).toMatchObject({ days: 21, textEn: "Come back, {name}." });
    expect((await moveTeam(patch({ id: SANAD_TILL.id, branchId: id(424242) }))).status).toBe(400);
    expect((await moveTeam(patch({ id: SANAD_TILL.id, branchId: ZALLAQ }))).status).toBe(200);
    const rows = (await (await team()).json()).team as { id: string; branchId: string | null }[];
    expect(rows.find((t) => t.id === SANAD_TILL.id)?.branchId).toBe(ZALLAQ);
    await moveTeam(patch({ id: SANAD_TILL.id, branchId: SANAD }));
  });

  it("can cancel a gift that was unlocked by mistake; a used one stays used", async () => {
    const { data: waiting } = await db().from("card_vouchers").select("id").eq("status", "issued").limit(1);
    expect((await voidVoucher(post({ cardVoucherId: waiting![0].id }))).status).toBe(200);
    expect((await voidVoucher(post({ cardVoucherId: gift }))).status).toBe(400);
  });

  it("gives a guest a gift by hand, once, and it shows on that guest's card only", async () => {
    h.staff = OWNER;
    const list = () => guestGifts(new Request(`http://test.local/api/owner/guests/gifts?cardId=${cardId}`));
    const before = await (await list()).json();
    expect(before.gifts).toHaveLength(1);
    expect(before.canGive.map((g: { title: string }) => g.title)).toEqual(["Free karak"]);
    const karak = before.canGive[0].id;
    expect((await giveGift(post({ cardId, voucherId: karak }))).status).toBe(200);
    expect((await giveGift(post({ cardId, voucherId: karak }))).status).toBe(409);
    expect((await giveGift(post({ cardId, voucherId: id(777777) }))).status).toBe(404);
    const after = await (await list()).json();
    expect(after.gifts.map((g: { title: string; status: string }) => [g.title, g.status]).sort()).toEqual([["50% off at Asmak", "redeemed"], ["Free karak", "issued"]]);
    expect(after.canGive).toEqual([]);
    h.staff = OUTSIDER;
    expect((await list()).status).toBe(404);
    expect((await giveGift(post({ cardId, voucherId: karak }))).status).toBe(404);
    h.staff = SANAD_TILL;
    expect((await giveGift(post({ cardId, voucherId: karak }))).status).toBe(403);
  });

  it("the till's day counts gifts used, so a counter that only takes gifts does not read zero", async () => {
    h.staff = ASMAK_TILL;
    const day = await (await recent()).json();
    expect(day.mine).toMatchObject({ entries: 1, guests: 1 });
    expect(day.items.some((i: { kind: string }) => i.kind === "gift")).toBe(true);
    h.staff = SANAD_TILL;
    // The sample's own visits today are this till's too, so at least the one recorded above.
    expect((await (await recent()).json()).mine.entries).toBeGreaterThanOrEqual(1);
  });

  it("only the owner changes settings and downloads the guest list", async () => {
    h.staff = MANAGER;
    expect((await saveBranch(post({ name: "Nope" }))).status).toBe(403);
    expect((await saveVoucher(post({ title: "Nope" }))).status).toBe(403);
    expect((await saveMessage(post({ kind: "birthday", enabled: false, textEn: "x" }))).status).toBe(403);
    expect((await exportGuests()).status).toBe(403);
    expect((await activity()).status).toBe(403);
    h.staff = SANAD_TILL;
    expect((await ownerBranches()).status).toBe(403);
    h.staff = OWNER;
    const csv = await exportGuests();
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("Maryam Test");
  });

  it("an owner of another venue sees none of it and can touch none of it", async () => {
    h.staff = OUTSIDER;
    expect((await (await ownerBranches()).json()).branches).toEqual([]);
    expect((await (await ownerVouchers()).json()).vouchers).toEqual([]);
    expect((await (await activity()).json()).activity).toEqual([]);
    expect((await voidVoucher(post({ cardVoucherId: gift }))).status).toBe(404);
    expect((await saveBranch(post({ id: SANAD, name: "Hijacked" }))).status).toBe(404);
    expect((await lookup(code)).status).toBe(404);
  });
});

describe("the daily job", () => {
  it("is closed without its secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await cron(new Request("http://test.local/api/cron/daily"))).status).toBe(404);
    process.env.CRON_SECRET = "cron-secret-for-tests";
    expect((await cron(new Request("http://test.local/api/cron/daily"))).status).toBe(401);
    expect((await cron(new Request("http://test.local/api/cron/daily", { headers: { authorization: "Bearer wrong-secret-for-tests" } }))).status).toBe(401);
    expect((await cron(new Request("http://test.local/api/cron/daily", { headers: { authorization: "Bearer cron-secret-for-tests" } }))).status).toBe(200);
  });

  it("greets a birthday once, however often it runs", async () => {
    const today = bahrainDate();
    const { data: card } = await db().from("cards").select("member_id").eq("id", cardId).single();
    await db().from("members").update({ birth_day: today.day, birth_month: today.month }).eq("id", card!.member_id);
    await db().from("message_log").delete().eq("card_id", cardId);
    await runDailyMessages();
    const { data: first } = await db().from("message_log").select("kind, message").eq("card_id", cardId);
    expect(first).toEqual([{ kind: "birthday", message: "Happy birthday, Maryam. Come in and celebrate with us." }].map((m) => expect.objectContaining(m)));
    await runDailyMessages();
    const { data: again } = await db().from("message_log").select("id").eq("card_id", cardId);
    expect(again).toHaveLength(1);
  });
});
