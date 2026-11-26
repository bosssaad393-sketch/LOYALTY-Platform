import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// An invented issuer number, only so the card's ids can be built in this test.
process.env.GOOGLE_WALLET_ISSUER_ID = "0000000000000000001";
import { cardObject, visitFields } from "../src/lib/googleWallet";

// The Google Wallet card of a visit-card venue: visits and the gift, never points. Shapes only: nothing is sent to Google.

const venue = { id: "v", slug: "roshinah", name: "Al Roshinah", reward_goal: 500, card_mode: "visits" } as never;
const card = { id: "11111111-1111-4111-8111-111111111111", code: "4821", points: 0, visits: 6 } as never;

describe("a visit card in Google Wallet", () => {
  it("shows visits and the gift that is ready, with where to use it, and the venue's links", () => {
    const o = cardObject(venue, card, "Maryam", { visits: 6, gift: { title: "50% off at Asmak Al Roshinah", place: "Asmak Al Roshinah" }, links: [{ label: "Menu", url: "https://roshinah.orbyn.co/menu/roshinah" }] }) as Record<string, unknown>;
    expect(o.loyaltyPoints).toEqual({ label: "Visits", balance: { int: 6 } });
    expect(o.secondaryLoyaltyPoints).toBeUndefined();
    expect(o.textModulesData).toEqual([{ id: "gift", header: "Your gift", body: "50% off at Asmak Al Roshinah. Use it at Asmak Al Roshinah." }]);
    expect(o.linksModuleData).toEqual({ uris: [{ id: "link0", uri: "https://roshinah.orbyn.co/menu/roshinah", description: "Menu" }] });
    expect(o.accountName).toBe("Maryam");
    expect(JSON.stringify(o)).not.toContain('"label":"Points"');
  });

  it("says so plainly when no gift is waiting, and the update carries only what changes", () => {
    expect(visitFields({ visits: 2, gift: null, links: [] })).toEqual({ loyaltyPoints: { label: "Visits", balance: { int: 2 } }, textModulesData: [{ id: "gift", header: "Your gift", body: "No gift waiting right now." }] });
    expect(visitFields({ visits: 2, gift: { title: "A dessert on us", place: null }, links: [] }).textModulesData[0].body).toBe("A dessert on us");
  });

  it("a points card is unchanged", () => {
    const o = cardObject({ ...(venue as object), card_mode: null } as never, { ...(card as object), points: 120 } as never, "Ali") as Record<string, unknown>;
    expect(o.loyaltyPoints).toEqual({ label: "Points", balance: { int: 120 } });
    expect(o.secondaryLoyaltyPoints).toEqual({ label: "Reward at", balance: { int: 500 } });
    expect(o.textModulesData).toBeUndefined();
  });
});
