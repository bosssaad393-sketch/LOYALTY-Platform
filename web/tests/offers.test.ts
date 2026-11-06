import { describe, expect, it } from "vitest";
import {
  DUPLICATE_WINDOW_MS,
  NO_OFFER_TEXT,
  OFFER_WINDOW_MS,
  OfferInput,
  activeOffer,
  agreedToNews,
  appleOfferField,
  applePlan,
  appliesTo,
  cleanMessage,
  countCards,
  eligibleCardIds,
  findRecentDuplicate,
  normaliseMember,
  offerStamp,
  offerView,
  type CardConsentRow,
} from "../src/lib/offers";

const NOW = Date.parse("2026-10-15T18:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 86_400_000;

describe("OfferInput (validation)", () => {
  it("accepts a normal message and defaults the audience to all", () => {
    const r = OfferInput.safeParse({ message: "Double points this Friday, from 7 pm." });
    expect(r.success && r.data).toEqual({ message: "Double points this Friday, from 7 pm.", audience: "all" });
  });
  it("trims and turns line breaks into spaces", () => {
    const r = OfferInput.safeParse({ message: "  Free\n\ncoffee\tthis   week \r\n", audience: "apple" });
    expect(r.success && r.data.message).toBe("Free coffee this week");
  });
  it("allows exactly 200 characters, not 201", () => {
    expect(OfferInput.safeParse({ message: "a".repeat(200), audience: "google" }).success).toBe(true);
    expect(OfferInput.safeParse({ message: "a".repeat(201), audience: "all" }).success).toBe(false);
  });
  it("rejects empty or blank messages", () => {
    for (const message of ["", "   ", "\n\t "]) expect(OfferInput.safeParse({ message, audience: "all" }).success).toBe(false);
  });
  it("rejects a bad audience, a missing message and non-objects", () => {
    expect(OfferInput.safeParse({ message: "Hi", audience: "everyone" }).success).toBe(false);
    expect(OfferInput.safeParse({ audience: "all" }).success).toBe(false);
    expect(OfferInput.safeParse({ message: 42 }).success).toBe(false);
    expect(OfferInput.safeParse(null).success).toBe(false);
    expect(OfferInput.safeParse("hello").success).toBe(false);
  });
  it("strips control characters", () => {
    expect(cleanMessage("a\u0000b\u0007c\u007fd")).toBe("a b c d");
  });
  it("keeps Arabic and emoji", () => {
    expect(cleanMessage("ضعف النقاط يوم الجمعة 🎉")).toBe("ضعف النقاط يوم الجمعة 🎉");
  });
});

describe("who can receive an offer (eligibility)", () => {
  const rows: CardConsentRow[] = [
    { id: "a", members: { consent_news: true, deleted_at: null } },
    { id: "b", members: { consent_news: false, deleted_at: null } },
    { id: "c", members: { consent_news: true, deleted_at: "2026-10-01T00:00:00Z" } }, // deleted: not counted at all
    { id: "d", members: null },
    { id: "e", members: { consent_news: null, deleted_at: null } }, // unclear counts as no
    { id: "f", members: { consent_news: true, deleted_at: null } },
  ];
  it("counts only guests who agreed and still exist", () => {
    expect(eligibleCardIds(rows)).toEqual(["a", "f"]);
    expect(countCards(rows)).toEqual({ total: 4, eligible: 2 });
  });
  it("is zero for an empty venue", () => {
    expect(countCards([])).toEqual({ total: 0, eligible: 0 });
  });
  it("agreedToNews needs an explicit yes", () => {
    expect(agreedToNews({ consent_news: true, deleted_at: null })).toBe(true);
    expect(agreedToNews({ consent_news: false, deleted_at: null })).toBe(false);
    expect(agreedToNews(null)).toBe(false);
  });
  it("reads a joined member whether it comes as an object or a one-item list", () => {
    expect(normaliseMember({ consent_news: true, deleted_at: null })).toEqual({ consent_news: true, deleted_at: null });
    expect(normaliseMember([{ consent_news: true, deleted_at: null }])).toEqual({ consent_news: true, deleted_at: null });
    expect(normaliseMember([])).toBeNull();
    expect(normaliseMember(undefined)).toBeNull();
    expect(normaliseMember("x")).toBeNull();
  });
  it("applePlan counts distinct cards and distinct devices", () => {
    const plan = applePlan([
      { card_id: "a", push_token: "t1" },
      { card_id: "a", push_token: "t2" }, // two devices, one card
      { card_id: "b", push_token: "t1" }, // same device, second card
    ]);
    expect(plan.cards).toBe(2);
    expect(plan.tokens.sort()).toEqual(["t1", "t2"]);
    expect(applePlan([])).toEqual({ cards: 0, tokens: [] });
  });
});

describe("audience", () => {
  it("all reaches both, apple and google reach their own platform only", () => {
    expect(appliesTo("all", "apple") && appliesTo("all", "google")).toBe(true);
    expect(appliesTo("apple", "apple")).toBe(true);
    expect(appliesTo("apple", "google")).toBe(false);
    expect(appliesTo("google", "apple")).toBe(false);
    expect(appliesTo("google", "google")).toBe(true);
  });
});

describe("the 14-day window", () => {
  const offer = (message: string, sentAgo: number, audience = "all") => ({ message, audience, sent_at: ago(sentAgo) });

  it("picks the newest offer inside the window", () => {
    const list = [offer("old", 10 * DAY), offer("new", 1 * DAY), offer("mid", 5 * DAY)];
    expect(activeOffer(list, "apple", NOW)?.message).toBe("new");
  });
  it("includes the 14th day and drops anything older", () => {
    expect(activeOffer([offer("edge", OFFER_WINDOW_MS)], "apple", NOW)?.message).toBe("edge");
    expect(activeOffer([offer("gone", OFFER_WINDOW_MS + 1)], "apple", NOW)).toBeNull();
    expect(activeOffer([offer("gone", 15 * DAY)], "apple", NOW)).toBeNull();
  });
  it("is null when there are no offers", () => {
    expect(activeOffer([], "apple", NOW)).toBeNull();
  });
  it("respects the audience", () => {
    const list = [offer("g", 1000, "google"), offer("a", 2000, "apple")];
    expect(activeOffer(list, "apple", NOW)?.message).toBe("a");
    expect(activeOffer(list, "google", NOW)?.message).toBe("g");
    expect(activeOffer([offer("g", 1000, "google")], "apple", NOW)).toBeNull();
  });
  it("still counts an offer dated a little in the future (clock difference)", () => {
    expect(activeOffer([offer("now", -5000)], "apple", NOW)?.message).toBe("now");
  });
  it("ignores rows with a broken date", () => {
    expect(activeOffer([{ message: "x", audience: "all", sent_at: "not a date" }], "apple", NOW)).toBeNull();
  });
});

describe("offerStamp (when the offer on a card last changed)", () => {
  it("is the send time while the offer is live", () => {
    expect(offerStamp(ago(3 * DAY), NOW)).toBe(NOW - 3 * DAY);
  });
  it("is the moment it ran out once the window has passed", () => {
    const sent = NOW - 20 * DAY;
    expect(offerStamp(sent, NOW)).toBe(sent + OFFER_WINDOW_MS);
  });
  it("is 0 when no offer was ever sent or the date is broken", () => {
    expect(offerStamp(null, NOW)).toBe(0);
    expect(offerStamp(undefined, NOW)).toBe(0);
    expect(offerStamp("nope", NOW)).toBe(0);
  });
  it("is newer than the previous check right after a send", () => {
    const previousCheck = NOW - 60_000;
    expect(offerStamp(ago(1000), NOW)).toBeGreaterThan(previousCheck);
  });
});

describe("double tap", () => {
  const sent = (message: string, audience: string, msAgo: number) => ({ id: "x", message, audience, sent_at: ago(msAgo) });
  it("finds the same message sent seconds ago", () => {
    expect(findRecentDuplicate([sent("Hi", "all", 5000)], "Hi", "all", NOW)).not.toBeNull();
  });
  it("does not match a different message, another audience or an old send", () => {
    expect(findRecentDuplicate([sent("Hi", "all", 5000)], "Hello", "all", NOW)).toBeNull();
    expect(findRecentDuplicate([sent("Hi", "apple", 5000)], "Hi", "all", NOW)).toBeNull();
    expect(findRecentDuplicate([sent("Hi", "all", DUPLICATE_WINDOW_MS + 1)], "Hi", "all", NOW)).toBeNull();
  });
});

describe("Apple back field", () => {
  it("a live offer carries the message and changeMessage %@", () => {
    expect(appleOfferField("Orbyn", "Double points on Friday")).toEqual({
      key: "offer",
      label: "From Orbyn",
      value: "Double points on Friday",
      changeMessage: "%@",
    });
  });
  it("without an offer it shows a neutral line and never an alert", () => {
    const f = appleOfferField("Orbyn", null);
    expect(f.value).toBe(NO_OFFER_TEXT);
    expect("changeMessage" in f).toBe(false);
    expect(f.key).toBe("offer");
  });
});

describe("offerView (API shape)", () => {
  it("maps a database row to the contract shape", () => {
    expect(offerView({ id: "1", message: "Hi", audience: "apple", sent_at: "2026-10-15T18:02:11.123+00:00", recipients: 212 })).toEqual({
      id: "1",
      message: "Hi",
      audience: "apple",
      sentAt: "2026-10-15T18:02:11.123Z",
      recipients: 212,
    });
  });
  it("defaults missing recipients to 0 and an unknown audience to all", () => {
    const v = offerView({ id: "1", message: "Hi", audience: "weird", sent_at: "2026-10-15T18:02:11Z" });
    expect(v.recipients).toBe(0);
    expect(v.audience).toBe("all");
  });
});
