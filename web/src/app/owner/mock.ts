// DEVELOPMENT-ONLY fake backend for the owner screens (see api.ts for how it is switched on and why it can never run in production).
// Everything here is invented: names, numbers, texts. Changes live only in memory and vanish on reload.
import type { Audience, DeletionRequest, Guest, Member, Offer, Offers, Points, PointsRange, Privacy, Res, Rules, Summary } from "./types";

const DAY = 86_400_000;
const iso = (daysAgo: number, hoursAgo = 0) => new Date(Date.now() - daysAgo * DAY - hoursAgo * 3_600_000).toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A small seeded generator so the guest list looks the same on every reload.
function lcg(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const FIRST = ["Sara", "Omar", "Noor", "Khalid", "Fatima", "Yusuf", "Lina", "Hamad", "Maryam", "Ali", "Layla", "Ahmed", "Zainab", "Hassan", "Dana", "Mohamed", "Aisha", "Faisal", "Reem", "Jasim", "Huda", "Abdulla", "Mariam", "Tariq", "Amal", "Nasser"];
const LAST = ["Hasan", "Khaled", "Mansoor", "Ebrahim", "Farooq", "Salman", "Jaber", "Rashid", "Matar", "Saleh", "Isa", "Taher", "Yaqoob", "Darwish", "Hussain", "Marhoon", "Al Zayani", "Al Aali"];

function makeGuests(): (Guest & { news: boolean })[] {
  const head: [string, number, number, number][] = [
    ["Sara Hasan", 8, 320, 0], ["Omar Khaled", 1, 40, 3], ["Noor Ali", 12, 500, 1], ["Khalid Mansoor", 9, 410, 1], ["Fatima Al Zayani", 6, 260, 4],
    ["Yusuf Ebrahim", 4, 160, 6], ["Lina Farooq", 15, 640, 0], ["Hamad Salman", 3, 120, 8], ["Maryam Jaber", 7, 300, 2], ["Ali Rashid", 2, 70, 9],
  ];
  const rnd = lcg(42);
  const out = head.map(([name, visits, points, last], i) => ({ name, visits, points, last, joined: 20 + i * 11 }));
  while (out.length < 248) {
    const name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
    const visits = 1 + Math.floor(rnd() * rnd() * 14);
    out.push({ name, visits, points: visits * (30 + Math.floor(rnd() * 20)), last: Math.floor(rnd() * 40), joined: Math.floor(rnd() * 200) });
  }
  return out.map((g, i) => ({
    cardId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    code: String(1000 + ((i * 7919) % 9000)),
    name: g.name,
    points: g.points,
    visits: g.visits,
    lastVisit: iso(g.last, 2 + (i % 9)),
    joined: iso(i < 9 ? i : g.joined),
    news: i % 7 !== 3 && i !== 0,
  }));
}

const state = {
  rules: { pointsPerBhd: 2, rewardGoal: 500, rewardText: "A dessert of your choice" } as Rules,
  visits: [31, 38, 29, 44, 62, 71, 58, 36, 41, 33, 47, 66, 79, 52],
  // The real list is newest visit first.
  guests: makeGuests().sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "")),
  team: [
    { id: "t1", name: "Demo owner", role: "owner", active: true, hasPin: true, me: true },
    { id: "t2", name: "Reem", role: "manager", active: true, hasPin: true, me: false },
    { id: "t3", name: "Ahmed", role: "staff", active: true, hasPin: true, me: false },
    { id: "t4", name: "Faisal", role: "staff", active: false, hasPin: true, me: false },
  ] as Member[],
  // Newest first. Every state of "Sent offers" can be seen here:
  //   o1 recent and live            -> Edit and resend + Withdraw
  //   o3 withdrawn (inside 14 days) -> "Withdrawn" tag, no actions
  //   o4 live, 11 days old, Apple only -> Edit and resend + Withdraw; its FIRST withdraw attempt fails (to see the retry state)
  //   o2 19 days old, never withdrawn -> Edit and resend only (past the 14 days)
  offers: [
    { id: "o1", message: "Double points this Friday, from 7 pm.", audience: "all", sentAt: iso(1, 3), recipients: 212, withdrawnAt: null },
    { id: "o3", message: "Half price on all desserts tonight. Show this message at the table.", audience: "google", sentAt: iso(4), recipients: 81, withdrawnAt: iso(3, 20) },
    { id: "o4", message: "Live music in the garden this Thursday. Table bookings are open.", audience: "apple", sentAt: iso(11), recipients: 131, withdrawnAt: null },
    { id: "o2", message: "Our new autumn menu starts on Sunday. Ask for it at the table.", audience: "apple", sentAt: iso(19), recipients: 131, withdrawnAt: null },
  ] as Offer[],
  nextOfferId: 5,
  // Ids whose next withdraw call fails once (development only), to try "the original could not be withdrawn".
  failWithdrawOnce: new Set<string>(["o4"]),
  requests: [
    { id: "r1", cardId: "00000000-0000-4000-8000-0000000000a1", label: "Guest from 12 Oct", requestedAt: iso(2), status: "pending" },
    { id: "r2", cardId: "00000000-0000-4000-8000-0000000000a2", label: "Guest from 3 Oct", requestedAt: iso(0, 3), status: "pending" },
    { id: "r3", cardId: "00000000-0000-4000-8000-0000000000a3", label: "Guest from 29 Sep", requestedAt: iso(9), status: "erased" },
  ] as DeletionRequest[],
  terms: {
    text: "Sample text from the development mock\nNot real terms. The real standard terms come from the back end.\n\nYour card\nThe card belongs to the guest and cannot be sold.\n\nPoints\nPoints are added when the guest pays at the venue. The venue may change the rules for future visits.\n\nYour data\nA guest can ask for their details to be erased at any time.",
    updatedAt: null as string | null,
    isDefault: true,
  },
};

