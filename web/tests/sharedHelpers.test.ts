import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { bahrainDayKey, bahrainTime, bhd, bhdText, filsMoney, n } from "../src/lib/format";
import { isUuid } from "../src/lib/ids";
import { must } from "../src/lib/must";

// Shared helpers: one way to write money, Bahrain time and ids across the app, and no copies creeping back.

describe("shared format", () => {
  it("writes numbers and BHD the same way everywhere", () => {
    expect(n(5240)).toBe("5,240");
    expect(bhd(1845.5)).toBe("1,845.500");
    expect(bhdText(12.5)).toBe("BHD 12.500");
    expect(filsMoney(1600)).toBe("BHD 1.600");
  });
  it("uses Bahrain time and the Bahrain calendar day", () => {
    expect(bahrainTime("2026-11-07T21:02:00Z")).toBe("00:02");
    expect(bahrainDayKey("2026-11-07T21:02:00Z")).toBe("2026-11-08");
  });
  it("checks ids and database answers", () => {
    expect(isUuid("aaaaaaaa-aaaa-4aaa-8aaa-000000000001")).toBe(true);
    expect(isUuid("not-an-id")).toBe(false);
    expect(must({ data: 1, error: null })).toBe(1);
    expect(() => must({ data: null, error: { message: "boom" } })).toThrow("boom");
  });
});

describe("no copies", () => {
  const src = join(__dirname, "..", "src");
  const all = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? all(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
  const files = all(src).map((f) => ({ f: f.slice(src.length + 1).split(sep).join("/"), s: readFileSync(f, "utf8") }));
  it("the UUID pattern lives only in lib/ids.ts", () => {
    expect(files.filter((x) => x.s.includes("[0-9a-f]{8}-[0-9a-f]{4}") && !["lib/ids.ts", "app/dev/screens.ts"].includes(x.f)).map((x) => x.f)).toEqual([]);
  });
  it("must() is defined only in lib/must.ts", () => {
    expect(files.filter((x) => x.s.includes("const must = <") && x.f !== "lib/must.ts").map((x) => x.f)).toEqual([]);
  });
  it("QR drawing (QRCode.create) only in the shared helper, the guest card and Wallet code", () => {
    expect(files.filter((x) => x.s.includes("QRCode.create") && !["lib/qr.ts"].includes(x.f)).map((x) => x.f)).toEqual(["app/dev/AllScreens.tsx"]);
  });
});
