import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNED_BY,
  OFFER_TEMPLATES,
  fillTemplate,
  type OfferTemplate,
} from "../src/app/owner/offerTemplates";

// Hard limit for a Wallet notification (same as the offers API).
const LIMIT = 200;

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
const placeholdersOf = (text: string): string[] => Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]);
const examples = (t: OfferTemplate): Record<string, string> => Object.fromEntries(t.fields.map((f) => [f.key, f.example]));
const worstCase = (t: OfferTemplate): Record<string, string> =>
  Object.fromEntries(t.fields.map((f) => [f.key, "w".repeat(f.maxLength)]));

// Everything an owner could read on the screen, including the fixed words around the fields.
const visibleText = (t: OfferTemplate): string[] => [
  t.title,
  t.when,
  t.text,
  fillTemplate(t, examples(t)),
  ...t.fields.flatMap((f) => [f.label, f.example]),
];

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{200D}\u{FE0F}]/u;
const ALL_CAPS_WORD = /\b[A-Z]{2,}\b/;
const PRESSURE =
  /\b(hurry|last chance|final call|limited time|limited offer|only today|today only|don'?t miss|do not miss|act now|urgent|running out|while stocks last|before it'?s too late|now or never|don'?t wait|rush)\b/i;
const ALCOHOL =
  /\b(alcohol\w*|wines?|cocktails?|beers?|champagne|whisk(e)?y|vodka|liquor|spirits|brandy|rum|gin|prosecco|bar|drinks?)\b/i;

describe("template list", () => {
  it("has 10 to 12 templates", () => {
    expect(OFFER_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(OFFER_TEMPLATES.length).toBeLessThanOrEqual(12);
  });

  it("starts with the sample Today's update, exactly as agreed", () => {
    const [first] = OFFER_TEMPLATES;
    expect(first.id).toBe("todays-update");
    expect(first.sample).toBe(true);
    expect(first.title).toBe("Today's update");
    expect(first.text).toBe("Update from {from}: today's reward is {reward}. Today's bonus is {bonus}.");
    expect(first.fields.map((f) => f.key)).toEqual(["from", "reward", "bonus"]);
    expect(DEFAULT_SIGNED_BY).toBe("the manager");
    expect(first.fields[0].example).toBe(DEFAULT_SIGNED_BY);
    expect(first.fields[1].example).toBe("a complimentary dessert with any main");
    expect(first.fields[2].example).toBe("double points until midnight");
  });

  it("marks only the first template as the sample", () => {
    expect(OFFER_TEMPLATES.filter((t) => t.sample).map((t) => t.id)).toEqual(["todays-update"]);
  });

  it("has unique kebab-case ids", () => {
    const ids = OFFER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a short title (2 to 4 words) and a one-line 'when' on every template", () => {
    for (const t of OFFER_TEMPLATES) {
      const words = t.title.trim().split(/\s+/).length;
      expect(words, t.id).toBeGreaterThanOrEqual(2);
      expect(words, t.id).toBeLessThanOrEqual(4);
      expect(t.when.trim().length, t.id).toBeGreaterThan(10);
      expect(t.when, t.id).not.toMatch(/\n/);
    }
  });
});

describe("placeholders and fields", () => {
  it("has a field for every {placeholder} and a placeholder for every field", () => {
    for (const t of OFFER_TEMPLATES) {
      const used = new Set(placeholdersOf(t.text));
      const declared = t.fields.map((f) => f.key);
      expect(new Set(declared).size, `${t.id}: duplicate field keys`).toBe(declared.length);
      expect([...used].sort(), t.id).toEqual([...declared].sort());
    }
  });

  it("lists the fields in the order they appear in the text", () => {
    for (const t of OFFER_TEMPLATES) {
      const order = [...new Set(placeholdersOf(t.text))];
      expect(t.fields.map((f) => f.key), t.id).toEqual(order);
    }
  });

  it("gives every field a label, an example and a sensible maxLength", () => {
    for (const t of OFFER_TEMPLATES) {
      expect(t.fields.length, t.id).toBeGreaterThan(0);
      for (const f of t.fields) {
        expect(f.key, t.id).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(f.label.trim().length, `${t.id}.${f.key} label`).toBeGreaterThan(0);
        expect(f.example.trim().length, `${t.id}.${f.key} example`).toBeGreaterThan(0);
        expect(f.maxLength, `${t.id}.${f.key} maxLength`).toBeGreaterThan(0);
        expect(f.example.length, `${t.id}.${f.key} example fits maxLength`).toBeLessThanOrEqual(f.maxLength);
      }
    }
  });
});

describe("length", () => {
  it("is 200 characters or fewer when filled with the examples", () => {
    for (const t of OFFER_TEMPLATES) {
      expect(fillTemplate(t, examples(t)).length, t.id).toBeLessThanOrEqual(LIMIT);
    }
  });

  it("stays 200 characters or fewer even when every field is filled to its maxLength", () => {
    for (const t of OFFER_TEMPLATES) {
      expect(fillTemplate(t, worstCase(t)).length, t.id).toBeLessThanOrEqual(LIMIT);
    }
  });

  it("is not tiny: a message with the examples says something (at least 60 characters)", () => {
    for (const t of OFFER_TEMPLATES) {
      expect(fillTemplate(t, examples(t)).length, t.id).toBeGreaterThanOrEqual(60);
    }
  });

  it("does not leave a placeholder behind when filled with the examples or with nothing", () => {
    for (const t of OFFER_TEMPLATES) {
      expect(fillTemplate(t, examples(t)), t.id).not.toMatch(/[{}]/);
      expect(fillTemplate(t, {}), t.id).not.toMatch(/[{}]/);
    }
  });
});

describe("tone and safety", () => {
  it("has no exclamation marks", () => {
    for (const t of OFFER_TEMPLATES) for (const s of visibleText(t)) expect(s, t.id).not.toMatch(/[!！]/);
  });

  it("has no emojis or pictograms", () => {
    for (const t of OFFER_TEMPLATES) for (const s of visibleText(t)) expect(s, t.id).not.toMatch(EMOJI);
  });

  it("has no ALL CAPS words", () => {
    for (const t of OFFER_TEMPLATES) for (const s of visibleText(t)) expect(s, `${t.id}: ${s}`).not.toMatch(ALL_CAPS_WORD);
  });

  it("uses no pressure words", () => {
    for (const t of OFFER_TEMPLATES) for (const s of visibleText(t)) expect(s, `${t.id}: ${s}`).not.toMatch(PRESSURE);
  });

  it("never mentions alcohol or drinks", () => {
    for (const t of OFFER_TEMPLATES) for (const s of visibleText(t)) expect(s, `${t.id}: ${s}`).not.toMatch(ALCOHOL);
  });

  it("states no facts in the fixed words: no digits, percentages, currency or the venue name", () => {
    for (const t of OFFER_TEMPLATES) {
      const fixed = t.text.replace(PLACEHOLDER, "");
      expect(fixed, t.id).not.toMatch(/[0-9%]/);
      expect(fixed, t.id).not.toMatch(/\b(BHD|BD|Orbyn|free|discount|off)\b/i);
    }
  });

  it("does not use a placeholder as the very first thing on the lock screen, except where the sender or event leads", () => {
    // The first 40 characters carry the point: a template may open with a placeholder only when it IS the point.
    const mayOpenWithField = new Set(["event-evening", "seasonal-greeting"]);
    for (const t of OFFER_TEMPLATES) {
      if (mayOpenWithField.has(t.id)) continue;
      expect(t.text.startsWith("{"), t.id).toBe(false);
    }
  });
});

describe("fillTemplate", () => {
  const t = OFFER_TEMPLATES[0];

  it("replaces every placeholder with the given values", () => {
    expect(fillTemplate(t, { from: "Layla", reward: "a coffee", bonus: "triple points" })).toBe(
      "Update from Layla: today's reward is a coffee. Today's bonus is triple points.",
    );
  });

  it("gives the agreed sample message when filled with the examples", () => {
    expect(fillTemplate(t, {})).toBe(
      "Update from the manager: today's reward is a complimentary dessert with any main. Today's bonus is double points until midnight.",
    );
  });

  it("trims values", () => {
    expect(fillTemplate(t, { from: "  Layla  ", reward: "\t a coffee \n", bonus: " triple points " })).toBe(
      "Update from Layla: today's reward is a coffee. Today's bonus is triple points.",
    );
  });

  it("collapses repeated spaces, tabs and line breaks into one space", () => {
    expect(fillTemplate(t, { from: "the   team", reward: "a\n\ncoffee\tand   cake", bonus: "x" })).toBe(
      "Update from the team: today's reward is a coffee and cake. Today's bonus is x.",
    );
  });

  it("falls back to the example for a blank, whitespace-only or missing value", () => {
    expect(fillTemplate(t, { from: "Layla", reward: "", bonus: "   " })).toBe(
      "Update from Layla: today's reward is a complimentary dessert with any main. Today's bonus is double points until midnight.",
    );
    expect(fillTemplate(t, { from: "Layla", reward: "a coffee" })).toBe(
      "Update from Layla: today's reward is a coffee. Today's bonus is double points until midnight.",
    );
  });

  it("ignores values for keys the template does not have", () => {
    expect(fillTemplate(t, { nonsense: "boo" })).toBe(fillTemplate(t, {}));
  });

  it("does not expand placeholders typed inside a value, and keeps $ characters literal", () => {
    const out = fillTemplate(t, { from: "{reward}", reward: "$& and $1", bonus: "x" });
    expect(out).toBe("Update from {reward}: today's reward is $& and $1. Today's bonus is x.");
  });

  it("reduces a double full stop caused by a value ending in a full stop, and keeps an ellipsis", () => {
    expect(fillTemplate(t, { from: "Layla", reward: "a coffee.", bonus: "x" })).toBe(
      "Update from Layla: today's reward is a coffee. Today's bonus is x.",
    );
    expect(fillTemplate(t, { from: "Layla", reward: "a coffee...", bonus: "x" })).toBe(
      "Update from Layla: today's reward is a coffee... Today's bonus is x.",
    );
    expect(fillTemplate(t, { from: "Layla", reward: "a coffee..", bonus: "x" })).toBe(
      "Update from Layla: today's reward is a coffee... Today's bonus is x.",
    );
  });

  it("does not shorten a long value (the screen checks the limit)", () => {
    const long = "a".repeat(300);
    expect(fillTemplate(t, { from: "Layla", reward: long, bonus: "x" }).length).toBeGreaterThan(LIMIT);
  });

  it("does not take a value from the prototype chain", () => {
    const tricky: OfferTemplate = {
      id: "tricky",
      title: "Tricky test",
      when: "Only for the unit test.",
      text: "Hello {constructor}.",
      fields: [{ key: "constructor", label: "Name", example: "friend", maxLength: 20 }],
    };
    expect(fillTemplate(tricky, {})).toBe("Hello friend.");
    expect(fillTemplate(tricky, Object.create({ constructor: "evil" }) as Record<string, string>)).toBe("Hello friend.");
  });

  it("leaves a placeholder that has no field untouched instead of inventing text", () => {
    const loose: OfferTemplate = { ...t, id: "loose", text: "Hello {name}.", fields: [] };
    expect(fillTemplate(loose, { name: "Layla" })).toBe("Hello Layla.");
    expect(fillTemplate(loose, {})).toBe("Hello {name}.");
  });
});
