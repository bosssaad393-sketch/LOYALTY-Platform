import { describe, expect, it } from "vitest";
import { TERMS_MAX_CHARS, TERMS_MIN_CHARS, TermsInput, cleanTerms, defaultClauses, defaultTermsText, parseTerms } from "../src/lib/terms";

const long = (n: number) => "x".repeat(n);

describe("TermsInput (validation)", () => {
  it("accepts 50 to 8000 characters", () => {
    expect(TermsInput.safeParse({ text: long(TERMS_MIN_CHARS) }).success).toBe(true);
    expect(TermsInput.safeParse({ text: long(TERMS_MAX_CHARS) }).success).toBe(true);
  });
  it("rejects 49 and 8001", () => {
    expect(TermsInput.safeParse({ text: long(TERMS_MIN_CHARS - 1) }).success).toBe(false);
    expect(TermsInput.safeParse({ text: long(TERMS_MAX_CHARS + 1) }).success).toBe(false);
  });
  it("counts the trimmed text", () => {
    expect(TermsInput.safeParse({ text: `   ${long(49)}   ` }).success).toBe(false);
  });
  it("rejects missing or non-string text", () => {
    expect(TermsInput.safeParse({}).success).toBe(false);
    expect(TermsInput.safeParse({ text: 5 }).success).toBe(false);
    expect(TermsInput.safeParse(null).success).toBe(false);
  });
  it("cleans line endings and control characters but keeps paragraphs", () => {
    const r = TermsInput.safeParse({ text: `Title\r\nBody${long(60)}\u0000\n\n\n\nSecond` });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.text).toBe(`Title\nBody${long(60)}\n\nSecond`);
  });
});

describe("cleanTerms", () => {
  it("drops control characters, trailing spaces and extra blank lines", () => {
    expect(cleanTerms("a \u0007b  \n\n\n\nc\t\n")).toBe("a b\n\nc");
  });
});

describe("default clauses", () => {
  it("name the venue and keep the six built-in clauses", () => {
    const c = defaultClauses("Demo Venue");
    expect(c.map(([t]) => t)).toEqual(["Your card", "Your details", "Notifications", "Rewards", "Deleting your data", "Powered by LOYALTY"]);
    expect(c[0][1]).toContain("Demo Venue Loyalty Rewards");
  });
  it("the editor text for the default terms passes validation", () => {
    expect(TermsInput.safeParse({ text: defaultTermsText("Demo Venue") }).success).toBe(true);
  });
  it("round-trips: text made from the default clauses parses back to the same clauses", () => {
    expect(parseTerms(defaultTermsText("Demo Venue"))).toEqual(defaultClauses("Demo Venue"));
  });
});

describe("parseTerms", () => {
  it("title line plus text becomes one clause", () => {
    expect(parseTerms("Opening hours\nEvery day from noon to midnight.")).toEqual([["Opening hours", "Every day from noon to midnight."]]);
  });
  it("blank lines separate clauses", () => {
    expect(parseTerms("One\nFirst text.\n\nTwo\nSecond text.")).toEqual([
      ["One", "First text."],
      ["Two", "Second text."],
    ]);
  });
  it("a block without a short title line has no title", () => {
    expect(parseTerms("Points have no cash value and can change at any time.")).toEqual([["", "Points have no cash value and can change at any time."]]);
    expect(parseTerms("This is a long first line that ends like a sentence.\nAnd a second line.")).toEqual([
      ["", "This is a long first line that ends like a sentence. And a second line."],
    ]);
  });
  it("a long first line is never a title", () => {
    const first = "A".repeat(61);
    expect(parseTerms(`${first}\nrest`)[0][0]).toBe("");
  });
  it("returns nothing for empty text", () => {
    expect(parseTerms("")).toEqual([]);
    expect(parseTerms("\n\n  \n")).toEqual([]);
  });
  it("keeps markup as plain text (the page escapes it)", () => {
    expect(parseTerms("<script>alert(1)</script> is just words here, not code, and long enough.")[0][1]).toContain("<script>");
  });
});
