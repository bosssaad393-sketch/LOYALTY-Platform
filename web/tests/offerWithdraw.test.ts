import { describe, expect, it } from "vitest";
import {
  NO_OFFER_TEXT,
  OFFER_WINDOW_MS,
  activeOffer,
  appleOfferField,
  appleOfferSelection,
  findRecentDuplicate,
  inWindow,
  isOfferId,
  isWithdrawn,
  offerChangeStamp,
  offerListItem,
  offerView,
} from "../src/lib/offers";
import { ACCESS, roleAllowed } from "../src/lib/roles";

// Pure rules for withdrawing an offer. No database, no framework.

const NOW = Date.parse("2026-10-16T12:00:00Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const offer = (message: string, sentAgo: number, extra: { audience?: string; withdrawnAgo?: number } = {}) => ({
  message,
  audience: extra.audience ?? "all",
  sent_at: ago(sentAgo),
  withdrawn_at: extra.withdrawnAgo === undefined ? null : ago(extra.withdrawnAgo),
});

describe("the id in the address", () => {
  it("accepts a uuid, in either case", () => {
    expect(isOfferId("3f6b2c1e-8a4d-4c1b-9e57-0a1b2c3d4e5f")).toBe(true);
    expect(isOfferId("3F6B2C1E-8A4D-4C1B-9E57-0A1B2C3D4E5F")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "abc", "123", "3f6b2c1e-8a4d-4c1b-9e57", "3f6b2c1e8a4d4c1b9e570a1b2c3d4e5f", "' or 1=1 --", "../../etc", undefined, null, 42]) {
      expect(isOfferId(bad)).toBe(false);
    }
  });
});

describe("a withdrawn offer never shows on a card", () => {
  it("is skipped, and the previous live offer inside the 14 days shows instead", () => {
    const list = [offer("A: older", 5 * DAY), offer("B: newest, withdrawn", 1 * DAY, { withdrawnAgo: 1000 })];
    expect(activeOffer(list, "apple", NOW)?.message).toBe("A: older");
    expect(activeOffer(list, "google", NOW)?.message).toBe("A: older");
  });
  it("shows nothing when the previous offer is already past the 14 days", () => {
    const list = [offer("A: too old", 15 * DAY), offer("B: withdrawn", 1 * DAY, { withdrawnAgo: 1000 })];
    expect(activeOffer(list, "apple", NOW)).toBeNull();
  });
  it("shows nothing when every offer is withdrawn", () => {
    const list = [offer("A", 3 * DAY, { withdrawnAgo: 2 * DAY }), offer("B", 1 * DAY, { withdrawnAgo: 1000 })];
    expect(activeOffer(list, "apple", NOW)).toBeNull();
  });
  it("still takes the 14th day as the edge for the offer that falls back", () => {
    const list = [offer("A: on the edge", OFFER_WINDOW_MS), offer("B", 1000, { withdrawnAgo: 500 })];
    expect(activeOffer(list, "apple", NOW)?.message).toBe("A: on the edge");
    expect(activeOffer([offer("A: one ms late", OFFER_WINDOW_MS + 1), offer("B", 1000, { withdrawnAgo: 500 })], "apple", NOW)).toBeNull();
  });
  it("treats any non-empty withdrawn_at as withdrawn, even an unreadable date (hide rather than show)", () => {
    expect(isWithdrawn({ withdrawn_at: "garbage" })).toBe(true);
    expect(isWithdrawn({ withdrawn_at: null })).toBe(false);
    expect(isWithdrawn({})).toBe(false);
    expect(activeOffer([{ message: "x", audience: "all", sent_at: ago(1000), withdrawn_at: "garbage" }], "apple", NOW)).toBeNull();
  });
  it("leaves rows without the column alone (older callers)", () => {
    expect(activeOffer([{ message: "x", audience: "all", sent_at: ago(1000) }], "apple", NOW)?.message).toBe("x");
  });
});

describe("sending the text of a withdrawn offer again", () => {
  const sent = (message: string, msAgo: number, withdrawnAgo: number | null) => ({
    id: "x",
    message,
    audience: "all",
    sent_at: ago(msAgo),
    withdrawn_at: withdrawnAgo === null ? null : ago(withdrawnAgo),
  });
  it("is a new send, not a double tap", () => {
    expect(findRecentDuplicate([sent("Hi", 5000, 1000)], "Hi", "all", NOW)).toBeNull();
  });
  it("a live copy is still a double tap", () => {
    expect(findRecentDuplicate([sent("Hi", 5000, null)], "Hi", "all", NOW)).not.toBeNull();
  });
});

