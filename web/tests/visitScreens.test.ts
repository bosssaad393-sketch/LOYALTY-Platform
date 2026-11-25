import { describe, expect, it } from "vitest";
import { readLocation } from "../src/app/owner/Branches";
import { previewMessage } from "../src/app/owner/AutoMessages";
import { activityGroup } from "../src/app/owner/Activity";
import { newVouchers, visitAgo } from "../src/app/staff/VisitGuest";
import { ACTIVITY_TEXT } from "../src/lib/activity";
import { makeT } from "../src/lib/uiLang";
import type { CardVoucher } from "../src/lib/vouchers";

describe("owner: a branch location pasted from Google Maps", () => {
  it("reads the two numbers Maps shows, with or without brackets", () => {
    expect(readLocation("26.1789, 50.4931")).toEqual({ lat: 26.1789, lng: 50.4931 });
    expect(readLocation("(26.1789,50.4931)")).toEqual({ lat: 26.1789, lng: 50.4931 });
    expect(readLocation("26.1789 50.4931")).toEqual({ lat: 26.1789, lng: 50.4931 });
  });
  it("empty means no location; anything else is refused", () => {
    expect(readLocation("  ")).toEqual({ lat: null, lng: null });
    expect(readLocation("Sanad, Bahrain")).toBe("bad");
    expect(readLocation("95, 50")).toBe("bad");
    expect(readLocation("26.1")).toBe("bad");
  });
});

describe("owner: automatic message preview", () => {
  it("fills the first name and keeps the 200-character limit", () => {
    expect(previewMessage("Happy birthday, {name}.", "Sara")).toBe("Happy birthday, Sara.");
    expect(previewMessage("x".repeat(250), "Sara")).toHaveLength(200);
  });
});

describe("owner: activity filter chips", () => {
  it("puts every line the server can send under one chip", () => {
    expect(activityGroup(ACTIVITY_TEXT.visit)).toBe("visits");
    expect(activityGroup(ACTIVITY_TEXT.voucher_redeem)).toBe("gifts");
    expect(activityGroup(ACTIVITY_TEXT.voucher_void)).toBe("gifts");
    expect(activityGroup(ACTIVITY_TEXT.staff_branch_changed)).toBe("settings");
    expect(activityGroup("Something new")).toBe("settings");
  });
});

const v = (id: string): CardVoucher => ({ id, voucherId: "x", title: "50% off", titleAr: null, detail: null, detailAr: null, status: "issued", issuedAt: "2026-11-25T08:00:00Z", expiresAt: null, redeemedAt: null, redeemBranchId: null, redeemBranchName: null });

describe("staff: after Record visit", () => {
  it("names only the gifts the visit just unlocked", () => {
    expect(newVouchers([v("a")], [v("a"), v("b")]).map((x) => x.id)).toEqual(["b"]);
    expect(newVouchers(undefined, [v("a")]).map((x) => x.id)).toEqual(["a"]);
    expect(newVouchers([v("a")], [v("a")])).toEqual([]);
  });
  it("says the last visit in Bahrain days", () => {
    const t = makeT("en");
    const now = Date.parse("2026-11-25T10:00:00Z");
    expect(visitAgo(null, t, now)).toBe("never");
    expect(visitAgo("2026-11-25T05:00:00Z", t, now)).toBe("today");
    // 22:30 UTC on the 24th is 01:30 on the 25th in Bahrain: still today
    expect(visitAgo("2026-11-24T22:30:00Z", t, now)).toBe("today");
    expect(visitAgo("2026-11-24T08:00:00Z", t, now)).toBe("yesterday");
    expect(visitAgo("2026-11-20T08:00:00Z", t, now)).toBe("5 days ago");
  });
});
