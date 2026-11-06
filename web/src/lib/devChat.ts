import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { createRateLimiter } from "./rateLimit";

/**
 * The developer's chat with CALABOS. The developer (signed in, role developer) writes; CALABOS, running on the developer's own PC,
 * collects new messages through a bridge (a long random token in CALABOS_BRIDGE_TOKEN, nothing else) and writes its answers back.
 * The bridge can only read new chat messages and add replies. It cannot reach guests, points, PINs or any other table.
 */

export type ChatMessage = { id: string; author: "dev" | "calabos"; body: string; status: string; replyTo: string | null; createdAt: string };

const MAX_OPEN = 20;

export const MessageInput = z.object({ message: z.string().trim().min(1).max(2000) });
export const ReplyInput = z.object({ replyTo: z.uuid(), body: z.string().trim().min(1).max(4000), done: z.boolean().optional() });

function shape(r: Record<string, unknown>): ChatMessage {
  return { id: r.id as string, author: r.author as "dev" | "calabos", body: r.body as string, status: (r.status as string) ?? "new", replyTo: (r.reply_to as string | null) ?? null, createdAt: r.created_at as string };
}

export async function listMessages(staff: Staff): Promise<ChatMessage[]> {
  const { data, error } = await db().from("dev_messages").select("id, author, body, status, reply_to, created_at").eq("venue_id", staff.venueId).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []).map(shape).reverse();
}

/** Adds the developer's message. Returns false when too many are still waiting for CALABOS. */
export async function postMessage(staff: Staff, text: string): Promise<boolean> {
  const { data: open, error } = await db().from("dev_messages").select("id").eq("venue_id", staff.venueId).eq("author", "dev").eq("status", "new");
  if (error) throw error;
  if ((open ?? []).length >= MAX_OPEN) return false;
  const { error: e2 } = await db().from("dev_messages").insert({ venue_id: staff.venueId, author: "dev", body: text, status: "new" });
  if (e2) throw e2;
  return true;
}

// ---- the bridge (called by CALABOS, not by a browser) ----
const limiter = createRateLimiter({ limit: 90, windowMs: 60_000 });
const sha = (s: string) => createHash("sha256").update(s).digest();

/** Checks the bearer token and returns the venue the bridge belongs to (this deployment's main venue), or an error response. */
export async function bridgeVenue(request: Request): Promise<{ venueId: string } | Response> {
  const token = process.env.CALABOS_BRIDGE_TOKEN?.trim();
  if (!token || token.length < 32) return new Response("Not found", { status: 404 });
  const given = /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!timingSafeEqual(sha(given), sha(token))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!limiter.allow("bridge")) return Response.json({ error: "too many requests" }, { status: 429 });
  const slug = (process.env.BRAND_DEFAULT_VENUE ?? "orbyn").trim().toLowerCase();
  const { data, error } = await db().from("venues").select("id").eq("slug", slug).maybeSingle();
  if (error || !data) return Response.json({ error: "venue not found" }, { status: 500 });
  return { venueId: data.id as string };
}

export async function bridgeInbox(venueId: string): Promise<ChatMessage[]> {
  const { data, error } = await db().from("dev_messages").select("id, author, body, status, reply_to, created_at").eq("venue_id", venueId).eq("author", "dev").eq("status", "new").order("created_at", { ascending: true }).limit(20);
  if (error) throw error;
  return (data ?? []).map(shape);
}

/** CALABOS answers one developer message. Returns false when that message is not this venue's or not a developer message. */
export async function bridgeReply(venueId: string, input: z.infer<typeof ReplyInput>): Promise<boolean> {
  const { data: orig, error } = await db().from("dev_messages").select("id").eq("id", input.replyTo).eq("venue_id", venueId).eq("author", "dev").maybeSingle();
  if (error) throw error;
  if (!orig) return false;
  const { error: e2 } = await db().from("dev_messages").insert({ venue_id: venueId, author: "calabos", body: input.body, status: "done", reply_to: input.replyTo });
  if (e2) throw e2;
  if (input.done !== false) {
    const { error: e3 } = await db().from("dev_messages").update({ status: "done" }).eq("id", input.replyTo).eq("venue_id", venueId);
    if (e3) throw e3;
  }
  return true;
}