describe("Apple back field and the alert", () => {
  it("shows the message without changeMessage when alert is false", () => {
    const f = appleOfferField("Orbyn", "Double points on Friday", false);
    expect(f).toEqual({ key: "offer", label: "From Orbyn", value: "Double points on Friday" });
    expect("changeMessage" in f).toBe(false);
  });
  it("keeps the old behaviour by default (alert on)", () => {
    expect(appleOfferField("Orbyn", "Hi")).toEqual({ key: "offer", label: "From Orbyn", value: "Hi", changeMessage: "%@" });
  });
  it("without a message the alert flag changes nothing", () => {
    expect(appleOfferField("Orbyn", null, true)).toEqual({ key: "offer", label: "From Orbyn", value: NO_OFFER_TEXT });
    expect(appleOfferField("Orbyn", null, false)).toEqual({ key: "offer", label: "From Orbyn", value: NO_OFFER_TEXT });
  });
});

describe("which offer an Apple card shows, and whether it may alert", () => {
  it("the newest offer shows and alerts", () => {
    const r = appleOfferSelection([offer("A", 5 * DAY), offer("B", 1 * DAY)], NOW);
    expect(r).toEqual({ message: "B", alert: true });
  });
  it("withdrawing the newest brings the previous one back WITHOUT an alert (no second announcement)", () => {
    const r = appleOfferSelection([offer("A: older", 5 * DAY), offer("B: wrong text", 1 * DAY, { withdrawnAgo: 1000 })], NOW);
    expect(r).toEqual({ message: "A: older", alert: false });
  });
  it("withdrawing the only offer leaves 'No offer right now.' (no message, no alert)", () => {
    expect(appleOfferSelection([offer("A", 1 * DAY, { withdrawnAgo: 1000 })], NOW)).toEqual({ message: null, alert: false });
    expect(appleOfferSelection([], NOW)).toEqual({ message: null, alert: false });
  });
  it("edit and resend: the corrected offer is the newest, so it alerts even though the original is withdrawn after it", () => {
    // A sent, B (the corrected text) sent, then A withdrawn: the card must still announce B.
    const r = appleOfferSelection([offer("A: original", 3 * DAY, { withdrawnAgo: 500 }), offer("B: corrected", 1000)], NOW);
    expect(r).toEqual({ message: "B: corrected", alert: true });
  });
  it("a new offer after a withdrawal alerts again", () => {
    const r = appleOfferSelection([offer("A", 5 * DAY), offer("B: withdrawn", 3 * DAY, { withdrawnAgo: 2 * DAY }), offer("C: new", 1 * DAY)], NOW);
    expect(r).toEqual({ message: "C: new", alert: true });
  });
  it("a withdrawn offer for Google only does not change what Apple shows", () => {
    const r = appleOfferSelection([offer("A", 5 * DAY), offer("G: google only, withdrawn", 1 * DAY, { audience: "google", withdrawnAgo: 1000 })], NOW);
    expect(r).toEqual({ message: "A", alert: true });
  });
  it("an offer past the 14 days is not shown, whatever was withdrawn", () => {
    expect(appleOfferSelection([offer("A: too old", 20 * DAY), offer("B", 1 * DAY, { withdrawnAgo: 1000 })], NOW)).toEqual({ message: null, alert: false });
  });
});

