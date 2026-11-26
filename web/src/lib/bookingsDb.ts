import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { listBranches } from "./branchesDb";
import type { BookingInput, BookingStatus, BookingView, MyBooking } from "./bookings";

type Raw = Record<string, unknown>;

/** Does this venue take booking requests? False on a database without 0028. Never throws. */
export async function bookingsOn(venueId: string): Promise<boolean> {
  try {
    const { data, error } = await db().from("venues").select("bookings_on").eq("id", venueId).maybeSingle();
    return !error && (data as { bookings_on?: boolean } | null)?.bookings_on === true;
  } catch {
    return false;
  }
}

export async function setBookingsOn(staff: Staff, on: boolean): Promise<void> {
  const { error } = await db().from("venues").update({ bookings_on: on }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "bookings_switch", detail: { on } });
}

/** Stores the request and returns the guest's key to it. */
export async function createBooking(venueId: string, input: BookingInput, at: Date, cardId: string | null): Promise<string> {
  const branchId = input.branch ? (await listBranches(venueId)).find((b) => b.slug === input.branch && b.kind === "branch")?.id ?? null : null;
  const token = randomBytes(18).toString("base64url");
  const { error } = await db().from("bookings").insert({
    venue_id: venueId, branch_id: branchId, card_id: cardId, token, name: input.name, phone: input.phone.replace(/[^\d+]/g, ""),
    party: input.party, at: at.toISOString(), note: input.note || null, status: "pending",
  });
  if (error) throw error;
  return token;
}

export async function myBooking(token: string): Promise<MyBooking | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data, error } = await db().from("bookings").select("venue_id, party, at, status, reply").eq("token", token).maybeSingle();
  if (error || !data) return null;
  const b = data as Raw;
  const { data: venue } = await db().from("venues").select("name").eq("id", b.venue_id).maybeSingle();
  return { venueName: String((venue as { name?: string } | null)?.name ?? ""), party: Number(b.party), at: String(b.at), status: b.status as BookingStatus, reply: (b.reply as string | null) ?? null, past: Date.parse(String(b.at)) < Date.now() };
}

/** The guest takes their own request back (only while it is waiting or confirmed, and still ahead). */
export async function cancelMyBooking(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const { data, error } = await db().from("bookings").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("token", token).in("status", ["pending", "confirmed"]).gte("at", new Date().toISOString()).select("id");
  return !error && (data ?? []).length > 0;
}

/** The venue's requests from three hours ago onward, soonest first. */
export async function listBookings(venueId: string): Promise<BookingView[]> {
  const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const { data, error } = await db().from("bookings").select("id, branch_id, card_id, name, phone, party, at, note, status, reply, created_at").eq("venue_id", venueId).gte("at", since).order("at", { ascending: true }).limit(300);
  if (error) return [];
  const places = new Map((await listBranches(venueId, { includeInactive: true })).map((b) => [b.id, b.name]));
  return ((data ?? []) as Raw[]).map((b) => ({
    id: String(b.id), name: String(b.name), phone: String(b.phone), party: Number(b.party), at: String(b.at), note: (b.note as string | null) ?? null,
    status: b.status as BookingStatus, reply: (b.reply as string | null) ?? null, branchName: b.branch_id ? places.get(String(b.branch_id)) ?? null : null,
    member: Boolean(b.card_id), createdAt: String(b.created_at),
  }));
}

/** The venue's answer. Only a request of the signed-in person's venue, and only one a guest has not cancelled. Audited. */
export async function decideBooking(staff: Staff, id: string, status: "confirmed" | "declined", reply: string | null): Promise<boolean> {
  const { data, error } = await db().from("bookings").update({ status, reply, decided_at: new Date().toISOString(), decided_by: staff.id }).eq("id", id).eq("venue_id", staff.venueId).in("status", ["pending", "confirmed", "declined"]).select("id");
  if (error) throw error;
  if (!(data ?? []).length) return false;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: status === "confirmed" ? "booking_confirmed" : "booking_declined", detail: { booking: id } });
  return true;
}

/** The daily job: requests whose day passed more than 90 days ago are removed, so names and numbers are not kept. */
export async function purgeOldBookings(now: number = Date.now()): Promise<void> {
  try {
    await db().from("bookings").delete().lt("at", new Date(now - 90 * 86_400_000).toISOString());
  } catch { /* a database without 0028 has nothing to remove */ }
}
