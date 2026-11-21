import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";

// The venue's guest Wi-Fi (migration 0021), shown on the public guest page. Owner sets it on the Rules screen.
// It is public on purpose (every guest at the venue sees it), so the screen says to use a guest network.

export type VenueWifi = { name: string | null; password: string | null };

export const WifiInput = z.object({
  name: z.string().trim().max(64).transform((v) => v || null),
  password: z.string().max(128).transform((v) => v.trim() || null),
});

/** The Wi-Fi, or none when not set or the columns do not exist yet. Never throws: pages must load anyway. */
export async function readWifi(venueId: string): Promise<VenueWifi> {
  try {
    const { data, error } = await db().from("venues").select("wifi_ssid, wifi_password").eq("id", venueId).maybeSingle();
    if (error || !data) return { name: null, password: null };
    return { name: (data.wifi_ssid as string | null) ?? null, password: (data.wifi_password as string | null) ?? null };
  } catch {
    return { name: null, password: null };
  }
}

/** By venue slug, for the public guest page: only active venues, only the two Wi-Fi fields. */
export async function readWifiBySlug(slug: string): Promise<VenueWifi | null> {
  try {
    const { data, error } = await db().from("venues").select("wifi_ssid, wifi_password, active").eq("slug", slug).maybeSingle();
    if (error || !data || data.active === false) return null;
    return { name: (data.wifi_ssid as string | null) ?? null, password: (data.wifi_password as string | null) ?? null };
  } catch {
    return null;
  }
}

/** Saves the Wi-Fi of the SIGNED-IN person's venue. A password without a name is dropped. Audited (the password is not logged). */
export async function saveWifi(staff: Staff, wifi: VenueWifi): Promise<VenueWifi> {
  const next = { name: wifi.name, password: wifi.name ? wifi.password : null };
  const { error } = await db().from("venues").update({ wifi_ssid: next.name, wifi_password: next.password }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "wifi_changed", detail: { name: next.name, password: next.password ? "set" : "none" } });
  return next;
}
