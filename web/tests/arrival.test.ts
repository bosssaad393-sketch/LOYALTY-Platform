import { describe, expect, it } from "vitest";
import { ARRIVAL_RADIUS_M, arrivalLocations } from "../src/lib/arrival";

// The welcome on the lock screen near the venue: one place and one line, from the deployment's settings.

describe("the place and the line written on the card", () => {
  it("uses the venue's own place and its own words", () => {
    expect(arrivalLocations("Spaloon", { BRAND_PIN: "26.2338508,50.5965259", BRAND_ARRIVAL_TEXT: "حياك تنورنا يا غالي" })).toEqual([
      { latitude: 26.2338508, longitude: 50.5965259, relevantText: "حياك تنورنا يا غالي" },
    ]);
    expect(ARRIVAL_RADIUS_M).toBe(100);
  });

  it("has a plain line when no words are set, and reads a place typed with spaces", () => {
    expect(arrivalLocations("Spaloon", { BRAND_PIN: " 26.23 , 50.59 " })).toEqual([{ latitude: 26.23, longitude: 50.59, relevantText: "Welcome to Spaloon. Show your card." }]);
    expect(arrivalLocations("Spaloon", { BRAND_PIN: "26.23,50.59", BRAND_ARRIVAL_TEXT: "   " })[0].relevantText).toBe("Welcome to Spaloon. Show your card.");
  });

  it("keeps the line short enough for a lock screen", () => {
    expect(arrivalLocations("V", { BRAND_PIN: "26.23,50.59", BRAND_ARRIVAL_TEXT: "x".repeat(300) })[0].relevantText).toHaveLength(80);
  });

  it("writes no place at all when none is set or it is not a real place", () => {
    for (const pin of [undefined, "", "Manama", "26.23", "26.23;50.59", "91,50", "26,181", "0,0", "26.23,50.59,7"]) {
      expect(arrivalLocations("V", { BRAND_PIN: pin, BRAND_ARRIVAL_TEXT: "hello" }), String(pin)).toEqual([]);
    }
  });
});
