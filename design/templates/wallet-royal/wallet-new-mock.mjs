// Makes wallet-new-mock.html + .png: how the new Apple Wallet card will look on an iPhone, next to the card as it is today.
// The layout is an approximation of Apple's (Apple draws the real one); the strip, colours and fields are exactly what we send.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const web = "C:\\Users\\3amka\\Documents\\CALABOS\\workspace\\loyalty-repo\\web";
const QRCode = createRequire(join(web, "package.json"))("qrcode");
const q = QRCode.create("LOYALTY:brand:4827", { errorCorrectionLevel: "M" });
const n = q.modules.size; let p = "";
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.data[y * n + x]) p += `M${x} ${y}h1v1h-1z`;
const b64 = (f) => readFileSync(f).toString("base64");
const strip = b64(join(web, "passes", "brand", "strip@3x.png"));
const crest = b64(join(web, "public", "venues", "brand", "crest.png"));
const now = pathToFileURL("C:\\Users\\3amka\\AppData\\Local\\Temp\\claude\\C--Users-3amka-Documents-CALABOS\\16c630e3-f969-40f9-8e5a-fc50f099bea2\\images\\99.webp").href;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Your Brand Apple Wallet card: today and new</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1b1815;color:#F3E9D2;font:14px/1.4 -apple-system,"SF Pro Text",system-ui,"Segoe UI",Roboto,Arial,sans-serif;padding:30px 36px 34px;width:1040px}
h1{font:600 26px Georgia,serif;color:#E3C07E}.sub{color:#B8A98A;margin:6px 0 22px;max-width:900px}
.row{display:flex;gap:40px;align-items:flex-start}
.col .lab{font:700 12px system-ui;letter-spacing:.26em;text-transform:uppercase;color:#CDA55B;margin-bottom:10px}
.ph{width:460px;height:900px;background:#000;border-radius:38px;overflow:hidden;position:relative;box-shadow:0 0 0 6px #2a2621,0 24px 60px rgba(0,0,0,.6)}
.ph img.shot{display:block;width:460px}
.bar{display:flex;justify-content:space-between;align-items:center;padding:26px 22px 0}
.x{width:44px;height:44px;border-radius:50%;background:#1c1c1e;display:grid;place-items:center;font-size:20px}
.t{font:600 17px system-ui;color:#fff}.add{background:#0a84ff;color:#fff;border-radius:22px;padding:11px 20px;font:600 16px system-ui}
.pass{position:absolute;left:59px;right:59px;top:230px;border-radius:16px;background:rgb(8,7,6);box-shadow:0 0 0 1px rgba(255,255,255,.14),0 24px 50px rgba(0,0,0,.65);overflow:hidden}
.hd{display:flex;justify-content:space-between;align-items:center;padding:18px 20px 12px}
.hd img{width:56px;height:auto;display:block}
.l{font:600 12px system-ui;letter-spacing:.08em;text-transform:uppercase;color:rgb(205,165,91)}
.v{font:400 25px system-ui;color:rgb(243,233,210);margin-top:2px}
.strip{display:block;width:100%;height:auto}
.rw{display:flex;justify-content:space-between;padding:16px 20px 0}
.qr{background:#fff;border-radius:9px;width:196px;margin:24px auto 0;padding:12px 12px 9px;text-align:center;color:#000;font:13px system-ui;letter-spacing:.05em}
.qr svg{display:block;width:172px;height:172px;margin:0 auto 5px}
.pad{height:24px}
.note{margin-top:22px;color:#9A8C74;font-size:12.5px;max-width:960px}
</style></head><body>
<h1>Your Brand card in Apple Wallet: today and new</h1>
<p class="sub">Left: your phone today (the last letter of Your Brand is cut off). Right: the new card as we send it: the black marble card as the picture, then name, points and code in one row, and the QR below. Sample guest. Apple draws the real thing, so spacing can differ a few points; the picture, colours and fields are exactly what we send.</p>
<div class="row">
 <div class="col"><div class="lab">Today</div><div class="ph"><img class="shot" src="${now}" alt=""></div></div>
 <div class="col"><div class="lab">New</div><div class="ph">
  <div class="bar"><div class="x">&#x2715;</div><div class="t">Your Brand Loyalty Rewards</div><div class="add">Add</div></div>
  <div class="pass">
   <div class="hd"><img alt="" src="data:image/png;base64,${crest}"><div style="text-align:right"><div class="l">Powered by</div><div class="v">LOYALTY</div></div></div>
   <img class="strip" alt="" src="data:image/png;base64,${strip}">
   <div class="rw"><div><div class="l">Member</div><div class="v">Sara Hasan</div></div><div style="text-align:center"><div class="l">Points</div><div class="v">320</div></div><div style="text-align:right"><div class="l">Your code</div><div class="v">4827</div></div></div>
   <div class="qr"><svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${p}" fill="#000"/></svg>4827</div>
   <div class="pad"></div>
  </div></div></div>
</div>
</body></html>`;
writeFileSync(join(here, "wallet-new-mock.html"), html, "utf8");
console.log("wrote wallet-new-mock.html");
