#!/usr/bin/env node
/**
 * Make everything a new client needs, from a name and colours:
 *   node scripts/new-client.mjs --name "Acme Cafe" --slug acme --accent "#3fa7a0" [--bg "#101418"] [--text "#eef2f3"] [--logo path/to/logo.png] [--main]
 *
 * Creates (nothing outside web/ and ../supabase is touched, nothing is overwritten without --force):
 *   public/venues/<slug>/   icon.png, crest.png, marble.jpg, texture.jpg   (guest pages, sign-in, owner app)
 *   passes/<slug>/          Apple Wallet images: icon, logo, primaryLogo, strip, card/strip, artwork (1x, 2x, 3x)
 *   ../supabase/seeds/<slug>.sql   the venue row (run it once in the Supabase SQL editor)
 *   with --main also: public/staff-icon-192.png, staff-icon-512.png, apple-touch-icon.png (the home-screen icons)
 * and prints the BRAND_* settings for .env.local / Vercel.
 *
 * Without --logo a monogram (the first letters of the name) is drawn in the accent colour.
 * The pictures are plain, tasteful placeholders: swap in the client's real logo/photos before launch.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- arguments --------------------------------------------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) args[key] = true;
  else { args[key] = next; i++; }
}
const fail = (m) => { console.error("\n" + m + "\n"); process.exit(1); };
const HEX = /^#[0-9a-f]{6}$/i;

const name = typeof args.name === "string" ? args.name.trim() : "";
const slug = typeof args.slug === "string" ? args.slug.trim().toLowerCase() : "";
const accent = (typeof args.accent === "string" ? args.accent : "#cda55b").toLowerCase();
const bg = (typeof args.bg === "string" ? args.bg : "#141210").toLowerCase();
const text = (typeof args.text === "string" ? args.text : "#f3e9d2").toLowerCase();
if (!name) fail('Missing --name "Client name"');
if (!/^[a-z0-9-]+$/.test(slug)) fail('Missing or bad --slug (letters, digits and dashes only, e.g. "acme-cafe")');
for (const [k, v] of Object.entries({ accent, bg, text })) if (!HEX.test(v)) fail(`--${k} must look like #rrggbb`);
const force = Boolean(args.force);
const pointsPerBhd = Number(args.points ?? 2);
const rewardGoal = Number(args.goal ?? 500);
const rewardText = typeof args.reward === "string" ? args.reward : `Reward chosen by ${name}`;

// ---- helpers ----------------------------------------------------------------------------------------------------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => "#" + c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join("").toUpperCase() || "?";
const FONT = "Georgia, 'Times New Roman', serif";

/** Dark "velvet": a smooth gradient in the client's background colour, a soft accent glow and a fine grain. Calm on purpose. */
function marbleSvg(w, h, seed = 7) {
  const lo = mix(bg, "#000000", 0.4);
  const hi = mix(bg, text, 0.1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
      <radialGradient id="r" cx="${seed % 2 ? 0.82 : 0.18}" cy="0.1" r="0.8"><stop offset="0" stop-color="${accent}" stop-opacity="0.22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
      <filter id="n" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${seed}"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#r)"/>
    <rect width="100%" height="100%" filter="url(#n)" opacity="0.07" style="mix-blend-mode:overlay"/>
  </svg>`;
}

/** The mark: the client's logo if given, otherwise a monogram. Returns a square PNG buffer on transparent. */
async function markPng(size) {
  if (typeof args.logo === "string") {
    if (!existsSync(args.logo)) fail(`Logo file not found: ${args.logo}`);
    return sharp(readFileSync(args.logo)).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  const fs = Math.round(size * (initials.length > 1 ? 0.5 : 0.62));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - size * 0.04}" fill="none" stroke="${accent}" stroke-width="${Math.max(1, size * 0.03)}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="600" fill="${accent}" letter-spacing="${size * 0.02}">${esc(initials)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A marble panel with the client's name centred, for the Apple strip / card / poster artwork. */
async function namePanel(w, h, seed) {
  const fs = Math.round(Math.min(h * 0.3, (w * 0.82) / Math.max(4, name.length)));
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="600" letter-spacing="${fs * 0.18}" fill="${accent}">${esc(name.toUpperCase())}</text>
  </svg>`;
  return sharp(Buffer.from(marbleSvg(w, h, seed))).composite([{ input: Buffer.from(label) }]).png().toBuffer();
}

/**
 * The Apple store-card strip: the card artwork only, rounded, with transparent margins, so the pass background shows around it
 * (this is the layout the web card has; tests/passStripFiles.test.ts checks the transparency). Sizes are in points times `s`.
 */
async function stripCard(wPt, hPt, s, seed) {
  const mx = 18 * s, my = 6 * s, r = 14 * s;
  const w = wPt * s, h = hPt * s;
  const iw = w - 2 * mx, ih = h - 2 * my;
  const panel = await namePanel(iw, ih, seed);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}"><rect width="${iw}" height="${ih}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const rounded = await sharp(panel).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rounded, left: mx, top: my }]).png().toBuffer();
}

