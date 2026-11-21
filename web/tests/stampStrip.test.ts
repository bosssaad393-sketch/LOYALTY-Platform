import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The stamp card strip on Apple Wallet: which stamps are filled, what each reward row says, Apple's strip size,
// and Spaloon's colour file. Set STRIP_OUT=<folder> to write the pictures out and look at them.

vi.mock("server-only", () => ({}));
import { ladderFits, ladderRows, rgb, stampCardStyle, stampStripImages } from "../src/lib/stampStrip";
import { pngSize } from "../src/lib/appleWallet";
import { stampState } from "../src/lib/stamps";

const tiers = [{ at: 3, text: "10% off your visit" }, { at: 6, text: "Free hair mask or 20% off" }, { at: 9, text: "Free haircut, on the house" }];
const texts = ["10% off your visit", "Hair mask or 20% off", "Free haircut"];

describe("ladderRows", () => {
  it("fills by position and marks the reward due", () => {
    // 1 reward used, 1 stamp since: position 4
    const rows = ladderRows(stampState(tiers, 1, 1), texts);
    expect(rows.map((r) => [r.filled, r.status])).toEqual([[3, "used"], [1, "next"], [0, "later"]]);
    expect(rows[1].text).toBe("Hair mask or 20% off");
  });
  it("says ready when the card has the stamps for the reward due", () => {
    const rows = ladderRows(stampState(tiers, 3, 0), texts);
    expect(rows.map((r) => r.status)).toEqual(["ready", "later", "later"]);
    expect(rows[0].filled).toBe(3);
  });
  it("a new card is all empty", () => {
    expect(ladderRows(stampState(tiers, 0, 0), texts).map((r) => r.filled)).toEqual([0, 0, 0]);
  });
  it("only ladders that fit the strip are drawn", () => {
    expect(ladderFits(ladderRows(stampState(tiers, 0, 0), texts))).toBe(true);
    const long = [{ at: 5, text: "a" }, { at: 10, text: "b" }];
    expect(ladderFits(ladderRows(stampState(long, 0, 0), ["a", "b"]))).toBe(false);
  });
});

describe("Spaloon stamp card", () => {
  it("has a valid colour file", () => {
    const st = stampCardStyle("spaloon");
    expect(st?.background).toBe("#EFE8D8");
    expect(rgb(st!.background)).toBe("rgb(239, 232, 216)");
    expect(st?.short?.ar?.[1]).toBe("ماسك أو خصم ٢٠٪");
    expect(stampCardStyle("orbyn")).toBeNull();
  });
  it("draws the strip at Apple's store card size (375 x 123 pt)", async () => {
    const files = await stampStripImages("spaloon", ladderRows(stampState(tiers, 1, 1), texts), stampCardStyle("spaloon")!);
    expect(files).not.toBeNull();
    expect(pngSize(files!["strip.png"])).toEqual({ width: 375, height: 123 });
    expect(pngSize(files!["strip@2x.png"])).toEqual({ width: 750, height: 246 });
    expect(pngSize(files!["strip@3x.png"])).toEqual({ width: 1125, height: 369 });
    if (process.env.STRIP_OUT) {
      writeFileSync(`${process.env.STRIP_OUT}/strip-4.png`, files!["strip@3x.png"]);
      const ready = await stampStripImages("spaloon", ladderRows(stampState(tiers, 3, 0), texts), stampCardStyle("spaloon")!);
      writeFileSync(`${process.env.STRIP_OUT}/strip-ready.png`, ready!["strip@3x.png"]);
      const arTexts = ["خصم ١٠٪ على زيارتك", "ماسك شعر أو خصم ٢٠٪", "قصة شعر مجانية"];
      const ar4 = await stampStripImages("spaloon", ladderRows(stampState(tiers, 1, 1), arTexts), stampCardStyle("spaloon")!, "ar");
      writeFileSync(`${process.env.STRIP_OUT}/strip-ar-4.png`, ar4!["strip@3x.png"]);
      const arReady = await stampStripImages("spaloon", ladderRows(stampState(tiers, 3, 0), arTexts), stampCardStyle("spaloon")!, "ar");
      writeFileSync(`${process.env.STRIP_OUT}/strip-ar-ready.png`, arReady!["strip@3x.png"]);
    }
  }, 20000);
});
