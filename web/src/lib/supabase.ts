import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sampleMode } from "./demo";
import { fakeDb } from "./fakeDb";

let client: SupabaseClient | null = null;

/** Server-side Supabase client using the service-role key. Never import from client components. */
export function db(): SupabaseClient {
  if (client) return client;
  // Sample mode (demo.ts): an in-memory stand-in with invented guests, so the product can be seen without Supabase keys.
  if (sampleMode()) {
    client = fakeDb() as unknown as SupabaseClient;
    return client;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type Venue = {
  id: string;
  slug: string;
  name: string;
  points_per_bhd: number;
  reward_goal: number;
  reward_text: string;
};

export type Card = {
  id: string;
  venue_id: string;
  member_id: string;
  code: string;
  points: number;
  visits: number;
  created_at?: string;
};

export async function getVenue(slug: string): Promise<Venue | null> {
  const { data, error } = await db()
    .from("venues")
    .select("id, slug, name, points_per_bhd, reward_goal, reward_text")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}
