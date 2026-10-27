import "server-only";
import { z } from "zod";
import { db } from "../supabase";
import type { Staff } from "../staffAuth";
import { adjustPoints } from "../ledgerDb";
import { readRules, Rules, saveRules } from "../rulesDb";
import { sendOffer } from "../offersDb";
import { OfferInput } from "../offers";
import { refreshWalletCards } from "../staffApi";
import { MAX_ADJUST, parseRequest, type GuestRef, type Planner, type Proposal } from "./parse";

/**
 * The owner assistant. One owner message in, one reply out.
 *  - It can do four things for the SIGNED-IN owner's own business: change the reward, change points per BHD, send a notification,
 *    add or remove points on one guest. Every change is shown first and happens only after the owner says yes.
 *  - Anything else, or anything it may not do, is passed to the development team and the owner is told exactly that
 *    ("passed to our development team"). The owner never sees "error" or "no permission".
 *  - The venue and the person ALWAYS come from the session, never from the message. A guest is looked up inside the owner's venue only.
 */

export type Reply = { reply: string; pending?: { id: string; summary: string }; forwarded?: boolean };
export type Deps = { planner?: Planner; now?: () => number };

export const PENDING_MINUTES = 10;
export const MAX_TEXT = 1000;
export const FORWARD_REPLY = "Thanks, I've passed your request to our development team. They will take care of it and get back to you here.";
const FAILED_REPLY = "I couldn't finish that just now. I've passed it to our development team and they will sort it out.";
const HELP_REPLY =
  "I can: change your reward (for example \"change the reward to a free dessert at 300 points\"), change points per BHD, send a notification to your guests, and add or remove points for a guest (by card code or name). " +
  "Anything else I pass to our development team.";

const Stored = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_points_rate"), pointsPerBhd: Rules.shape.pointsPerBhd }),
  z
    .object({ type: z.literal("set_reward"), rewardGoal: Rules.shape.rewardGoal.optional(), rewardText: Rules.shape.rewardText.optional() })
    .refine((a) => a.rewardGoal !== undefined || a.rewardText !== undefined),
  z.object({ type: z.literal("send_offer"), message: z.string().min(1).max(2000) }),
  z.object({
    type: z.literal("adjust_points"),
    cardId: z.uuid(),
    guest: z.string().max(80),
    delta: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= MAX_ADJUST),
    reason: z.string().min(1).max(200),
  }),
]);
type StoredAction = z.infer<typeof Stored>;

const clean = (s: string) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();

// ---- passing a request to the development team ----
type Why = "unsupported" | "role" | "limit" | "failed";

async function forward(staff: Staff, text: string, why: Why, failedReply = false): Promise<Reply> {
  const { error } = await db().from("assistant_requests").insert({ venue_id: staff.venueId, staff_id: staff.id, message: text.slice(0, MAX_TEXT), why });
  if (error) {
    console.error("assistant request not saved", error.message);
    return { reply: "I couldn't pass that on just now. Please try again in a minute." };
  }
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "assistant_forwarded", detail: { why } });
  return { reply: failedReply ? FAILED_REPLY : FORWARD_REPLY, forwarded: true };
}

// ---- guests, looked up inside the owner's own venue ----
type Guest = { cardId: string; code: string; name: string; points: number };

