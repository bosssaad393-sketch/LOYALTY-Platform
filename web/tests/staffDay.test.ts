import { describe, expect, it } from "vitest";
import { bahrainDayStartIso, myDay } from "../src/lib/staffDay";

describe("a staff member's own day", () => {
  it("starts at midnight in Bahrain, which is 21:00 UTC the day before", () => {
    expect(bahrainDayStartIso(Date.parse("2026-11-12T10:00:00Z"))).toBe("2026-11-11T21:00:00.000Z");
    expect(bahrainDayStartIso(Date.parse("2026-11-12T21:30:00Z"))).toBe("2026-11-12T21:00:00.000Z");
  });

  it("counts standing entries, distinct guests and the bills; undone entries are left out", () => {
    const d = myDay([
      { id: 1, kind: "earn", card_id: "a", bill_bhd: "4.500", undoes: null },
      { id: 2, kind: "earn", card_id: "a", bill_bhd: 2, undoes: null },
      { id: 3, kind: "earn", card_id: "b", bill_bhd: 9, undoes: null },
      { id: 4, kind: "undo", card_id: "b", bill_bhd: null, undoes: 3 },
      { id: 5, kind: "redeem", card_id: "c", bill_bhd: null, undoes: null },
    ]);
    expect(d).toEqual({ entries: 3, guests: 2, bhd: 6.5 });
    expect(myDay([])).toEqual({ entries: 0, guests: 0, bhd: 0 });
  });
});
