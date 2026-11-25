import "server-only";
import { db } from "./supabase";
import { parseTiers } from "./stamps";

/**
 * What kind of venue this deployment serves, for trimming the owner and staff screens.
 * A stamp venue (migration 0020: salons, barbers, spas) has no tables, no table orders, no bills and no points per BHD,
 * so those parts are hidden. Points venues (cafés, lounges) keep everything. Never throws: unknown = points venue.
 */
export async function isStampVenue(slug: string): Promise<boolean> {
  try {
    const { data } = await db().from("venues").select("stamp_tiers").eq("slug", slug).maybeSingle();
    return parseTiers((data as { stamp_tiers?: unknown } | null)?.stamp_tiers) !== null;
  } catch {
    return false;
  }
}

/**
 * A visit-card venue (migration 0022: card_mode = 'visits'): no points and no stamps; staff record visits per branch and
 * redeem gifts, and the owner manages branches, gifts and automatic messages. Never throws: unknown = not a visit venue.
 */
export async function isVisitVenue(slug: string): Promise<boolean> {
  try {
    const { data } = await db().from("venues").select("card_mode").eq("slug", slug).maybeSingle();
    return (data as { card_mode?: string | null } | null)?.card_mode === "visits";
  } catch {
    return false;
  }
}
