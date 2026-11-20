import { describe, expect, it } from "vitest";
import { parseTiers, stampState } from "./stamps";

const SPALOON = [
  { at: 3, text: "10% off" },
  { at: 6, text: "Free hair mask or 20% off" },
  { at: 9, text: "Free haircut" },
];

describe("parseTiers", () => {
  it("accepts a growing ladder", () => {
    expect(parseTiers(SPALOON)).toEqual(SPALOON);
  });
  it("refuses anything malformed (so the venue stays on points)", () => {
    expect(parseTiers(null)).toBeNull();
    expect(parseTiers([])).toBeNull();
    expect(parseTiers([{ at: 3, text: "a" }, { at: 3, text: "b" }])).toBeNull();
    expect(parseTiers([{ at: 0, text: "a" }])).toBeNull();
    expect(parseTiers([{ at: 3, text: " " }])).toBeNull();
  });
});

describe("stampState", () => {
  const t = parseTiers(SPALOON)!;
  it("first reward after 3 stamps", () => {
    expect(stampState(t, 2, 0)).toMatchObject({ index: 0, cost: 3, ready: false, position: 2, reward: "10% off" });
    expect(stampState(t, 3, 0)).toMatchObject({ ready: true, position: 3 });
  });
  it("after the first reward is used, the second is due and the ladder continues from 3", () => {
    expect(stampState(t, 1, 1)).toMatchObject({ index: 1, cost: 3, ready: false, position: 4, reward: "Free hair mask or 20% off" });
  });
  it("third reward, then the card starts again", () => {
    expect(stampState(t, 3, 2)).toMatchObject({ index: 2, ready: true, position: 9, reward: "Free haircut" });
    expect(stampState(t, 0, 3)).toMatchObject({ index: 0, position: 0, reward: "10% off" });
  });
  it("a guest who saves stamps never shows past the end of the ladder", () => {
    expect(stampState(t, 12, 2).position).toBe(9);
  });
});
