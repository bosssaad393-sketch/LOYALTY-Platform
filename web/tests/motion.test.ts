import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The motion pieces (after Magic UI, Skiper UI and Cult UI patterns): every animation has a reduced-motion state, the beam
// is the only looping one, and they use the brand colour through tokens.

const css = readFileSync(join(__dirname, "..", "src", "components", "motion.css"), "utf8");

describe("motion pieces", () => {
  it("every animation is inside a no-preference block, so reduced motion shows the finished screen", () => {
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/animation:\s*[a-z]/);
  });
  it("only the border beam loops", () => {
    expect([...css.matchAll(/animation:[^;]*infinite/g)].map((m) => m[0])).toEqual(["animation: beam-turn 6s linear infinite"]);
  });
  it("colours come from the brand tokens (one colour), apart from the island's black pill", () => {
    const hex = [...css.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => m[0].toLowerCase());
    expect(new Set(hex)).toEqual(new Set(["#000", "#fff", "#04191d"]));
    expect(css).toContain("var(--gold-rgb)");
  });
});
