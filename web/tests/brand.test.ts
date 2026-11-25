import { describe, expect, it } from "vitest";
import { SAMPLE_SECRET, serverSecret } from "../src/lib/demo";
import { brandColors, brandName, brandStyle, brandTokens, brandVenue, footerLine, mix, poweredBy, rgbText, walletColors, DEFAULT_COLORS, offersBoxTicked, brandFinish, isQuietFinish } from "../src/lib/brand";

describe("brand settings", () => {
  it("falls back to the template with no settings", () => {
    expect(brandColors({})).toEqual(DEFAULT_COLORS);
    expect(brandName({})).toBe("Rewards");
    expect(brandVenue({})).toBe("orbyn");
    expect(brandStyle({})).toEqual({});
  });

  it("ignores colours that are not #rrggbb", () => {
    expect(brandColors({ BRAND_ACCENT: "red", BRAND_BG: "#12345", BRAND_TEXT: "  #FFFFFF " })).toEqual({ ...DEFAULT_COLORS, text: "#ffffff" });
  });

  it("only accepts a safe venue folder name", () => {
    expect(brandVenue({ BRAND_DEFAULT_VENUE: "Acme-Cafe" })).toBe("acme-cafe");
    expect(brandVenue({ BRAND_DEFAULT_VENUE: "../secrets" })).toBe("orbyn");
  });

  it("Wallet colours follow the default brand colours", () => {
    expect(walletColors({})).toEqual({
      appleBackground: rgbText(mix(DEFAULT_COLORS.bg, "#000000", 0.6)),
      applePreviewBackground: rgbText(mix(DEFAULT_COLORS.bg, "#000000", 0.3)),
      appleForeground: rgbText(DEFAULT_COLORS.text),
      appleLabel: rgbText(DEFAULT_COLORS.accent),
      googleBackground: DEFAULT_COLORS.bg,
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

describe("the moving Orbyn ground", () => {
  it("is on with no client colours, and off as soon as a client sets its own", async () => {
    const { usesOrbynLook } = await import("@/lib/brand");
    expect(usesOrbynLook({})).toBe(true);
    expect(usesOrbynLook({ BRAND_BG: "#141210", BRAND_TEXT: "#f3e9d2", BRAND_ACCENT: "#cda55b" })).toBe(false);
  });
});

describe("type set and finish", () => {
  it("keeps the template's type and finish with no settings", async () => {
    const { brandFont, brandFinish } = await import("@/lib/brand");
    expect(brandFont({})).toBe("default");
    expect(brandFont({ BRAND_FONT: "comic" })).toBe("default");
    expect(brandFinish({})).toBe("default");
    expect(brandFinish({ BRAND_FINISH: "shiny" })).toBe("default");
  });

  it("marcellus sets the heading face, the text face and one Arabic face, and keeps a Latin name in the heading face", async () => {
    const { brandFont, brandStyle } = await import("@/lib/brand");
    const style = brandStyle({ BRAND_FONT: "marcellus" } as never);
    expect(brandFont({ BRAND_FONT: "Marcellus " } as never)).toBe("marcellus");
    expect(style["--serif"]).toMatch(/^var\(--font-marcellus\), var\(--font-arsans\)/);
    expect(style["--sans"]).toMatch(/^var\(--font-hanken\), var\(--font-arsans\)/);
    expect(style["--display-arabic"]).toBe("var(--serif)");
    expect(brandFont({ BRAND_FONT: "gloock" } as never)).toBe("default");
  });

  it("baskerville sets the serif, the text face and the Arabic face", async () => {
    const { brandFont } = await import("@/lib/brand");
    const style = brandStyle({ BRAND_FONT: " Baskerville " });
    expect(brandFont({ BRAND_FONT: "baskerville" })).toBe("baskerville");
    expect(style["--serif"]).toContain("var(--font-baskerville)");
    expect(style["--font-sans"]).toBe("var(--font-jost)");
    expect(style["--font-ar"]).toBe("var(--font-naskh)");
    // classic still works as before
    expect(brandStyle({ BRAND_FONT: "classic" })["--serif"]).toBe('Georgia, "Times New Roman", serif');
  });

  it("matte switches the moving ground off and puts the Wallet pass on the brand colour itself", async () => {
    const env = { BRAND_BG: "#013220", BRAND_TEXT: "#faf8f3", BRAND_ACCENT: "#c9a96e", BRAND_FINISH: "matte" };
    const style = brandStyle(env);
    expect(style["--net"]).toBe("none");
    expect(style["--bg"]).toBe("#013220");
    expect(walletColors(env).appleBackground).toBe("rgb(1, 50, 32)");
    expect(walletColors(env).appleLabel).toBe("rgb(201, 169, 110)");
    // without matte the pass keeps the darker shade, as before
    expect(walletColors({ ...env, BRAND_FINISH: "" }).appleBackground).toBe(rgbText(mix("#013220", "#000000", 0.6)));
  });
});

describe("the venue mark", () => {
  it("is the crest image unless the client sets its name in type", async () => {
    const { brandMark, brandProps } = await import("@/lib/brand");
    expect(brandMark({})).toBe("image");
    expect(brandProps({}).mark).toBeUndefined();
    expect(brandMark({ BRAND_MARK: "type" })).toBe("type");
    expect(brandProps({ BRAND_MARK: "type", BRAND_NAME: "Al Example" })).toMatchObject({ name: "Al Example", mark: "type" });
  });
});

describe("offers box on the join page", () => {
  it("starts ticked unless the client asks for it empty", () => {
    expect(offersBoxTicked({})).toBe(true);
    expect(offersBoxTicked({ BRAND_OFFERS_BOX: "ticked" })).toBe(true);
    expect(offersBoxTicked({ BRAND_OFFERS_BOX: " Unticked " })).toBe(false);
  });
});

describe("the server secret", () => {
  it("is the configured one, and only a hosted demo may run without it", () => {
    expect(serverSecret({ STAFF_SESSION_SECRET: "a", SUPABASE_SERVICE_ROLE_KEY: "b", ORBYN_DEMO: "1" })).toBe("a");
    expect(serverSecret({ SUPABASE_SERVICE_ROLE_KEY: "b" })).toBe("b");
    expect(serverSecret({ ORBYN_DEMO: "1" })).toBe(SAMPLE_SECRET);
    // A real deployment, and local development, get nothing: sign-in stays closed until a secret is set.
    expect(serverSecret({})).toBeUndefined();
    expect(serverSecret({ LOYALTY_FAKE_DB: "1", NODE_ENV: "production" })).toBeUndefined();
  });
});

describe("the glass finish", () => {
  const env = { BRAND_FINISH: "glass", BRAND_BG: "#013220", BRAND_TEXT: "#faf8f3", BRAND_ACCENT: "#c9a96e" };
  it("is its own finish and keeps the matte finish's quiet rules", () => {
    expect(brandFinish(env)).toBe("glass");
    expect(isQuietFinish(env)).toBe(true);
    expect(isQuietFinish({ BRAND_FINISH: "matte" })).toBe(true);
    expect(isQuietFinish({})).toBe(false);
    expect(brandFinish({ BRAND_FINISH: "shiny" })).toBe("default");
    // No moving network, and the Wallet pass in the brand colour itself, exactly as with matte.
    expect(brandStyle(env)["--net"]).toBe("none");
    expect(walletColors(env).appleBackground).toBe(walletColors({ ...env, BRAND_FINISH: "matte" }).appleBackground);
  });
});
