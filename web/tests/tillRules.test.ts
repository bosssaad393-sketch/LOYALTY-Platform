import { describe, expect, it } from "vitest";
import { LARGE_BILL_BHD, MAX_BILL_BHD, pointsFor, readBill } from "../src/lib/tillRules";
import { fieldsFor } from "../src/app/join/[venue]/JoinForm";

// The till's bill box and the join form's error marking: small rules with real consequences (a typo worth hundreds of points,
// a guest who cannot see which field is wrong).

describe("till bill box", () => {
  it("reads BHD the way staff type it", () => {
    expect(readBill("12.5")).toEqual({ value: 12.5, state: "ok" });
    expect(readBill("12,500")).toEqual({ value: 12.5, state: "ok" });
    expect(readBill(" 8 ")).toEqual({ value: 8, state: "ok" });
  });
  it("refuses nonsense and empty", () => {
    expect(readBill("").state).toBe("empty");
    for (const t of ["abc", "1.2345", "-5", "0", "1e3", "12..5"]) expect(readBill(t).state, t).toBe("bad");
  });
  it("asks once more above the large-bill line, and stops at the database's limit", () => {
    expect(readBill(String(LARGE_BILL_BHD)).state).toBe("ok");
    expect(readBill("1250").state).toBe("large");
    expect(readBill(String(MAX_BILL_BHD + 1)).state).toBe("too_large");
  });
  it("previews points by the database's rule (floor of BHD x rate)", () => {
    expect(pointsFor(12.5, 3)).toBe(37);
    expect(pointsFor(0.2, 3)).toBe(0);
    expect(pointsFor(10, 0)).toBe(0);
  });
});

describe("join form error marking", () => {
  const form = { name: "Sara", mobile: "", email: "", terms: true };
  it("marks the field the server's answer is about", () => {
    expect(fieldsFor("bad_email", form)).toEqual(["email"]);
    expect(fieldsFor("bad_mobile", form)).toEqual(["mobile"]);
    expect(fieldsFor("contact_required", form)).toEqual(["mobile", "email"]);
  });
  it("for an incomplete form, marks only what is missing", () => {
    expect(fieldsFor("incomplete", { ...form, name: " ", terms: false })).toEqual(["name", "terms"]);
    expect(fieldsFor("incomplete", { ...form, terms: false })).toEqual(["terms"]);
  });
  it("marks nothing for answers that are not about a field", () => {
    expect(fieldsFor("too_many", form)).toEqual([]);
    expect(fieldsFor(undefined, form)).toEqual([]);
  });
});
