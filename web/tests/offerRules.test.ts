import { describe, expect, it } from "vitest";
import { MESSAGE_LIMIT, WITHDRAW_DAYS, canWithdraw, checkResend, oneLine, withdrawEffect } from "../src/app/owner/offerRules";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const DAY = 86_400_000;
const sent = (daysAgo: number, withdrawnAt: string | null = null) => ({ sentAt: new Date(NOW - daysAgo * DAY).toISOString(), withdrawnAt });

describe("limits", () => {
  it("match the contract: 200 characters and 14 days", () => {
    expect(MESSAGE_LIMIT).toBe(200);
    expect(WITHDRAW_DAYS).toBe(14);
  });
});

describe("oneLine", () => {
  it("trims and turns line breaks, tabs and runs of spaces into single spaces", () => {
    expect(oneLine("  Free\n\ncoffee\tthis   week \r\n")).toBe("Free coffee this week");
  });
  it("turns other control characters into spaces too", () => {
    expect(oneLine("a\u0000b\u007fc")).toBe("a b c");
  });
  it("leaves ordinary text, Arabic and emoji alone", () => {
    expect(oneLine("أهلاً بكم ☕")).toBe("أهلاً بكم ☕");
  });
});

describe("withdrawEffect (what withdrawing really does)", () => {
  it("says the message disappears from the cards only for Apple-only offers", () => {
    const e = withdrawEffect("apple");
    expect(e.before).toBe("It will disappear from guests’ cards.");
    expect(e.after).not.toMatch(/Android/);
  });
  it("is honest about Android for offers that reached Google Wallet (all or google)", () => {
    for (const audience of ["all", "google"] as const) {
      const e = withdrawEffect(audience);
      expect(e.before).toBe("It will disappear from iPhone cards. On Android cards it stays until the 14 days end.");
      expect(e.after).toMatch(/Android cards it stays/);
      expect(e.original).toMatch(/Android cards it stays/);
    }
  });
});

describe("canWithdraw", () => {
  it("is true for a recent message that is not withdrawn", () => {
    expect(canWithdraw(sent(0), NOW)).toBe(true);
    expect(canWithdraw(sent(13.9), NOW)).toBe(true);
  });
  it("is false from 14 days on", () => {
    expect(canWithdraw(sent(14), NOW)).toBe(false);
    expect(canWithdraw(sent(19), NOW)).toBe(false);
  });
  it("is false once the message is withdrawn, however recent", () => {
    expect(canWithdraw(sent(1, "2026-10-15T09:00:00Z"), NOW)).toBe(false);
  });
  it("is false for a date that cannot be read", () => {
    expect(canWithdraw({ sentAt: "not a date", withdrawnAt: null }, NOW)).toBe(false);
  });
});

describe("checkResend (edit and resend)", () => {
  const original = "Double points this Friday, from 7 pm.";

  it("is not ok while the text is unchanged", () => {
    const c = checkResend(original, original);
    expect(c.same).toBe(true);
    expect(c.ok).toBe(false);
  });
  it("ignores spaces and line breaks around and inside the text when comparing", () => {
    expect(checkResend(original, `  ${original}  \n`).same).toBe(true);
    expect(checkResend(original, "Double points  this Friday,\nfrom 7 pm.").same).toBe(true);
  });
  it("counts a change of case as a change (guests are alerted)", () => {
    const c = checkResend(original, original.toUpperCase());
    expect(c.same).toBe(false);
    expect(c.ok).toBe(true);
  });
  it("is ok for a changed text within 1 to 200 characters", () => {
    const c = checkResend(original, "Double points this Saturday, from 7 pm.");
    expect(c).toMatchObject({ same: false, over: 0, ok: true });
    expect(c.text).toBe("Double points this Saturday, from 7 pm.");
  });
  it("is not ok when empty or only spaces", () => {
    for (const draft of ["", "   ", "\n\t "]) {
      const c = checkResend(original, draft);
      expect(c.length).toBe(0);
      expect(c.ok).toBe(false);
    }
  });
  it("allows exactly 200 characters and not 201", () => {
    expect(checkResend(original, "a".repeat(200))).toMatchObject({ length: 200, over: 0, ok: true });
    expect(checkResend(original, "a".repeat(201))).toMatchObject({ length: 201, over: 1, ok: false });
  });
  it("measures the one-line text the server would store, not the raw box", () => {
    // 250 raw characters, but the 100 line breaks collapse to one space: 100 + 1 + 50 = 151.
    const draft = `${"a".repeat(100)}${"\n".repeat(100)}${"b".repeat(50)}`;
    expect(checkResend(original, draft)).toMatchObject({ length: 151, ok: true });
  });
});
