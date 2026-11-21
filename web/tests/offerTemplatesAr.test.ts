import { describe, expect, it } from "vitest";
import { OFFER_TEMPLATES, fillTemplate } from "../src/app/owner/offerTemplates";
import { OFFER_TEMPLATES_AR, localTemplate } from "../src/app/owner/offerTemplatesAr";
import { MESSAGE_LIMIT } from "../src/app/owner/offerRules";

// The Arabic message templates follow the same rules as the English ones: every template has one, the same {keys},
// within the Wallet limit when filled (with examples and in the worst case), no exclamation marks.

const keys = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Arabic offer templates", () => {
  it("cover every template with the same placeholders", () => {
    for (const t of OFFER_TEMPLATES) {
      const ar = OFFER_TEMPLATES_AR[t.id];
      expect(ar, t.id).toBeDefined();
      expect(keys(ar.text), t.id).toEqual(keys(t.text));
      expect(Object.keys(ar.fields).sort(), t.id).toEqual(t.fields.map((f) => f.key).sort());
    }
  });
  it("stay within the Wallet limit and the house style", () => {
    for (const t of OFFER_TEMPLATES) {
      const ar = localTemplate(t, "ar");
      const withExamples = fillTemplate(ar, {});
      const worst = fillTemplate(ar, Object.fromEntries(ar.fields.map((f) => [f.key, "س".repeat(f.maxLength)])));
      expect(withExamples.length, t.id).toBeLessThanOrEqual(MESSAGE_LIMIT);
      expect(worst.length, t.id).toBeLessThanOrEqual(MESSAGE_LIMIT);
      expect(withExamples, t.id).not.toMatch(/[!！{}]/);
    }
  });
  it("leaves English templates alone", () => {
    expect(localTemplate(OFFER_TEMPLATES[0], "en")).toBe(OFFER_TEMPLATES[0]);
  });
});