async function findGuests(staff: Staff, ref: GuestRef): Promise<Guest[]> {
  const base = db().from("cards").select("id, code, points, members(name, deleted_at)").eq("venue_id", staff.venueId);
  const { data, error } = ref.code ? await base.eq("code", ref.code).limit(5) : await base.limit(500);
  if (error) throw error;
  const guests = (data ?? []).flatMap((c) => {
    const m = c.members as unknown as { name: string; deleted_at: string | null } | null;
    return m && m.name && !m.deleted_at ? [{ cardId: c.id as string, code: c.code as string, name: m.name, points: c.points as number }] : [];
  });
  if (ref.code) return guests;
  const words = (ref.name ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? guests.filter((g) => words.every((w) => g.name.toLowerCase().includes(w))) : [];
}

// ---- pending confirmations ----
type Pending = { id: string; action: unknown; summary: string; expires_at: string };

async function latestPending(staff: Staff, now: number): Promise<Pending | null> {
  const { data, error } = await db()
    .from("assistant_pending")
    .select("id, action, summary, expires_at, created_at")
    .eq("venue_id", staff.venueId)
    .eq("staff_id", staff.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const rows = (data ?? []) as Pending[];
  const live = rows.find((r) => Date.parse(r.expires_at) > now) ?? null;
  for (const r of rows) if (r !== live) await db().from("assistant_pending").update({ status: "expired" }).eq("id", r.id).eq("venue_id", staff.venueId).eq("status", "pending");
  return live;
}

async function propose(staff: Staff, action: StoredAction, summary: string, now: number): Promise<Reply> {
  await db().from("assistant_pending").update({ status: "cancelled" }).eq("venue_id", staff.venueId).eq("staff_id", staff.id).eq("status", "pending");
  const { data, error } = await db()
    .from("assistant_pending")
    .insert({ venue_id: staff.venueId, staff_id: staff.id, action, summary, status: "pending", expires_at: new Date(now + PENDING_MINUTES * 60_000).toISOString() })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("could not save the proposal");
  return { reply: `${summary} Reply yes to confirm, or no to cancel.`, pending: { id: data.id as string, summary } };
}

const points = (n: number) => `${n} point${n === 1 ? "" : "s"}`;

// ---- doing the action (only after the owner said yes) ----
async function run(staff: Staff, a: StoredAction): Promise<string> {
  switch (a.type) {
    case "set_points_rate": {
      const r = await saveRules(staff, { pointsPerBhd: a.pointsPerBhd });
      return `Done. Guests now earn ${points(r.pointsPerBhd)} per BHD, from the next visit.`;
    }
    case "set_reward": {
      const r = await saveRules(staff, { ...(a.rewardGoal !== undefined ? { rewardGoal: a.rewardGoal } : {}), ...(a.rewardText !== undefined ? { rewardText: a.rewardText } : {}) });
      return `Done. The reward is now "${r.rewardText}" at ${points(r.rewardGoal)}. Guests keep the points they have.`;
    }
    case "send_offer": {
      const r = await sendOffer(staff, OfferInput.parse({ message: a.message, audience: "all" }));
      return `Done. The notification was sent to ${r.recipients} guest${r.recipients === 1 ? "" : "s"}.`;
    }
    case "adjust_points": {
      const r = await adjustPoints(a.cardId, staff.id, a.delta, a.reason);
      await refreshWalletCards(a.cardId, r.new_balance);
      return `Done. ${a.guest} now has ${points(r.new_balance)}.`;
    }
  }
}

// ---- building a proposal from what the parser understood ----
async function prepare(staff: Staff, p: Proposal, now: number): Promise<Reply> {
  switch (p.type) {
    case "set_points_rate": {
      const cur = await readRules(staff.venueId);
      if (cur.pointsPerBhd === p.pointsPerBhd) return { reply: `Guests already earn ${points(cur.pointsPerBhd)} per BHD, so nothing needs to change.` };
      return propose(staff, Stored.parse(p), `Change points per BHD from ${cur.pointsPerBhd} to ${p.pointsPerBhd}. It applies from the next visit; guests keep the points they have.`, now);
    }
    case "set_reward": {
      const cur = await readRules(staff.venueId);
      const parts: string[] = [];
      if (p.rewardText !== undefined) parts.push(`the reward from "${cur.rewardText}" to "${p.rewardText}"`);
      if (p.rewardGoal !== undefined) parts.push(`the reward goal from ${points(cur.rewardGoal)} to ${points(p.rewardGoal)}`);
      return propose(staff, Stored.parse(p), `Change ${parts.join(" and ")}.`, now);
    }
    case "send_offer": {
      const ok = OfferInput.safeParse({ message: p.message, audience: "all" });
      if (!ok.success) return { reply: "That notification is too long or empty. Keep it short: one or two sentences." };
      return propose(staff, Stored.parse({ type: "send_offer", message: ok.data.message }), `Send this notification to every guest who has your card in their Wallet: "${ok.data.message}".`, now);
    }
    case "adjust_points": {
      const found = await findGuests(staff, p.guest);
      if (found.length === 0) return { reply: "I couldn't find that guest. Give me the 4-digit code on their card, or their full name." };
      if (found.length > 1) {
        const list = found.slice(0, 5).map((g) => `${g.name} (card ${g.code})`).join(", ");
        return { reply: `I found ${found.length} guests: ${list}. Which one? Say the card code.` };
      }
      const g = found[0];
      if (p.delta < 0 && g.points < -p.delta) return { reply: `${g.name} has only ${points(g.points)}, so I can't remove ${-p.delta}.` };
      const verb = p.delta > 0 ? `Add ${points(p.delta)} to` : `Remove ${points(-p.delta)} from`;
      return propose(staff, Stored.parse({ type: "adjust_points", cardId: g.cardId, guest: g.name, delta: p.delta, reason: p.reason }), `${verb} ${g.name} (card ${g.code}: ${g.points} → ${g.points + p.delta} points). Reason: ${p.reason}.`, now);
    }
  }
}

/** Handles one message from the signed-in owner (or manager). Never throws to the caller: a failure is passed to the development team. */
export async function handleMessage(staff: Staff, raw: string, deps: Deps = {}): Promise<Reply> {
  const now = (deps.now ?? Date.now)();
  const text = clean(raw);
  const parsed = (deps.planner ?? parseRequest)(text.slice(0, MAX_TEXT));
  try {
    switch (parsed.kind) {
      case "greeting":
        return { reply: "Hello! " + HELP_REPLY };
      case "help":
        return { reply: HELP_REPLY };
      case "clarify":
        return { reply: parsed.question };
      case "cancel": {
        const p = await latestPending(staff, now);
        if (!p) return { reply: "There is nothing waiting to cancel." };
        await db().from("assistant_pending").update({ status: "cancelled" }).eq("id", p.id).eq("venue_id", staff.venueId).eq("status", "pending");
        return { reply: "Cancelled. Nothing was changed." };
      }
      case "confirm": {
        if (staff.role !== "owner") return forward(staff, text, "role");
        const p = await latestPending(staff, now);
        if (!p) return { reply: "There is nothing waiting for your confirmation. Tell me what you would like to change." };
        const claimed = await db()
          .from("assistant_pending")
          .update({ status: "done" })
          .eq("id", p.id)
          .eq("venue_id", staff.venueId)
          .eq("staff_id", staff.id)
          .eq("status", "pending")
          .select("id");
        if (claimed.error || !claimed.data || claimed.data.length !== 1) return { reply: "That request was already handled or has expired. Tell me again what you would like." };
        const action = Stored.safeParse(p.action);
        if (!action.success) return forward(staff, p.summary, "failed", true);
        try {
          const done = await run(staff, action.data);
          await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: `assistant_${action.data.type}`, detail: { summary: p.summary } });
          return { reply: done };
        } catch (e) {
          console.error("assistant action failed", e instanceof Error ? e.message : e);
          return forward(staff, p.summary, "failed", true);
        }
      }
      case "unsupported":
        return forward(staff, text, parsed.why);
      case "action":
        if (staff.role !== "owner") return forward(staff, text, "role");
        return await prepare(staff, parsed.action, now);
    }
  } catch (e) {
    console.error("assistant failed", e instanceof Error ? e.message : e);
    return forward(staff, text, "failed", true);
  }
}

/** The owner's recent requests that were passed to the development team, with their status. Own venue only. */
export async function recentRequests(staff: Staff) {
  const { data, error } = await db()
    .from("assistant_requests")
    .select("id, message, status, result, created_at")
    .eq("venue_id", staff.venueId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id as string, message: r.message as string, status: r.status as string, result: (r.result as string | null) ?? null, createdAt: r.created_at as string }));
}