const bahrainToday = () => new Date(Date.now() + 3 * 3_600_000);
function perDay14(): Summary["perDay14"] {
  const today = bahrainToday().getTime();
  return state.visits.map((visits, i) => ({ day: new Date(today - (13 - i) * DAY).toISOString().slice(0, 10), visits }));
}

// Invented points history for the "Points given out" sheet: 120 days, oldest first, today last.
// The last 14 days reuse the visits shown on the Overview, so the two screens agree with each other.
const HISTORY_DAYS = 120;
type HistoryDay = { day: string; visits: number; bill: number; issued: number; rewards: number; redeemed: number };
let historyCache: HistoryDay[] | null = null;
function history(): HistoryDay[] {
  if (historyCache) return historyCache;
  const rnd = lcg(7);
  const today = bahrainToday().getTime();
  historyCache = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const back = HISTORY_DAYS - 1 - i;
    const visits = back < 14 ? state.visits[13 - back] : 22 + Math.floor(rnd() * 52);
    const bill = Math.round(visits * (4.2 + rnd() * 3.4) * 1000) / 1000;
    const rewards = rnd() < 0.42 ? 1 + Math.floor(rnd() * 2) : 0;
    return { day: new Date(today - back * DAY).toISOString().slice(0, 10), visits, bill, issued: Math.round(bill * 2), rewards, redeemed: rewards * 500 };
  });
  return historyCache;
}

function points(range: PointsRange): Points {
  const length = { today: 1, "7d": 7, "30d": 30, all: HISTORY_DAYS }[range];
  const part = history().slice(-length);
  const sum = (f: (d: HistoryDay) => number) => part.reduce((t, d) => t + f(d), 0);
  const chart = range === "all" ? history().slice(-90) : part;
  return {
    range,
    from: part[0].day,
    to: part[part.length - 1].day,
    issued: sum((d) => d.issued),
    redeemed: sum((d) => d.redeemed),
    rewards: sum((d) => d.rewards),
    visits: sum((d) => d.visits),
    billBhd: Math.round(sum((d) => d.bill) * 1000) / 1000,
    held: state.guests.reduce((t, g) => t + g.points, 0),
    perDay: chart.map((d) => ({ day: d.day, issued: d.issued, redeemed: d.redeemed })),
  };
}