const wrote = [];
async function save(file, buf) {
  if (existsSync(file) && !force) { console.log("  kept (exists):", path.relative(root, file)); return; }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  wrote.push(path.relative(root, file));
}

// ---- 1. guest pages, sign-in, owner app: public/venues/<slug> -----------------------------------------------------
const venueDir = path.join(root, "public", "venues", slug);
await save(path.join(venueDir, "icon.png"), await markPng(140));
await save(path.join(venueDir, "crest.png"), await markPng(256));
await save(path.join(venueDir, "marble.jpg"), await sharp(Buffer.from(marbleSvg(1500, 940, 11))).jpeg({ quality: 82 }).toBuffer());
await save(path.join(venueDir, "texture.jpg"), await sharp(Buffer.from(marbleSvg(900, 900, 23))).jpeg({ quality: 78 }).toBuffer());

// ---- 2. Apple Wallet images: passes/<slug> -------------------------------------------------------------------------
const passDir = path.join(root, "passes", slug);
for (const s of [1, 2, 3]) {
  const sfx = s === 1 ? "" : `@${s}x`;
  await save(path.join(passDir, `icon${sfx}.png`), await markPng(29 * s));
  await save(path.join(passDir, `logo${sfx}.png`), await markPng(42 * s));
  await save(path.join(passDir, `primaryLogo${sfx}.png`), await markPng(30 * s));
  await save(path.join(passDir, `strip${sfx}.png`), await stripCard(375, 144, s, 31));
  await save(path.join(passDir, "card", `strip${sfx}.png`), await stripCard(375, 123, s, 37));
  await save(path.join(passDir, `artwork${sfx}.png`), await namePanel(358 * s, 448 * s, 41));
}

// ---- 3. home-screen icons (only for the deployment's main client) ---------------------------------------------------
if (args.main) {
  const icon = async (size) => sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await markPng(Math.round(size * 0.66)), gravity: "center" }]).png().toBuffer();
  await save(path.join(root, "public", "staff-icon-192.png"), await icon(192));
  await save(path.join(root, "public", "staff-icon-512.png"), await icon(512));
  await save(path.join(root, "public", "apple-touch-icon.png"), await icon(180));
}

// ---- 4. the venue row ---------------------------------------------------------------------------------------------------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- Venue row for ${name}. Run once in the Supabase SQL editor of THIS client's project.
insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text)
values (${q(slug)}, ${q(name)},
        ${q(JSON.stringify({ background: bg, label: accent, text }))}::jsonb,
        ${pointsPerBhd}, ${rewardGoal}, ${q(rewardText)})
on conflict (slug) do update set name = excluded.name, brand = excluded.brand;
`;
await save(path.join(root, "..", "supabase", "seeds", `${slug}.sql`), Buffer.from(sql));

// ---- report -----------------------------------------------------------------------------------------------------------------
console.log(`\nNew client "${name}" (${slug}): ${wrote.length} files written.`);
console.log(`\nPut these in web/.env.local (and in the Vercel project settings):\n`);
console.log(`BRAND_NAME=${name}`);
console.log(`BRAND_DEFAULT_VENUE=${slug}`);
console.log(`BRAND_BG=${bg}`);
console.log(`BRAND_TEXT=${text}`);
console.log(`BRAND_ACCENT=${accent}`);
console.log(`# BRAND_POWERED_BY=            (empty = hide "Powered by LOYALTY"; remove the line to keep it)`);
console.log(`# BRAND_LANGUAGES=en,ar        (guest page languages, default first; one language hides the switch)`);
console.log(`\nThen run supabase/seeds/${slug}.sql in the client's own Supabase project. Guests join at /join/${slug}.`);
console.log(`Swap the placeholder pictures for the client's real logo and photos before launch (see docs/NEW-CLIENT.md).\n`);
