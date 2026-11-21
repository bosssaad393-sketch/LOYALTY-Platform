import { beforeAll, describe, expect, it, vi } from "vitest";
import { throwawayCertificate, unzip } from "./helpers/throwawayPass";

// Spaloon's Apple Wallet stamp card, built for real (throwaway certificate, no network): gold colours, STAMPS x / 9
// in the header, member + reward due, a strip drawn at Apple's store card size, and a change message only when ready.

const h = vi.hoisted(() => ({ rewardsGiven: 0 }));
const TIERS = [{ at: 3, text: "10% off your visit" }, { at: 6, text: "Free hair mask or 20% off" }, { at: 9, text: "Free haircut, on the house" }];

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { apple_auth_token: "0123456789abcdef0123456789abcdef0123456789abcdef" }, error: null }),
          maybeSingle: async () => ({ data: { rewards_given: h.rewardsGiven, venues: { stamp_tiers: TIERS } }, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock("../src/lib/passOffer", () => ({ offerStateForCard: async () => null }));

import { buildPass, pngSize } from "../src/lib/appleWallet";
import type { Card, Venue } from "../src/lib/supabase";

const venue: Venue = { id: "v1", slug: "spaloon", name: "Spaloon", points_per_bhd: 1, reward_goal: 3, reward_text: "10% off" };
const card = (stamps: number): Card => ({ id: "22222222-2222-4222-8222-222222222222", venue_id: "v1", member_id: "m1", code: "5786", points: stamps, visits: 1 });
type Field = { key: string; label: string; value: string | number; changeMessage?: string };

async function pass(stamps: number, rewardsGiven = 0) {
  h.rewardsGiven = rewardsGiven;
  const files = unzip(await buildPass(venue, card(stamps), "Saad Dridri", "https://example.test"));
  const json = JSON.parse(files.get("pass.json")!.toString("utf8"));
  return { files, json, store: json.storeCard as Record<string, Field[]> };
}

beforeAll(() => {
  const signer = throwawayCertificate("Throwaway test signer");
  const wwdr = throwawayCertificate("Throwaway test WWDR");
  vi.stubEnv("APPLE_PASS_CERT", signer.cert);
  vi.stubEnv("APPLE_PASS_KEY", signer.key);
  vi.stubEnv("APPLE_WWDR_CERT", wwdr.cert);
  vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.test.throwaway");
  vi.stubEnv("APPLE_TEAM_ID", "TESTTEAM00");
  vi.stubEnv("PUBLIC_BASE_URL", "https://example.test");
});

describe("Spaloon stamp card on Apple Wallet", () => {
  it("is gold with charcoal text and shows the count, member and reward due", async () => {
    const { json, store, files } = await pass(1, 1); // one reward used, one stamp since: 4 / 9
    expect(json.backgroundColor).toBe("rgb(173, 145, 82)");
    expect(json.foregroundColor).toBe("rgb(43, 43, 45)");
    expect(store.headerFields).toEqual([expect.objectContaining({ key: "stamps", label: "STAMPS", value: "4 / 9" })]);
    expect(store.secondaryFields.map((f) => [f.key, f.value])).toEqual([["member", "Saad Dridri"], ["due", "Free hair mask or 20% off"]]);
    expect(store.auxiliaryFields ?? []).toEqual([]);
    expect(store.secondaryFields[1].changeMessage).toBeUndefined();
    expect(json.barcodes[0].altText).toBe("5786");
    expect(pngSize(files.get("strip@3x.png")!)).toEqual({ width: 1125, height: 369 });
    expect(files.has("stamp-mark.png")).toBe(false);
  }, 30000);

  it("buzzes only when a reward is ready", async () => {
    const { store } = await pass(3, 0);
    const reward = store.secondaryFields[1];
    expect(reward.label).toBe("REWARD READY");
    expect(reward.changeMessage).toBe("Your reward is ready: %@");
  }, 30000);
});
