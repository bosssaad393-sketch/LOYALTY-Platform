import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// Sending the Wallet card as it is now to cards guests already saved (lib/cardDesign.ts), against an in-memory
// database. Apple is stood in for: nothing leaves this machine. Invented guests only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, woken: [] as string[][], configured: true }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/appleWallet", () => ({ appleWalletConfigured: () => h.configured }));
vi.mock("../src/lib/apns", () => ({ notifyAppleTokens: async (tokens: string[]) => { h.woken.push(tokens); return tokens.length; } }));

import { newState } from "./helpers/fakeDb";
import { cardDesignStatus, passDesignStamps, savedCards, sendCardDesign } from "../src/lib/cardDesign";

const VA = "venue-a", VB = "venue-b";
const card = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SENT = new Date("2026-12-05T09:30:00.000Z");

beforeEach(() => {
  delete process.env.ORBYN_DEMO;
  delete process.env.LOYALTY_FAKE_DB;
  h.woken = [];
  h.configured = true;
  h.state = newState({
    cards: [
      { id: card(1), venue_id: VA }, { id: card(2), venue_id: VA }, { id: card(3), venue_id: VA },
      { id: card(9), venue_id: VB },
    ],
    // Card 1 is on two phones; card 2 on one phone; card 3 was never added to Wallet.
    apple_registrations: [
      { device_id: "phone-1", card_id: card(1), push_token: "tok-1" },
      { device_id: "phone-1b", card_id: card(1), push_token: "tok-1b" },
      { device_id: "phone-2", card_id: card(2), push_token: "tok-2" },
      { device_id: "phone-9", card_id: card(9), push_token: "tok-9" },
    ],
    audit_log: [],
  });
});

describe("sending the latest card to saved cards", () => {
  it("counts the saved cards and phones of one business only", async () => {
    expect(await savedCards(VA)).toEqual({ tokens: ["tok-1", "tok-1b", "tok-2"], cards: 2 });
    expect(await cardDesignStatus(VA)).toEqual({ configured: true, cards: 2, phones: 3, sentAt: null });
  });

  it("marks the business's cards as newer and wakes its phones, never another business's", async () => {
    const r = await sendCardDesign(VA, "dev-1", SENT);
    expect(r).toEqual({ configured: true, cards: 2, phones: 3, sentAt: SENT.toISOString(), accepted: 3 });
    expect(h.woken).toEqual([["tok-1", "tok-1b", "tok-2"]]);
    const stamps = await passDesignStamps([VA, VB]);
    expect(stamps.get(VA)).toBe(SENT.getTime());
    expect(stamps.has(VB)).toBe(false);
    expect((await cardDesignStatus(VA)).sentAt).toBe(SENT.toISOString());
  });

  it("does nothing where Apple Wallet is not set up, or on a sample", async () => {
    h.configured = false;
    expect(await sendCardDesign(VA, "dev-1", SENT)).toMatchObject({ configured: false, accepted: 0 });
    expect(h.woken).toEqual([]);
    expect((await passDesignStamps([VA])).size).toBe(0);
  });
});
