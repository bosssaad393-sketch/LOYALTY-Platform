import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { bahrainDayStart } from "./ownerApi";

/** Staff perks: a thank-you the owner gives a team member ("shift over, enjoy this"). The owner's own words; nothing is built in. */

export const GrantInput = z.object({
  staffIds: z.array(z.uuid()).min(1).max(50),
  title: z.string().trim().min(2).max(80),
  note: z.string().trim().max(200).optional(),
  validUntil: z.iso.date().optional(),
});

const todayBahrain = () => new Date(bahrainDayStart()).toISOString().slice(0, 10);

/** Gives the perk to each named person of THIS business who is active. Returns how many received it. */
export async function grantPerks(owner: Staff, input: z.infer<typeof GrantInput>): Promise<number> {
  if (input.validUntil && input.validUntil < todayBahrain()) throw new RangeError("past date");
  const { data, error } = await db().from("staff_users").select("id").eq("venue_id", owner.venueId).eq("active", true).in("id", input.staffIds);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const rows = ids.map((id) => ({ venue_id: owner.venueId, staff_id: id, title: input.title, status: "ready", note: input.note || null, valid_until: input.validUntil ?? null, granted_by: owner.id }));
  const { error: e2 } = await db().from("staff_perks").insert(rows);
  if (e2) throw e2;
  await db().from("audit_log").insert({ venue_id: owner.venueId, actor: owner.id, action: "staff_perk_granted", detail: { title: input.title, count: ids.length } });
  return ids.length;
}

export type PerkRow = { id: string; staffId: string; staffName: string; title: string; note: string | null; validUntil: string | null; status: string; createdAt: string; claimedAt: string | null };

/** Owner view: the latest perks of this business with the person's name. */
export async function ownerPerks(owner: Staff): Promise<PerkRow[]> {
  const { data, error } = await db()
    .from("staff_perks")
    .select("id, staff_id, title, note, valid_until, status, created_at, claimed_at")
    .eq("venue_id", owner.venueId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const { data: people, error: e2 } = await db().from("staff_users").select("id, name").eq("venue_id", owner.venueId);
  if (e2) throw e2;
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  return (data ?? []).map((r) => ({
    id: r.id as string,
    staffId: r.staff_id as string,
    staffName: names.get(r.staff_id as string) ?? "",
    title: r.title as string,
    note: (r.note as string | null) ?? null,
    validUntil: (r.valid_until as string | null) ?? null,
    status: r.status as string,
    createdAt: r.created_at as string,
    claimedAt: (r.claimed_at as string | null) ?? null,
  }));
}

/** Owner takes back a perk that was not used yet. False when it is not this business's, or already used. */
export async function cancelPerk(owner: Staff, id: string): Promise<boolean> {
  const { data, error } = await db().from("staff_perks").update({ status: "cancelled" }).eq("id", id).eq("venue_id", owner.venueId).eq("status", "ready").select("id");
  if (error) throw error;
  if (!data || data.length === 0) return false;
  await db().from("audit_log").insert({ venue_id: owner.venueId, actor: owner.id, action: "staff_perk_cancelled", detail: { perk: id } });
  return true;
}

export type MyPerk = { id: string; title: string; note: string | null; validUntil: string | null; from: string };

/** Staff view: only MY perks that are ready and not expired. */
export async function myPerks(me: Staff): Promise<MyPerk[]> {
  const { data, error } = await db()
    .from("staff_perks")
    .select("id, title, note, valid_until")
    .eq("venue_id", me.venueId)
    .eq("staff_id", me.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const today = todayBahrain();
  return (data ?? [])
    .filter((r) => !r.valid_until || (r.valid_until as string) >= today)
    .map((r) => ({ id: r.id as string, title: r.title as string, note: (r.note as string | null) ?? null, validUntil: (r.valid_until as string | null) ?? null, from: me.venueName }));
}

/** Marks MY perk as used (once). False when it is not mine, not ready, or expired. */
export async function claimPerk(me: Staff, id: string): Promise<boolean> {
  const mine = await myPerks(me);
  if (!mine.some((p) => p.id === id)) return false;
  const { data, error } = await db()
    .from("staff_perks")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("venue_id", me.venueId)
    .eq("staff_id", me.id)
    .eq("status", "ready")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) return false;
  await db().from("audit_log").insert({ venue_id: me.venueId, actor: me.id, action: "staff_perk_claimed", detail: { perk: id } });
  return true;
}
