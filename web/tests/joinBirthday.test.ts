import { describe, expect, it } from "vitest";
import { birthdayValue, daysIn } from "../src/lib/joinBirthday";
import { parseBirthday } from "../src/lib/joinFields";
import { fieldsFor } from "../src/app/join/[venue]/JoinForm";

describe("join page date of birth", () => {
  it("is optional: nothing chosen sends nothing", () => {
    expect(birthdayValue("", "")).toBe("");
  });
  it("sends DD/MM, which the join API reads", () => {
    expect(birthdayValue("7", "3")).toBe("07/03");
    expect(parseBirthday(birthdayValue("29", "2"))).toEqual({ day: 29, month: 2, year: null });
  });
  it("asks for the other half when only the day or the month is chosen", () => {
    expect(birthdayValue("7", "")).toBe("half");
    expect(birthdayValue("", "12")).toBe("half");
  });
  it("never sends a day the month does not have", () => {
    expect(birthdayValue("31", "4")).toBe("half");
    expect(daysIn(2)).toBe(29);
    expect(daysIn(null)).toBe(31);
  });
  it("marks the right field for the new server answers", () => {
    const form = { name: "Sara", mobile: "+973 3300 0000", email: "", terms: true };
    expect(fieldsFor("email_required", form)).toEqual(["email"]);
    expect(fieldsFor("bad_birthday", form)).toEqual(["birthday"]);
  });
});
