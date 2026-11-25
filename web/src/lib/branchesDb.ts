import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { toBranch, type Branch } from "./branches";
import { googleReviewOk } from "./venueLinks";

const COLUMNS = "id, venue_id, slug, name, name_ar, kind, address, phone, maps_url, review_url, menu_url, lat, lng, sort, active";

/** The venue's places, in the owner's order. Never throws: a venue on an older database simply has no branches. */
export async function listBranches(venueId: string, opts: { includeInactive?: boolean } = {}): Promise<Branch[]> {
  try {
    const { data, error } = await db().from("branches").select(COLUMNS).eq("venue_id", venueId).order("sort", { ascending: true });
    if (error) return [];
    const all = (data ?? []).map((r) => toBranch(r as Record<string, unknown>));
    return opts.includeInactive ? all : all.filter((b) => b.active);
  } catch {
    return [];
  }
}

const https = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
const blank = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const link = (check: (u: string) => boolean) => z.string().trim().max(500).transform((v) => v || null).refine((v) => v === null || check(v));
const coord = (min: number, max: number) => z.union([z.number(), z.string().trim()]).nullable().optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max));

export const BranchInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  nameAr: blank(80).optional().default(null),
  kind: z.enum(["branch", "partner"]).default("branch"),
  address: blank(200).optional().default(null),
  phone: blank(30).optional().default(null),
  mapsUrl: link(https).optional().default(null),
  reviewUrl: link(googleReviewOk).optional().default(null),
  menuUrl: link(https).optional().default(null),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  active: z.boolean().default(true),
});
export type BranchInput = z.infer<typeof BranchInput>;

export const slugOf = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "branch";

/** Adds or changes a place of the SIGNED-IN person's venue. Coordinates come as a pair or not at all. Audited. */
export async function saveBranch(staff: Staff, input: BranchInput): Promise<Branch | "not_found" | "half_location"> {
  if ((input.lat === null) !== (input.lng === null)) return "half_location";
  const row = {
    name: input.name, name_ar: input.nameAr, kind: input.kind, address: input.address, phone: input.phone,
    maps_url: input.mapsUrl, review_url: input.reviewUrl, menu_url: input.menuUrl, lat: input.lat, lng: input.lng, active: input.active,
  };
  if (input.id) {
    const { data, error } = await db().from("branches").update(row).eq("id", input.id).eq("venue_id", staff.venueId).select(COLUMNS);
    if (error) throw error;
    const saved = (data ?? [])[0];
    if (!saved) return "not_found";
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "branch_changed", detail: { branch: input.id, name: input.name, active: input.active } });
    return toBranch(saved as Record<string, unknown>);
  }
  const existing = await listBranches(staff.venueId, { includeInactive: true });
  let slug = slugOf(input.name);
  for (let n = 2; existing.some((b) => b.slug === slug); n++) slug = `${slugOf(input.name).slice(0, 36)}-${n}`;
  const { data, error } = await db().from("branches").insert({ ...row, venue_id: staff.venueId, slug, sort: existing.length }).select(COLUMNS).single();
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "branch_added", detail: { branch: (data as { id: string }).id, name: input.name } });
  return toBranch(data as Record<string, unknown>);
}
