import { describe, expect, it } from "vitest";
import { brandColors, brandName, brandStyle, brandTokens, brandVenue, footerLine, mix, poweredBy, walletColors, DEFAULT_COLORS } from "../src/lib/brand";

describe("brand settings", () => {
  it("falls back to the template with no settings", () => {
    expect(brandColors({})).toEqual(DEFAULT_COLORS);
    expect(brandName({})).toBe("Rewards");
    expect(brandVenue({})).toBe("demo");
    expect(brandStyle({})).toEqual({});
  });

  it("ignores colours that are not #rrggbb", () => {
    expect(brandColors({ BRAND_ACCENT: "red", BRAND_BG: "#12345", BRAND_TEXT: "  #FFFFFF " })).toEqual({ ...DEFAULT_COLORS, text: "#ffffff" });
  });

  it("only accepts a safe venue folder name", () => {
    expect(brandVenue({ BRAND_DEFAULT_VENUE: "Acme-Cafe" })).toBe("acme-cafe");
    expect(brandVenue({ BRAND_DEFAULT_VENUE: "../secrets" })).toBe("demo");
  });

  it("keeps the template look byte for byte: Wallet colours equal the old fixed values", () => {
    expect(walletColors({})).toEqual({
      appleBackground: "rgb(8, 7, 6)",
      applePreviewBackground: "rgb(14, 12, 10)",
      appleForeground: "rgb(243, 233, 210)",
      appleLabel: "rgb(205, 165, 91)",
      googleBackground: "#141210",
    });
  });
});

describe("powered-by line", () => {
  it("shows Orbyn by default, can be renamed and can be hidden", () => {
    expect(footerLine("Acme", {})).toBe("Acme Loyalty Rewards · Powered by Orbyn");
    expect(footerLine("Acme", { BRAND_POWERED_BY: "Powered by Acme Digital" })).toBe("Acme Loyalty Rewards · Powered by Acme Digital");
    expect(poweredBy({ BRAND_POWERED_BY: "" })).toBe("");
    expect(footerLine("Acme", { BRAND_POWERED_BY: "" })).toBe("Acme Loyalty Rewards");
  });
});

describe("custom colours", () => {
  const env = { BRAND_BG: "#101418", BRAND_TEXT: "#eef2f3", BRAND_ACCENT: "#3fa7a0" };

  it("produces every token the stylesheet uses", () => {
    const t = brandTokens(brandColors(env));
    for (const k of ["--bg", "--text", "--surface", "--surface2", "--line", "--muted", "--dim", "--gold", "--gold2", "--gold-hi", "--gold-mid", "--gold-dim", "--gold-rgb", "--glow2-rgb", "--card-top", "--card-mid", "--on-gold"]) {
      expect(t[k], k).toBeTruthy();
    }
    expect(t["--gold"]).toBe("#3fa7a0");
    expect(t["--gold-rgb"]).toBe("63 167 160");
  });

  it("is applied to the page and to the Wallet passes", () => {
    expect(brandStyle(env)["--bg"]).toBe("#101418");
    expect(walletColors(env).appleLabel).toBe("rgb(63, 167, 160)");
    expect(walletColors(env).googleBackground).toBe("#101418");
  });

  it("picks readable text for the gold buttons", () => {
    expect(brandTokens({ bg: "#000000", text: "#ffffff", accent: "#f5d27a" })["--on-gold"]).toBe("#1a1410");
    expect(brandTokens({ bg: "#000000", text: "#ffffff", accent: "#1b3a8a" })["--on-gold"]).toBe("#ffffff");
  });

  it("mixes colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#102030", "#102030", 0.7)).toBe("#102030");
  });
});
