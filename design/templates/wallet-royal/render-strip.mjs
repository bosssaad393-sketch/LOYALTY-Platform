// Renders strip-card.html to strip.png, strip@2x.png, strip@3x.png WITH A TRANSPARENT BACKGROUND (headless Edge over DevTools).
// usage: node render-strip.mjs <outDir>
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || here;
mkdirSync(out, { recursive: true });
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9500 + Math.floor(Math.random() * 400);
const edge = spawn(EDGE, ["--headless=new", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "edge-strip-"))}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pg;
for (let i = 0; i < 80 && !pg; i++) { try { pg = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} if (!pg) await sleep(250); }
const ws = new WebSocket(pg.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [scale, name] of [[1, "strip.png"], [2, "strip@2x.png"], [3, "strip@3x.png"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 144, deviceScaleFactor: scale, mobile: false });
  await send("Page.navigate", { url: pathToFileURL(join(here, "strip-card.html")).href });
  await sleep(1400);
  const r = await send("Page.captureScreenshot", { format: "png", fromSurface: true, clip: { x: 0, y: 0, width: 375, height: 144, scale: 1 } });
  writeFileSync(join(out, name), Buffer.from(r.data, "base64"));
  console.log("wrote", name);
}
try { await send("Browser.close"); } catch {}
edge.kill();
process.exit(0);
