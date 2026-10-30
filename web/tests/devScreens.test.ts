import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { DEVICES, cardIdFrom, cardLink, cleanOrigin, fitScale, qrPath, screenLinks } from "../src/app/dev/screens";

describe("All screens links", () => {
  it("builds every surface from the origin and the venue in the brand settings", () => {
    expect(screenLinks("https://rewards.example.com/", "n10")).toEqual({
      join: "https://rewards.example.com/join/n10",
      terms: "https://rewards.example.com/join/n10/terms",
      staff: "https://rewards.example.com/staff",
      owner: "https://rewards.example.com/owner",
      dev: "https://rewards.example.com/dev",
    });
  });

  it("never puts an unsafe venue name into a link", () => {
    expect(screenLinks("http://localhost:3040", "../owner").join).toBe("http://localhost:3040/join/demo");
    expect(screenLinks("http://localhost:3040", "N10").join).toBe("http://localhost:3040/join/demo");
  });

  it("drops an origin that is not plain http(s), so links stay relative", () => {
    expect(cleanOrigin("javascript:alert(1)")).toBe("");
    expect(cleanOrigin("https://a.b/c")).toBe("");
    expect(cleanOrigin("")).toBe("");
    expect(screenLinks("", "n10").join).toBe("/join/n10");
  });
});

describe("card link from a paste", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("accepts the id or a whole card link", () => {
    expect(cardIdFrom(id)).toBe(id);
    expect(cardIdFrom(`  https://x.app/card/${id.toUpperCase()}?a=1 `)).toBe(id);
    expect(cardLink("https://x.app", id)).toBe(`https://x.app/card/${id}`);
  });
  it("rejects anything else", () => {
    expect(cardIdFrom("1234")).toBeNull();
    expect(cardIdFrom("")).toBeNull();
  });
});

describe("preview scale", () => {
  it("fits a wide page into a narrow box and never enlarges", () => {
    expect(fitScale(DEVICES.desktop.width, 640)).toBe(0.5);
    expect(fitScale(DEVICES.phone.width, 900)).toBe(1);
    expect(fitScale(390, 0)).toBe(1);
  });
});

describe("QR drawing", () => {
  it("draws runs of dark modules as rectangles", () => {
    // 3 x 3: row 0 = dark dark light, row 1 = all light, row 2 = light dark dark
    expect(qrPath(3, [1, 1, 0, 0, 0, 0, 0, 1, 1])).toBe("M0 0h2v1h-2zM1 2h2v1h-2z");
  });
  it("covers exactly the dark modules of a real code", () => {
    const { modules } = QRCode.create("https://rewards.example.com/join/n10", { errorCorrectionLevel: "Q" });
    const dark = Array.from(modules.data).filter(Boolean).length;
    const area = [...qrPath(modules.size, modules.data).matchAll(/h(\d+)v1/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(area).toBe(dark);
  });
});
