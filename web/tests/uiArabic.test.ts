import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AR } from "../src/lib/uiArabic";
import { makeT } from "../src/lib/uiLang";

// Every text on the owner and staff screens that goes through t("...") or tx("...") has an Arabic version,
// and the {placeholders} match, so no screen shows English (or a broken value) to an Arabic venue.

const ROOTS = ["src/app/owner", "src/app/staff", "src/components/PinPad.tsx", "src/lib/uiLang.tsx"];
function files(p: string): string[] {
  const full = path.join(process.cwd(), p);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((n) => files(path.join(p, n))).filter((f) => /\.tsx?$/.test(f));
}
const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\'/g, "'");
const texts = new Set<string>();
for (const f of ROOTS.flatMap(files)) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(?:t|tx)\(\s*"((?:[^"\\]|\\.)*)"/g)) texts.add(unescape(m[1]));
}

describe("Arabic owner and staff screens", () => {
  it("found the texts", () => {
    expect(texts.size).toBeGreaterThan(50);
  });
  it("every text has Arabic", () => {
    const missing = [...texts].filter((s) => !AR[s]);
    expect(missing).toEqual([]);
  });
  it("placeholders match", () => {
    const keys = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const bad = [...texts].filter((s) => AR[s] && keys(s) !== keys(AR[s]));
    expect(bad).toEqual([]);
  });
  it("fills values and falls back to English for unknown text", () => {
    const t = makeT("ar");
    expect(t("Something only the server says")).toBe("Something only the server says");
    expect(makeT("en")("Hello {name}", { name: "Ali" })).toBe("Hello Ali");
  });
});
