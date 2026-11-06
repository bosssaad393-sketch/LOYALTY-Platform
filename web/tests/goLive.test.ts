import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Runs supabase/go-live-orbyn.sql on a database shaped like the live project: migrations up to 0009, one venue called n10, showcase people.
const dir = join(__dirname, "../../supabase/migrations");

describe("go-live-orbyn.sql", () => {
  it("adds table service, renames the venue and keeps its data, and can run twice", async () => {
    const db = new PGlite();
    await db.exec("create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);");
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key, email text);");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql") && x < "0010").sort()) await db.exec(readFileSync(join(dir, f), "utf8").replace(/create extension if not exists pgcrypto;/i, ""));
    await db.exec(`
      update venues set slug = 'n10', name = 'Nº10 by Hydur', reward_text = 'A dessert of your choice' where slug = 'demo';
      insert into members (id, name, phone, consent_terms) values ('00000000-0000-4000-8000-0000000000d1', 'Ann Demo', '+97300000001', now());
      insert into cards (venue_id, member_id, code, points) select id, '00000000-0000-4000-8000-0000000000d1', '1234', 380 from venues where slug = 'n10';
      insert into staff_users (venue_id, name, role) select id, 'Demo owner', 'owner' from venues where slug = 'n10';
    `);
    const script = readFileSync(join(dir, "../go-live-orbyn.sql"), "utf8");
    await db.exec(script);
    await db.exec(script);

    const venues = (await db.query<{ slug: string; name: string; reward_text: string }>("select slug, name, reward_text from venues")).rows;
    expect(venues).toEqual([{ slug: "orbyn", name: "Orbyn", reward_text: "A dessert of your choice" }]);
    expect((await db.query<{ code: string }>("select c.code from cards c join venues v on v.id = c.venue_id where v.slug = 'orbyn'")).rows).toEqual([{ code: "1234" }]);
    expect((await db.query<{ name: string }>("select name from members")).rows).toEqual([{ name: "Ann Hassan" }]);
    expect((await db.query<{ name: string }>("select name from staff_users where role = 'owner'")).rows).toEqual([{ name: "Owner" }]);
    expect((await db.query("select 1 from information_schema.tables where table_name = 'table_requests'")).rows.length).toBe(1);
  }, 30_000); // builds a whole database, which can pass the default 5 s when the machine is busy
});
