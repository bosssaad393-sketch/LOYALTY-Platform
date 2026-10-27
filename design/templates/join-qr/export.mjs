// Renders join-qr-animated.html frame by frame (headless Edge over DevTools) so ffmpeg can make the video and the GIF.
// usage: node export.mjs <outFramesDir> [seconds=8] [fps=30]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const secs = Number(process.argv[3] || 8), fps = Number(process.argv[4] || 30);
const startFrame = Number(process.argv[5] || 0), countFrames = Number(process.argv[6] || 100000); // chunks: a fresh browser every few dozen frames, because a long-lived headless Edge stalls
mkdirSync(out, { recursive: true });
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), "edge-qr-"));
const edge = spawn(EDGE, ["--headless=new", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--window-size=1080,1920", "about:blank"], { stdio: "ignore" });
const killer = setTimeout(() => { edge.kill(); process.exit(2); }, 150000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pg;
for (let i = 0; i < 80 && !pg; i++) { try { pg = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} if (!pg) await sleep(250); }
const ws = new WebSocket(pg.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
const send = (method, params = {}, ms = 15000) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pending.delete(i); rej(new Error("timeout " + method)); }, ms); pending.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: pathToFileURL(join(here, "join-qr-animated.html")).href + "?t=0" });
await sleep(1500);

const n = Math.min(Math.round(secs * fps), startFrame + countFrames);
for (let f = startFrame; f < n; f++) {
  const t = f / fps;
  let r;
  for (let attempt = 0; attempt < 4 && !r; attempt++) {
    try {
      await send("Runtime.evaluate", { expression: `window.seek(${t})` });
      await sleep(25);
      r = await send("Page.captureScreenshot", { format: "png" });
    } catch (e) { console.log("retry frame", f, e.message); await sleep(500); }
  }
  if (!r) throw new Error("frame " + f + " failed");
  writeFileSync(join(out, `f${String(f).padStart(4, "0")}.png`), Buffer.from(r.data, "base64"));
  if (f % 30 === 0) console.log("frame", f, "of", n);
}
console.log("chunk done up to frame", n);
clearTimeout(killer);
try { await send("Browser.close"); } catch {}
edge.kill();
await sleep(300);
process.exit(0);
