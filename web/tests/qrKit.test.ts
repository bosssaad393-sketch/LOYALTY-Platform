import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { kitBase, kitCards, kitLook, qrShape, sheets, shortHost } from "../src/lib/table/qrKit";

// The printable QR kit: which address goes into the codes, which cards are printed, and that a printed code reads back
// as exactly the table's link. Invented tables only.

const tables = [
  { id: "t10", label: "10", token: "tok-ten-aaaaaaaaaaaa" },
  { id: "t2", label: "2", token: "tok-two-aaaaaaaaaaaa" },
  { id: "tt", label: "Terrace 1", token: "tok-ter-aaaaaaaaaaaa" },
];

describe("the address in the codes", () => {
  it("uses the public address when it is set, without a trailing slash", () => {
    expect(kitBase("https://orbyn.example.test/", "other.example.test", "https")).toBe("https://orbyn.example.test");
  });
  it("falls back to the address the page was opened on, https only", () => {
    expect(kitBase(undefined, "orbyn.example.test", "https")).toBe("https://orbyn.example.test");
    expect(kitBase(undefined, "orbyn.example.test", "http")).toBeNull();
    expect(kitBase("http://not-https.example.test", "orbyn.example.test", "https")).toBe("https://orbyn.example.test");
  });
  it("allows this computer for design work, and refuses a forged host", () => {
    expect(kitBase(undefined, "localhost:3030", "http")).toBe("http://localhost:3030");
    expect(kitBase(undefined, "evil.example/path", "https")).toBeNull();
    expect(kitBase(undefined, null, "https")).toBeNull();
  });
});

describe("the cards", () => {
  it("prints every table in name order, then the counter card for the rewards sign-up", () => {
    const cards = kitCards("https://o.test", "orbyn", tables);
    expect(cards.map((c) => (c.kind === "table" ? c.label : "join"))).toEqual(["2", "10", "Terrace 1", "join"]);
    expect(cards[0].url).toBe("https://o.test/t/tok-two-aaaaaaaaaaaa");
    expect(cards.at(-1)!.url).toBe("https://o.test/counter/orbyn");
  });
  it("prints one table on its own, without the counter card", () => {
    const cards = kitCards("https://o.test", "orbyn", tables, "t10");
    expect(cards).toEqual([{ kind: "table", id: "t10", label: "10", url: "https://o.test/t/tok-ten-aaaaaaaaaaaa" }]);
    expect(kitCards("https://o.test", "orbyn", tables, "gone")).toEqual([]);
  });
  it("puts four cards on a sheet", () => {
    expect(sheets([1, 2, 3, 4, 5, 6, 7, 8, 9]).map((s) => s.length)).toEqual([4, 4, 1]);
    expect(sheets([])).toEqual([]);
  });
  it("has two looks and falls back to the venue's colours", () => {
    expect(kitLook("light")).toBe("light");
    expect(kitLook("anything")).toBe("dark");
    expect(kitLook(undefined)).toBe("dark");
  });
  it("shows the address people would recognise under the code", () => {
    expect(shortHost("https://loyalty-platform-steel.vercel.app")).toBe("loyalty-platform-steel.vercel.app");
  });
});

describe("the printed code", () => {
  it("reads back as exactly the table's link", () => {
    const url = "https://orbyn.example.test/t/tok-two-aaaaaaaaaaaa";
    const { size, d } = qrShape(url);
    // Draw the path onto a pixel grid with a 4-module quiet zone, as the page does, and read it like a phone camera would.
    const scale = 6, quiet = 4, side = (size + quiet * 2) * scale;
    const px = new Uint8ClampedArray(side * side * 4).fill(255);
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      const [x0, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let x = x0; x < x0 + w; x++)
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
    }
    expect(jsQR(px, side, side)?.data).toBe(url);
    expect(size).toBe(QRCode.create(url, { errorCorrectionLevel: "Q" }).modules.size);
  });
});
