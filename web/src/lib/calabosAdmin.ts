import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import { generatePin, setPin } from "./pin";

/**
 * What CALABOS may do on this platform on Saad's say-so (through the bridge token, never a database key):
 * see a short status, list people, give a PIN, add a team member, add a business. Every action is written to the audit log as "calabos_<action>".
 * There is deliberately no delete, no points change and no guest data here. PINs are returned once, in the answer, to CALABOS (and so to Saad's chat).
 */

const Slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/);
const Business = Slug.optional();

export const AdminInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), business: Business }),
  z.object({ action: z.literal("people"), business: Business }),
  z.object({ action: z.literal("give_pin"), name: z.string().trim().min(1).max(60), business: Business }),
  z.object({ action: z.literal("add_member"), name: z.string().trim().min(1).max(60), role: z.enum(["staff", "manager"]), business: Business }),
  z.object({
    action: z.literal("add_business"),
    name: z.string().trim().min(2).max(80),
    slug: Slug,
    pointsPerBhd: z.number().int().min(1).max(100).optional(),
    rewardGoal: z.number().int().min(10).max(100000).optional(),
    rewardText: z.string().trim().min(2).max(120).optional(),
  }),
]);
export type AdminInput = z.infer<typeof AdminInput>;
export type AdminResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

const bad = (error: string): AdminResult => ({ ok: false, error });

async function venueId(slug: string | undefined, fallback: string): Promise<string | null> {
  if (!slug) return fallback;
  const { data, error } = await db().from("venues").select("id").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

async function audit(venue: string, action: string, detail: Record<string, unknown>) {
  await db().from("audit_log").insert({ venue_id: venue, actor: "calabos", action: `calabos_${action}`, detail });
}

export async function runAdmin(input: AdminInput, mainVenueId: string): Promise<AdminResult> {
  if (input.action === "add_business") return addBusiness(input);
  const v = await venueId(input.business, mainVenueId);
  if (!v) return bad("No business with that short name.");

  if (input.action === "status") {
    const [cards, team, reqs, ev] = await Promise.all([
      db().from("cards").select("id").eq("venue_id", v),
      db().from("staff_users").select("id").eq("venue_id", v).eq("active", true),
      db().from("assistant_requests").select("id").eq("venue_id", v).neq("status", "done"),
      db().from("pos_events").select("created_at").eq("venue_id", v).order("created_at", { ascending: false }).limit(1),
    ]);
    for (const r of [cards, team, reqs, ev]) if (r.error) throw r.error;
    return { ok: true, data: { guests: (cards.data ?? []).length, team: (team.data ?? []).length, openOwnerRequests: (reqs.data ?? []).length, lastTillEvent: (ev.data?.[0]?.created_at as string | undefined) ?? null } };
  }

  const { data: people, error } = await db().from("staff_users").select("id, name, role, active, pin_lookup").eq("venue_id", v).neq("role", "developer").order("created_at");
  if (error) throw error;

  if (input.action === "people") {
    return { ok: true, data: { people: (people ?? []).map((p) => ({ name: p.name, role: p.role, active: p.active, hasPin: !!p.pin_lookup })) } };
  }

  if (input.action === "give_pin") {
    const wanted = input.name.toLowerCase();
    const hits = (people ?? []).filter((p) => p.active && String(p.name).toLowerCase() === wanted);
    const part = hits.length ? hits : (people ?? []).filter((p) => p.active && String(p.name).toLowerCase().includes(wanted));
    if (part.length === 0) return bad("Nobody active with that name.");
    if (part.length > 1) return bad(`More than one match: ${part.map((p) => p.name).join(", ")}. Say the full name.`);
    const p = part[0];
    for (let i = 0; i < 5; i++) {
      const pin = generatePin(p.role as "staff" | "manager" | "owner");
      if ((await setPin(v, p.id as string, pin, "calabos")) === true) {
        await audit(v, "give_pin", { person: p.name });
        return { ok: true, data: { name: p.name, role: p.role, pin } };
      }
    }
    return bad("Could not find a free PIN. Try again.");
  }

  // add_member
  const { data: row, error: e1 } = await db().from("staff_users").insert({ venue_id: v, name: input.name, role: input.role, active: true }).select("id").single();
  if (e1 || !row) throw e1 ?? new Error("insert failed");
  for (let i = 0; i < 5; i++) {
    const pin = generatePin(input.role);
    if ((await setPin(v, row.id as string, pin, "calabos")) === true) {
      await audit(v, "add_member", { name: input.name, role: input.role });
      return { ok: true, data: { name: input.name, role: input.role, pin } };
    }
  }
  return bad("Added the person but could not find a free PIN. Give one from the PIN command.");
}

async function addBusiness(input: Extract<AdminInput, { action: "add_business" }>): Promise<AdminResult> {
  const { data: clash, error } = await db().from("venues").select("id").eq("slug", input.slug).maybeSingle();
  if (error) throw error;
  if (clash) return bad("That short name is already used.");
  const { data: v, error: e1 } = await db()
    .from("venues")
    .insert({ slug: input.slug, name: input.name, points_per_bhd: input.pointsPerBhd ?? 2, reward_goal: input.rewardGoal ?? 500, reward_text: input.rewardText ?? "A reward chosen by the business", active: true })
    .select("id")
    .single();
  if (e1 || !v) throw e1 ?? new Error("insert failed");
  const venue = v.id as string;
  const { data: owner, error: e2 } = await db().from("staff_users").insert({ venue_id: venue, name: `Owner of ${input.name}`.slice(0, 60), role: "owner", active: true }).select("id").single();
  if (e2 || !owner) throw e2 ?? new Error("insert failed");
  for (let i = 0; i < 5; i++) {
    const pin = generatePin("owner");
    if ((await setPin(venue, owner.id as string, pin, "calabos")) === true) {
      await audit(venue, "add_business", { name: input.name, slug: input.slug });
      return { ok: true, data: { name: input.name, slug: input.slug, joinPath: `/join/${input.slug}`, ownerPin: pin, note: "The owner signs in at /owner with this PIN. This deployment keeps one look (brand) for every business." } };
    }
  }
  return bad("Created the business but could not make the owner's PIN. Use give_pin for the owner.");
}
