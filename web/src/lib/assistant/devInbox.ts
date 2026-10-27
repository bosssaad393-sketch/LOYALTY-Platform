import "server-only";
import { z } from "zod";
import { db } from "../supabase";
import type { Staff } from "../staffAuth";

/** The development team's inbox: what the owners' chat passed on. Own business only; the owner sees the status and the result in the chat. */

export const RequestUpdate = z.object({
  id: z.uuid(),
  status: z.enum(["open", "in_progress", "done"]),
  result: z.string().trim().max(500).optional(),
});

export async function teamRequests(staff: Staff) {
  const { data, error } = await db()
    .from("assistant_requests")
    .select("id, message, why, status, result, created_at, handled_at")
    .eq("venue_id", staff.venueId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    message: r.message as string,
    why: r.why as string,
    status: r.status as string,
    result: (r.result as string | null) ?? null,
    createdAt: r.created_at as string,
    handledAt: (r.handled_at as string | null) ?? null,
  }));
}

/** Returns false when no request with that id belongs to this business. */
export async function updateRequest(staff: Staff, input: z.infer<typeof RequestUpdate>): Promise<boolean> {
  const patch: Record<string, unknown> = { status: input.status };
  if (input.result !== undefined) patch.result = input.result;
  patch.handled_at = input.status === "done" ? new Date().toISOString() : null;
  const { data, error } = await db().from("assistant_requests").update(patch).eq("id", input.id).eq("venue_id", staff.venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) return false;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "assistant_request_" + input.status, detail: { request: input.id } });
  return true;
}
