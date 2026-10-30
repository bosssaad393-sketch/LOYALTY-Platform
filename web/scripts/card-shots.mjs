// Exports the member-card design mock-ups (public/design/card/index.html?shot=...) to PNG with headless Microsoft Edge.
// Needs a running dev server (default http://localhost:3030; pass another base as the first argument). Windows only.
//
//   node scripts/card-shots.mjs [http://localhost:3040]
//
// Sizes: web card 1284 x 810 (428 x 270 at 3x), Apple strip 1125 x 432 (375 x 144 pt at 3x), Google hero 1032 x 336.
// Everything on the page is sized in shares of the width, so each is drawn at its full pixel width at scale 1
// (headless Edge has a minimum window width, which would crop a 428 px window).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = (process.argv[2] || "http://localhost:3030").replace(/\/+$/, "");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = path.resolve(import.meta.dirname, "..", "public", "design", "card", "png");
mkdirSync(out, { recursive: true });

const shots = [
  ...["a", "b", "c", "cb"].map((d) => ({ id: `card-${d}`, w: 1284, h: 810, scale: 1 })),
  { id: "card-a-0", w: 1284, h: 810, scale: 1 },
  { id: "card-a-500", w: 1284, h: 810, scale: 1 },
  ...["a", "b", "c"].map((d) => ({ id: `strip-${d}`, w: 1125, h: 432, scale: 1 })),
  ...["a", "b", "c"].map((d) => ({ id: `hero-${d}`, w: 1032, h: 336, scale: 1 })),
];

for (const s of shots) {
  const profile = mkdtempSync(path.join(tmpdir(), "edge-shot-"));
  const file = path.join(out, `${s.id}.png`);
  execFileSync(edge, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${profile}`,
    `--window-size=${s.w},${s.h}`, `--force-device-scale-factor=${s.scale}`, "--timeout=4000",
    `--screenshot=${file}`, `${base}/design/card/index.html?shot=${s.id}`,
  ], { stdio: "ignore" });
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Edge may still hold the temp profile; it is in the temp folder */ }
  console.log("wrote", path.relative(process.cwd(), file));
}
