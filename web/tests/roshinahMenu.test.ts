import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import menu from "@/data/menus/roshinah.json";
import { menuThumb } from "@/lib/menuPhoto";

describe("Al Roshinah's own menu (copied from the venue's public menu)", () => {
  type Item = { en: string; ar: string | null; noteEn: string | null; noteAr: string | null; fils: number; photo: string | null };
  const cats = menu.categories as { en: string; ar: string | null; items: Item[] }[];
  const items = cats.flatMap((c) => c.items);

  it("fits what the database accepts", () => {
    expect(cats.length).toBeGreaterThan(5);
    for (const c of cats) {
      expect(c.en.trim().length).toBeGreaterThan(0);
      expect(c.en.length).toBeLessThanOrEqual(60);
      expect((c.ar ?? "").length).toBeLessThanOrEqual(60);
      expect(c.items.length).toBeGreaterThan(0);
    }
    for (const i of items) {
      expect(i.en.trim().length).toBeGreaterThan(0);
      expect(i.en.length).toBeLessThanOrEqual(80);
      expect((i.ar ?? "").length).toBeLessThanOrEqual(80);
      expect((i.noteEn ?? "").length).toBeLessThanOrEqual(400);
      expect((i.noteAr ?? "").length).toBeLessThanOrEqual(400);
      expect(Number.isInteger(i.fils)).toBe(true);
      expect(i.fils).toBeGreaterThan(0);
    }
  });

  it("has every picture it names, large and small", () => {
    const dir = path.join(process.cwd(), "public", "venues", "roshinah", "menu");
    for (const i of items.filter((x) => x.photo)) {
      expect(existsSync(path.join(dir, `${i.photo}.webp`)), `${i.en}: ${i.photo}.webp`).toBe(true);
      expect(existsSync(path.join(dir, `${i.photo}-s.webp`)), `${i.en}: ${i.photo}-s.webp`).toBe(true);
    }
  });

  it("uses the small twin only for pictures kept in the project", () => {
    expect(menuThumb("/venues/roshinah/menu/007.webp")).toBe("/venues/roshinah/menu/007-s.webp");
    expect(menuThumb("https://x.supabase.co/storage/v1/object/public/menu/a.webp")).toBe("https://x.supabase.co/storage/v1/object/public/menu/a.webp");
    expect(menuThumb(null)).toBeNull();
  });
});
