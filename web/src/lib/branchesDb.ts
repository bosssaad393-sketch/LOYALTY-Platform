import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { toBranch, type Branch } from "./branches";
import { googleReviewOk } from "./venueLinks";

const OLD_COLUMNS = "id, venue_id, slug, name, name_ar, kind, address, phone, maps_url, review_url, menu_url, lat, lng, sort, active";
/** With migration 0024 (the wider lock-screen area). A database without it is read with OLD_COLUMNS. */
const COLUMNS = `${OLD_COLUMNS}, wide_reach`;
const noWide = (e: { message?: string } | null) => Boolean(e?.message?.includes("wide_reach"));
type Got = { data: unknown; error: { message?: string } | null };

/** The venue's places, in the owner's order. Never throws: a venue on an older database simply has no branches. */
export async function listBranches(venueId: string, opts: { includeInactive?: boolean } = {}): Promise<Branch[]> {
  try {
    let got: Got = await db().from("branches").select(COLUMNS).eq("venue_id", venueId).order("sort", { ascending: true });
    if (noWide(got.error)) got = await db().from("branches").select(OLD_COLUMNS).eq("venue_id", venueId).order("sort", { ascending: true });
    if (got.error) return [];
    const all = ((got.data ?? []) as Record<string, unknown>[]).map(toBranch);
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
  wideReach: z.boolean().optional().default(false),
  active: z.boolean().default(true),
});
export type BranchInput = z.infer<typeof BranchInput>;

export const slugOf = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "branch";

/** Adds or changes a place of the SIGNED-IN person's venue. Coordinates come as a pair or not at all. Audited. */
export async function saveBranch(staff: Staff, input: BranchInput): Promise<Branch | "not_found" | "half_location"> {
  if ((input.lat === null) !== (input.lng === null)) return "half_location";
  const old = {
    name: input.name, name_ar: input.nameAr, kind: input.kind, address: input.address, phone: input.phone,
    maps_url: input.mapsUrl, review_url: input.reviewUrl, menu_url: input.menuUrl, lat: input.lat, lng: input.lng, active: input.active,
  };
  // The wider area needs a location, and a database with 0024. Without the column the place is saved without it.
  const row = { ...old, wide_reach: input.wideReach && input.lat !== null };
  if (input.id) {
    let got: Got = await db().from("branches").update(row).eq("id", input.id).eq("venue_id", staff.venueId).select(COLUMNS);
    if (noWide(got.error)) got = await db().from("branches").update(old).eq("id", input.id).eq("venue_id", staff.venueId).select(OLD_COLUMNS);
    if (got.error) throw got.error;
    const saved = ((got.data ?? []) as Record<string, unknown>[])[0];
    if (!saved) return "not_found";
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "branch_changed", detail: { branch: input.id, name: input.name, active: input.active } });
    return toBranch(saved as Record<string, unknown>);
  }
  const existing = await listBranches(staff.venueId, { includeInactive: true });
  let slug = slugOf(input.name);
  for (let n = 2; existing.some((b) => b.slug === slug); n++) slug = `${slugOf(input.name).slice(0, 36)}-${n}`;
  let made: Got = await db().from("branches").insert({ ...row, venue_id: staff.venueId, slug, sort: existing.length }).select(COLUMNS).single();
  if (noWide(made.error)) made = await db().from("branches").insert({ ...old, venue_id: staff.venueId, slug, sort: existing.length }).select(OLD_COLUMNS).single();
  if (made.error) throw made.error;
  const data = made.data;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "branch_added", detail: { branch: (data as { id: string }).id, name: input.name } });
  return toBranch(data as Record<string, unknown>);
}
