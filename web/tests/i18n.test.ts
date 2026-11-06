import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandLanguages } from "@/lib/brand";
import { directionOf, LANGUAGES, pickLocale } from "@/i18n/locale";

const MESSAGES = join(__dirname, "..", "messages");
const load = (code: string): object => JSON.parse(readFileSync(join(MESSAGES, `${code}.json`), "utf8"));

function flatten(value: object, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([k, v]): [string, string][] =>
    typeof v === "object" && v ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]],
  );
}

describe("brandLanguages", () => {
  it("offers English first, then Arabic, when nothing is set", () => {
    expect(brandLanguages({})).toEqual(["en", "ar"]);
    expect(brandLanguages({ BRAND_LANGUAGES: "" })).toEqual(["en", "ar"]);
  });
  it("follows the client's setting and order", () => {
    expect(brandLanguages({ BRAND_LANGUAGES: "en" })).toEqual(["en"]);
    expect(brandLanguages({ BRAND_LANGUAGES: " AR , en " })).toEqual(["ar", "en"]);
  });
  it("ignores repeats and languages with no text", () => {
    expect(brandLanguages({ BRAND_LANGUAGES: "en,xx,en,constructor" })).toEqual(["en"]);
    expect(brandLanguages({ BRAND_LANGUAGES: "xx" })).toEqual(["en", "ar"]);
  });
});

describe("pickLocale", () => {
  it("opens in the client's first language, whatever the phone uses", () => {
    expect(pickLocale(undefined, ["en", "ar"])).toBe("en");
    expect(pickLocale(undefined, ["ar", "en"])).toBe("ar");
  });
  it("keeps the guest's own choice", () => {
    expect(pickLocale("ar", ["en", "ar"])).toBe("ar");
    expect(pickLocale("en", ["ar", "en"])).toBe("en");
  });
  it("ignores a saved language the client does not offer", () => {
    expect(pickLocale("ar", ["en"])).toBe("en");
    expect(pickLocale("xx", ["en", "ar"])).toBe("en");
  });
});

describe("messages", () => {
  const files = readdirSync(MESSAGES).map((f) => f.replace(/\.json$/, ""));

  it("has one file for every language, and no strays", () => {
    expect(files.sort()).toEqual(Object.keys(LANGUAGES).sort());
  });
  it("has the same keys in every language", () => {
    const keys = flatten(load("en")).map(([k]) => k).sort();
    for (const code of files) expect(flatten(load(code)).map(([k]) => k).sort(), code).toEqual(keys);
  });
  it("keeps every placeholder and tag in every language", () => {
    for (const code of files) {
      const text = new Map(flatten(load(code)));
      for (const [key, english] of flatten(load("en"))) {
        for (const token of english.match(/\{\w+\}|<\/?\w+>/g) ?? []) expect(text.get(key), `${code} ${key}`).toContain(token);
      }
    }
  });
});

describe("directionOf", () => {
  it("is right to left only for Arabic", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
    expect(directionOf("xx")).toBe("ltr");
  });
});
