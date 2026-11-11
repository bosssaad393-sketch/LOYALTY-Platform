import { describe, expect, it } from "vitest";
import { vcard, venueContact } from "../src/lib/contact";
import { feedbackView, FeedbackInput } from "../src/lib/feedbackRules";

describe("the contact card", () => {
  it("is blank when nothing is set, and never invents a detail", () => {
    expect(venueContact({})).toEqual({ phone: null, whatsapp: null, email: null, website: null });
  });

  it("drops malformed values", () => {
    const c = venueContact({ BRAND_EMAIL: "not an email", BRAND_WEBSITE: "http://plain.test", BRAND_PHONE: "call me" });
    expect(c).toEqual({ phone: null, whatsapp: null, email: null, website: null });
  });

  it("writes a vCard with only the details that exist", () => {
    const v = vcard("Orbyn; Lounge", { phone: null, whatsapp: null, email: null, website: null }, "https://o.test");
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(v).toContain("FN:Orbyn\\; Lounge");
    expect(v).toContain("URL:https://o.test");
    expect(v).not.toContain("TEL");
    expect(v).not.toContain("EMAIL");
    expect(v.trimEnd().endsWith("END:VCARD")).toBe(true);
  });
});

describe("feedback rules", () => {
  it("accepts a rating from 1 to 5 and trims the message", () => {
    expect(FeedbackInput.parse({ venue: "orbyn", rating: 4, message: "  good  " })).toEqual({ venue: "orbyn", rating: 4, message: "good" });
    expect(FeedbackInput.safeParse({ venue: "orbyn", rating: 0 }).success).toBe(false);
    expect(FeedbackInput.safeParse({ venue: "orbyn", rating: 6 }).success).toBe(false);
    expect(FeedbackInput.safeParse({ venue: "orbyn", rating: 3, message: "x".repeat(601) }).success).toBe(false);
    expect(FeedbackInput.safeParse({ venue: "Not A Slug", rating: 3 }).success).toBe(false);
  });

  it("summarises for the owner: newest first, average, low ratings", () => {
    const item = (id: string, rating: number, createdAt: string) => ({ id, rating, message: "", firstName: null, createdAt });
    const v = feedbackView([item("a", 5, "2026-11-01T10:00:00Z"), item("b", 2, "2026-11-03T10:00:00Z"), item("c", 4, "2026-11-02T10:00:00Z")]);
    expect(v.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(v).toMatchObject({ count: 3, average: 3.7, low: 1 });
    expect(feedbackView([])).toMatchObject({ count: 0, average: null, low: 0 });
  });
});
