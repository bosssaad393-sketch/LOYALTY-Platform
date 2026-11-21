import { beforeAll, describe, expect, it, vi } from "vitest";
import { throwawayCertificate, unzip } from "./helpers/throwawayPass";

// Spaloon's Apple Wallet stamp card ("Ink & Ivory"), built for real (throwaway certificate, no network): ivory colours,
// STAMPS x / 9 in the header, member + short reward name, a strip at Apple's store card size, a change message only
// when ready, and the Arabic side (ar.lproj strip, logo and words) for iPhones set to Arabic.

const h = vi.hoisted(() => ({ rewardsGiven: 0 }));
const TIERS = [{ at: 3, text: "10% off your visit", ar: "خصم ١٠٪ على زيارتك" }, { at: 6, text: "Free hair mask or 20% off", ar: "ماسك شعر مجاني أو خصم ٢٠٪" }, { at: 9, text: "Free haircut, on the house", ar: "قصة شعر مجانية" }];

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
  it("is ivory with charcoal text and shows the count, member and short reward name", async () => {
    const { json, store, files } = await pass(1, 1); // one reward used, one stamp since: 4 / 9
    expect(json.backgroundColor).toBe("rgb(239, 232, 216)");
    expect(json.foregroundColor).toBe("rgb(43, 42, 39)");
    expect(store.headerFields).toEqual([expect.objectContaining({ key: "stamps", label: "STAMPS", value: "4 / 9" })]);
    expect(store.secondaryFields.map((f) => [f.key, f.value])).toEqual([["member", "Saad Dridri"], ["due", "Hair mask or 20%"]]);
    expect(store.auxiliaryFields ?? []).toEqual([]);
    expect(store.secondaryFields[1].changeMessage).toBeUndefined();
    expect(json.barcodes[0].altText).toBe("5786");
    expect(pngSize(files.get("strip@3x.png")!)).toEqual({ width: 1125, height: 369 });
    expect(files.has("stamp-mark.png")).toBe(false);
  }, 30000);

  it("carries an Arabic side for iPhones set to Arabic", async () => {
    const { files } = await pass(1, 1);
    expect(pngSize(files.get("ar.lproj/strip@3x.png")!)).toEqual({ width: 1125, height: 369 });
    expect(files.has("ar.lproj/logo@2x.png")).toBe(true);
    const raw = files.get("ar.lproj/pass.strings")!;
    const text = raw.toString("utf8").includes("الأختام") ? raw.toString("utf8") : raw.toString("utf16le");
    expect(text).toContain("الأختام");
    expect(text).toContain("ماسك أو خصم ٢٠٪");
    expect(text).toContain("مكافأتك جاهزة: %@");
  }, 30000);

  it("buzzes only when a reward is ready", async () => {
    const { store } = await pass(3, 0);
    const reward = store.secondaryFields[1];
    expect(reward.label).toBe("REWARD READY");
    expect(reward.changeMessage).toBe("Your reward is ready: %@");
  }, 30000);
});