describe("offerChangeStamp (when Apple should fetch the card again)", () => {
  it("is the send time while the newest live offer is live", () => {
    expect(offerChangeStamp({ latestLiveSentAt: ago(3 * DAY) }, NOW)).toBe(NOW - 3 * DAY);
  });
  it("is the moment it ran out once the 14 days passed", () => {
    expect(offerChangeStamp({ latestLiveSentAt: NOW - 20 * DAY }, NOW)).toBe(NOW - 20 * DAY + OFFER_WINDOW_MS);
  });
  it("a withdrawal moves the stamp forward, so cards that still show the withdrawn text are fetched again", () => {
    const previousCheck = NOW - 60_000; // the card was last fetched a minute ago
    const afterSend = offerChangeStamp({ latestLiveSentAt: NOW - 120_000 }, NOW - 90_000);
    expect(afterSend).toBeLessThan(previousCheck);
    // The newest offer (sent 2 minutes ago) is withdrawn 30 seconds ago; the older live offer is from 5 days ago.
    const afterWithdraw = offerChangeStamp({ latestLiveSentAt: NOW - 5 * DAY, latestWithdrawnAt: NOW - 30_000 }, NOW);
    expect(afterWithdraw).toBe(NOW - 30_000);
    expect(afterWithdraw).toBeGreaterThan(previousCheck);
  });
  it("never goes back: withdrawing the newest offer does not make the stamp fall to the older offer's time", () => {
    const before = offerChangeStamp({ latestLiveSentAt: NOW - 1000 }, NOW);
    const after = offerChangeStamp({ latestLiveSentAt: NOW - 5 * DAY, latestWithdrawnAt: NOW }, NOW);
    expect(after).toBeGreaterThanOrEqual(before);
  });
  it("after everything left runs out, the stamp is the later of the withdrawal and the expiry", () => {
    const sent = NOW - 20 * DAY; // ran out 6 days ago
    expect(offerChangeStamp({ latestLiveSentAt: sent, latestWithdrawnAt: NOW - 10 * DAY }, NOW)).toBe(sent + OFFER_WINDOW_MS); // expiry is later
    expect(offerChangeStamp({ latestLiveSentAt: sent, latestWithdrawnAt: NOW - 2 * DAY }, NOW)).toBe(NOW - 2 * DAY); // withdrawal is later
  });
  it("is 0 with no offers, no withdrawals or broken dates", () => {
    expect(offerChangeStamp({}, NOW)).toBe(0);
    expect(offerChangeStamp({ latestLiveSentAt: null, latestWithdrawnAt: undefined }, NOW)).toBe(0);
    expect(offerChangeStamp({ latestLiveSentAt: "nope", latestWithdrawnAt: "nope" }, NOW)).toBe(0);
  });
});

describe("the 14-day check used before waking devices", () => {
  it("is true inside the window and on the edge, false after", () => {
    expect(inWindow(ago(1000), NOW)).toBe(true);
    expect(inWindow(ago(OFFER_WINDOW_MS), NOW)).toBe(true);
    expect(inWindow(ago(OFFER_WINDOW_MS + 1), NOW)).toBe(false);
  });
  it("an unreadable date counts as outside", () => {
    expect(inWindow("nope", NOW)).toBe(false);
  });
});

describe("GET /api/owner/offers item shape", () => {
  const row = { id: "1", message: "Hi", audience: "apple", sent_at: "2026-10-15T18:02:11.123+00:00", recipients: 212 };
  it("a live offer has withdrawnAt null and keeps every other field of the old shape", () => {
    const item = offerListItem({ ...row, withdrawn_at: null });
    expect(item).toEqual({ ...offerView(row), withdrawnAt: null });
    expect(item).toEqual({ id: "1", message: "Hi", audience: "apple", sentAt: "2026-10-15T18:02:11.123Z", recipients: 212, withdrawnAt: null });
  });
  it("a row from before the migration (no column) is also null", () => {
    expect(offerListItem(row).withdrawnAt).toBeNull();
  });
  it("a withdrawn offer carries the withdrawal time as an ISO string", () => {
    expect(offerListItem({ ...row, withdrawn_at: "2026-10-16T09:30:00.5+00:00" }).withdrawnAt).toBe("2026-10-16T09:30:00.500Z");
  });
  it("an unreadable withdrawal date still reads as withdrawn", () => {
    expect(offerListItem({ ...row, withdrawn_at: "weird" }).withdrawnAt).toBe("weird");
  });
});

describe("who may withdraw", () => {
  it("is owner only: managers, staff and developers are refused", () => {
    expect(ACCESS.offersWithdraw).toBe(true);
    expect(roleAllowed("owner", ACCESS.offersWithdraw)).toBe(true);
    for (const role of ["manager", "staff", "developer"] as const) expect(roleAllowed(role, ACCESS.offersWithdraw)).toBe(false);
  });
  it("a manager can still look at the list", () => {
    expect(roleAllowed("manager", ACCESS.offersView)).toBe(true);
  });
});