function summary(): Summary {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    members: state.guests.length,
    newThisWeek: state.guests.filter((g) => Date.now() - new Date(g.joined).getTime() < 7 * DAY).length,
    visits7d: sum(state.visits.slice(7)),
    visitsPrev7d: sum(state.visits.slice(0, 7)),
    pointsHeld: sum(state.guests.map((g) => g.points)),
    rewards30d: history().slice(-30).reduce((t, d) => t + d.rewards, 0),
    perDay14: perDay14(),
  };
}

function offersList(): Offers {
  return { eligible: state.guests.filter((g) => g.news).length, total: state.guests.length, offers: state.offers.map((o) => ({ ...o })) };
}

const ME = { name: "Demo owner", role: "owner", venue: "Demo Venue" };

/** Same paths, methods and JSON shapes as the real owner API (docs/OWNER-APP-CONTRACT.md). */
export async function mockApi<T>(path: string, method: string, body: unknown): Promise<Res<T>> {
  if (process.env.NODE_ENV === "production") return { ok: false, error: "Mock data only exists in development.", status: 500 };
  await wait(140);
  const ok = (data: unknown) => ({ ok: true, data }) as unknown as Res<T>;
  const bad = (error: string, status = 400) => ({ ok: false, error, status }) as Res<T>;
  const url = new URL(path, "http://mock.local");
  const p = url.pathname;
  const b = (body ?? {}) as Record<string, unknown>;
  const m = method.toUpperCase();

  if (p === "/api/staff/pin-login" && m === "POST") {
    const pin = String(b.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) return bad("Enter your PIN (4 to 8 digits).");
    if (/^0+$/.test(pin)) return bad("That PIN is not right.", 401);
    return ok(pin.length >= 6 ? ME : { name: "Ahmed", role: "staff", venue: "Demo Venue" });
  }
  if (p.startsWith("/api/staff/") && p !== "/api/staff/logout") {
    type G = { cardId: string; firstName: string; code: string; points: number; visits: number; goal: number; rewardText: string; rewardReady: boolean };
    type Ent = { id: number; kind: string; points: number; billBhd: number | null; at: string; by: string; guest: string };
    type Perk = { id: string; title: string; note: string | null; validUntil: string | null; from: string };
    const g = globalThis as unknown as { __st?: { guests: G[]; log: Ent[]; perks: Perk[]; n: number } };
    const mk = (cardId: string, firstName: string, code: string, points: number, visits: number): G => ({ cardId, firstName, code, points, visits, goal: 500, rewardText: "A dessert of your choice", rewardReady: points >= 500 });
    const s = (g.__st ??= {
      guests: [mk("c1", "Ann", "4821", 380, 12), mk("c2", "Khalid", "5555", 520, 21), mk("c3", "Maryam", "1357", 40, 2)],
      log: [
        { id: 3, kind: "earn", points: 24, billBhd: 12, at: new Date(Date.now() - 1_500_000).toISOString(), by: "Ahmed", guest: "Maryam" },
        { id: 2, kind: "earn", points: 41, billBhd: 20.5, at: new Date(Date.now() - 3_600_000).toISOString(), by: "Ahmed", guest: "Ann" },
        { id: 1, kind: "redeem", points: -500, billBhd: null, at: new Date(Date.now() - 7_200_000).toISOString(), by: "Reem", guest: "Omar" },
      ],
      perks: [{ id: "sp1", title: "Free meal after your shift", note: "Thank you for a great Friday", validUntil: null, from: "Demo Venue" }],
      n: 3,
    });
    const view = (x: G): G => ({ ...x, rewardReady: x.points >= x.goal });
    if (p === "/api/staff/card" && m === "GET") {
      const x = s.guests.find((q) => q.code === url.searchParams.get("code"));
      return x ? ok(view(x)) : bad("No card with that code at this venue.", 404);
    }
    if (p === "/api/staff/earn" && m === "POST") {
      const x = s.guests.find((q) => q.cardId === b.cardId);
      const bill = Number(b.billBhd);
      if (!x || !(bill > 0)) return bad("Enter the bill amount.");
      const added = Math.floor(bill * 2);
      x.points += added; x.visits += 1; s.n += 1;
      s.log.unshift({ id: s.n, kind: "earn", points: added, billBhd: bill, at: new Date().toISOString(), by: "You", guest: x.firstName });
      return ok({ guest: view(x), ledgerId: s.n, added });
    }
    if (p === "/api/staff/redeem" && m === "POST") {
      const x = s.guests.find((q) => q.cardId === b.cardId);
      if (!x || x.points < x.goal) return bad("Not enough points.");
      x.points -= x.goal; s.n += 1;
      s.log.unshift({ id: s.n, kind: "redeem", points: -x.goal, billBhd: null, at: new Date().toISOString(), by: "You", guest: x.firstName });
      return ok({ guest: view(x), ledgerId: s.n });
    }
    if (p === "/api/staff/undo" && m === "POST") {
      const e = s.log.find((q) => q.id === b.ledgerId);
      const x = e && s.guests.find((q) => q.firstName === e.guest);
      if (!e || !x) return bad("Nothing to undo.");
      x.points -= e.points; s.log = s.log.filter((q) => q !== e);
      return ok({ guest: view(x) });
    }
    if (p === "/api/staff/recent" && m === "GET") return ok({ items: s.log });
    if (p === "/api/staff/perks" && m === "GET") return ok({ perks: s.perks });
    if (p === "/api/staff/perks" && m === "POST") {
      const had = s.perks.length;
      s.perks = s.perks.filter((q) => q.id !== b.id);
      return s.perks.length < had ? ok({ ok: true }) : bad("That reward is not available any more.", 404);
    }
  }
  if (p === "/api/staff/login" && m === "POST") return ok(ME);
  if (p === "/api/staff/logout" && m === "POST") return ok({ ok: true });

  if (p === "/api/owner/summary" && m === "GET") return ok(summary());

  if (p === "/api/owner/points" && m === "GET") {
    const range = url.searchParams.get("range") ?? "7d";
    if (range !== "today" && range !== "7d" && range !== "30d" && range !== "all") return bad("Choose a range: today, 7d, 30d or all.");
    return ok(points(range));
  }

  if (p === "/api/owner/guests") {
    if (m === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const guests: Guest[] = state.guests
        .filter((g) => !q || g.name.toLowerCase().includes(q) || g.code.includes(q))
        .map((g) => ({ cardId: g.cardId, code: g.code, name: g.name, points: g.points, visits: g.visits, lastVisit: g.lastVisit, joined: g.joined }));
      return ok({ guests });
    }
    if (m === "DELETE") {
      const i = state.guests.findIndex((g) => g.cardId === b.cardId);
      if (i < 0) return bad("Guest not found.", 404);
      state.guests.splice(i, 1);
      return ok({ deleted: true });
    }
  }

  if (p === "/api/owner/rules") {
    if (m === "GET") return ok(state.rules);
    if (m === "POST") {
      const r = b as unknown as Rules;
      const text = String(r.rewardText ?? "").trim();
      if (!Number.isInteger(r.pointsPerBhd) || r.pointsPerBhd < 1 || r.pointsPerBhd > 100 || !Number.isInteger(r.rewardGoal) || r.rewardGoal < 10 || r.rewardGoal > 100000 || text.length < 2 || text.length > 120) {
        return bad("Check the numbers: points per BHD 1–100, reward goal 10 or more, and a short reward text.");
      }
      state.rules = { pointsPerBhd: r.pointsPerBhd, rewardGoal: r.rewardGoal, rewardText: text };
      return ok(state.rules);
    }
  }

  if (p === "/api/owner/team") {
    if (m === "GET") return ok({ team: state.team.map((x) => ({ ...x })) });
    if (m === "POST") {
      const name = String(b.name ?? "").trim();
      const role = b.role === "manager" ? "manager" : "staff";
      if (!name) return bad("Enter a name and a role.");
      state.team.push({ id: `t${state.team.length + 1}`, name, role, active: true, hasPin: true, me: false });
      return ok({ name, role, pin: role === "manager" ? "493017" : "5826" });
    }
    if (m === "PATCH") {
      const t = state.team.find((x) => x.id === b.id);
      if (!t) return bad("Team member missing.");
      if (t.me) return bad("You can't deactivate yourself.");
      t.active = Boolean(b.active);
      return ok({ ok: true });
    }
  }

  if (p === "/api/owner/perks") {
    const g = globalThis as unknown as { __perks?: { id: string; staffId: string; staffName: string; title: string; note: string | null; validUntil: string | null; status: string; createdAt: string; claimedAt: string | null }[] };
    const s = (g.__perks ??= [{ id: "p1", staffId: "t3", staffName: "Ahmed", title: "Free meal after your shift", note: "Thank you for a great Friday", validUntil: null, status: "ready", createdAt: iso(1), claimedAt: null }]);
    if (m === "GET") return ok({ perks: s });
    if (m === "POST") {
      const title = String(b.title ?? "").trim();
      const ids = (Array.isArray(b.staffIds) ? b.staffIds : []) as string[];
      if (title.length < 2 || ids.length === 0) return bad("Choose who it is for and write what they get (at least 2 letters).");
      for (const id of ids) {
        const t = state.team.find((x) => x.id === id && x.active);
        if (t) s.unshift({ id: `p${s.length + 1}`, staffId: id, staffName: t.name, title, note: (b.note as string) ?? null, validUntil: (b.validUntil as string) ?? null, status: "ready", createdAt: new Date().toISOString(), claimedAt: null });
      }
      return ok({ given: ids.length });
    }
    if (m === "DELETE") { const x = s.find((q) => q.id === b.id); if (!x || x.status !== "ready") return bad("That reward was already used or is not yours to cancel.", 404); x.status = "cancelled"; return ok({ ok: true }); }
  }

  if (p === "/api/owner/team/pin" && m === "POST") {
    const t = state.team.find((x) => x.id === b.id);
    if (!t) return bad("That person is not on your team.", 404);
    t.hasPin = true;
    return ok({ pin: t.role === "staff" ? "7314" : "605829" });
  }

  if (p === "/api/owner/offers") {
    if (m === "GET") return ok(offersList());
    if (m === "POST") {
      // Like the real API: one line, defaults to "all", and a double tap within 2 minutes sends only once.
      const message = String(b.message ?? "").replace(/[\r\n\t]+/g, " ").trim();
      const audience = (["all", "apple", "google"].includes(String(b.audience)) ? b.audience : "all") as Audience;
      if (message.length < 1 || message.length > 200) return bad("Write a short message (up to 200 characters).");
      const again = state.offers.find((o) => o.message === message && o.audience === audience && Date.now() - new Date(o.sentAt).getTime() < 120_000);
      if (again) return ok({ id: again.id, recipients: again.recipients });
      const eligible = offersList().eligible;
      if (eligible === 0) return bad("Nobody has agreed to notifications yet.");
      const recipients = audience === "all" ? eligible : audience === "apple" ? Math.round(eligible * 0.62) : eligible - Math.round(eligible * 0.62);
      const offer: Offer = { id: `o${state.nextOfferId++}`, message, audience, sentAt: new Date().toISOString(), recipients, withdrawnAt: null };
      state.offers.unshift(offer);
      return ok({ id: offer.id, recipients });
    }
  }

  // Round 3: withdraw a sent message (owner only, no body). Same answers as the contract.
  const withdraw = /^\/api\/owner\/offers\/([^/]+)\/withdraw$/.exec(p);
  if (withdraw && m === "POST") {
    const id = decodeURIComponent(withdraw[1]);
    const offer = state.offers.find((o) => o.id === id);
    if (!offer) return bad("That message was not found.", 404);
    if (offer.withdrawnAt) return bad("That message was already withdrawn.", 409);
    if (state.failWithdrawOnce.delete(id)) return bad("The Wallet service did not answer. Try again in a minute.", 502);
    offer.withdrawnAt = new Date().toISOString();
    return ok({ ok: true, withdrawnAt: offer.withdrawnAt });
  }

  if (p === "/api/owner/privacy" && m === "GET") {
    const data: Privacy = { requests: state.requests.map((r) => ({ ...r })), terms: { ...state.terms } };
    return ok(data);
  }
  if (p === "/api/owner/privacy/erase" && m === "POST") {
    const r = state.requests.find((x) => x.id === b.requestId && x.status === "pending");
    if (!r) return bad("Request not found.", 404);
    r.status = "erased";
    return ok({ erased: true });
  }
  if (p === "/api/owner/terms" && m === "PUT") {
    const text = String(b.text ?? "").trim();
    if (text.length < 50 || text.length > 8000) return bad("The terms must be between 50 and 8000 characters.");
    state.terms = { text, updatedAt: new Date().toISOString(), isDefault: false };
    return ok({ ok: true });
  }

  if (p === "/api/dev/calabos") {
    type CM = { id: string; author: "dev" | "calabos"; body: string; status: string; replyTo: string | null; createdAt: string };
    const g = globalThis as unknown as { __cal?: CM[] };
    const s = (g.__cal ??= [
      { id: "c1", author: "dev", body: "Prepare an Eid card design for N10", status: "done", replyTo: null, createdAt: new Date(Date.now() - 3_600_000).toISOString() },
      { id: "c2", author: "calabos", body: "Noted, Sir. Queued as a task: Eid card design for N10. Claude Code will pick it up next time it runs.", status: "done", replyTo: "c1", createdAt: new Date(Date.now() - 3_590_000).toISOString() },
    ]);
    if (m === "GET") return ok({ messages: s });
    const body = String(b.message ?? "").trim();
    if (!body) return bad("Write a message first (up to 2000 characters).");
    const id = `c${s.length + 1}`;
    s.push({ id, author: "dev", body, status: "done", replyTo: null, createdAt: new Date().toISOString() });
    s.push({ id: `${id}r`, author: "calabos", body: `Noted, Sir. Queued as a task: ${body.slice(0, 80)}`, status: "done", replyTo: id, createdAt: new Date().toISOString() });
    return ok({ ok: true });
  }
  if (p === "/api/dev/team" && m === "GET") return ok({ team: state.team.filter((x) => x.role !== "developer").map((x) => ({ id: x.id, name: x.name, role: x.role, active: x.active, hasPin: x.hasPin })) });
  if (p === "/api/dev/pin" && m === "POST") {
    const t = state.team.find((x) => x.id === b.staffId);
    if (!t) return bad("That person is not in this business.", 404);
    t.hasPin = true;
    return ok({ pin: t.role === "staff" ? "7314" : "605829" });
  }
  if (p === "/api/dev/pos") {
    const g = globalThis as unknown as { __pos?: { configured: boolean; status: "active" | "disabled"; keyPrefix: string | null; lastEventAt: string | null } };
    const s = (g.__pos ??= { configured: true, status: "active", keyPrefix: "loy_pos_Xk2a", lastEventAt: new Date(Date.now() - 600_000).toISOString() });
    if (m === "POST") { s.configured = true; s.status = "active"; s.keyPrefix = "loy_pos_Demo"; return ok({ key: "loy_pos_DEMO-KEY-NOT-REAL-0000000000000000000000", prefix: s.keyPrefix }); }
    if (m === "PATCH") { s.status = b.status === "disabled" ? "disabled" : "active"; return ok({ status: s.status }); }
    const ev = (id: number, kind: string, receipt: string | null, outcome: string, points: number | null, detail: string | null, ago: number) => ({ id, kind, receipt, outcome, points, detail, createdAt: new Date(Date.now() - ago).toISOString() });
    return ok({
      ...s,
      endpoint: "https://client-site.example/api/pos/events",
      providers: [
        { id: "generic", name: "Generic webhook (JSON)", status: "available", note: "Any till or POS that can send an HTTPS request after each sale or refund." },
        { id: "foodics", name: "Foodics", status: "planned", note: "Not connected. Needs a review of their API and a partner account first." },
        { id: "square", name: "Square", status: "planned", note: "Not connected. Needs a review of their API first." },
      ],
      events: [ev(4, "refund", "R-1002", "ok", -25, null, 600_000), ev(3, "sale", "R-1003", "rejected", null, "unknown card code", 1_200_000), ev(2, "sale", "R-1002", "ok", 25, null, 3_000_000), ev(1, "ping", null, "ok", null, null, 7_200_000)],
    });
  }
  if (p === "/api/dev/requests") {
    const g = globalThis as unknown as { __req?: { id: string; message: string; why: string; status: string; result: string | null; createdAt: string; handledAt: string | null }[] };
    const s = (g.__req ??= [
      { id: "r1", message: "Change the card design following the season we're in and update it for all customers", why: "unsupported", status: "open", result: null, createdAt: new Date(Date.now() - 900_000).toISOString(), handledAt: null },
      { id: "r2", message: "Add 5000 points to card 1234", why: "limit", status: "in_progress", result: null, createdAt: new Date(Date.now() - 86_400_000).toISOString(), handledAt: null },
      { id: "r3", message: "Connect my website booking page", why: "unsupported", status: "done", result: "Booking link added to the card back.", createdAt: new Date(Date.now() - 172_800_000).toISOString(), handledAt: new Date().toISOString() },
    ]);
    if (m === "PATCH") {
      const r = s.find((x) => x.id === b.id);
      if (!r) return bad("Not found.", 404);
      r.status = String(b.status); if (b.result) r.result = String(b.result);
      return ok({});
    }
    return ok({ requests: s });
  }
  if (p === "/api/owner/assistant") {
    const g = globalThis as unknown as { __asst?: { pending: string | null; requests: { id: string; message: string; status: string; result: string | null; createdAt: string }[] } };
    const s = (g.__asst ??= { pending: null, requests: [] });
    if (m === "GET") return ok({ requests: s.requests });
    const t = String(b.message ?? "").trim().toLowerCase();
    if (/^(yes|y|ok|confirm)\b/.test(t)) {
      const done = s.pending;
      s.pending = null;
      return ok({ reply: done ? "Done. (Mock data: nothing was really changed.)" : "There is nothing waiting for your confirmation." });
    }
    if (/^(no|cancel)\b/.test(t)) { s.pending = null; return ok({ reply: "Cancelled. Nothing was changed." }); }
    // Development only: ask the AI planner what the message means (the route answers 404 in production). Nothing is executed.
    type Plan = { kind: string; question?: string; action?: { type: string; pointsPerBhd?: number; rewardGoal?: number; rewardText?: string; message?: string; guest?: { code?: string; name?: string }; delta?: number } };
    const plan: Plan | null = await fetch("/api/owner/assistant-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: b.message }) })
      .then((r) => (r.ok ? (r.json() as Promise<Plan>) : null))
      .catch(() => null);
    if (plan?.kind === "clarify" && plan.question) return ok({ reply: plan.question });
    if (plan?.kind === "action" && plan.action) {
      const a = plan.action;
      const what =
        a.type === "set_points_rate" ? `Change points per BHD from 2 to ${a.pointsPerBhd}.` :
        a.type === "set_reward" ? `Change the reward${a.rewardText ? ` to "${a.rewardText}"` : ""}${a.rewardGoal ? ` at ${a.rewardGoal} points` : ""}.` :
        a.type === "send_offer" ? `Send this notification to all guests: "${a.message}".` :
        `${(a.delta ?? 0) > 0 ? "Add" : "Remove"} ${Math.abs(a.delta ?? 0)} points ${(a.delta ?? 0) > 0 ? "to" : "from"} ${a.guest?.code ? `card ${a.guest.code}` : a.guest?.name}.`;
      s.pending = "x";
      return ok({ reply: `${what} Reply yes to confirm, or no to cancel.`, pending: { id: "x", summary: a.type } });
    }
    s.requests.unshift({ id: `r${s.requests.length + 1}`, message: String(b.message ?? "").slice(0, 200), status: "open", result: null, createdAt: new Date().toISOString() });
    return ok({ reply: "Thanks, I've passed your request to our development team. They will take care of it and get back to you here.", forwarded: true });
  }
  return bad("Mock data: this endpoint is not mocked.", 404);
}
