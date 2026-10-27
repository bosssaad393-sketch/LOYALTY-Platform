// Builds join-qr-animated.html (one self-contained file) from the real join link.
// usage: node build.mjs [url]
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = "C:\\Users\\3amka\\Documents\\CALABOS\\workspace\\loyalty-repo\\web";
const require = createRequire(join(web, "package.json"));
const QRCode = require("qrcode");

const URL_TO_OPEN = process.argv[2] || "https://loyalty-three-delta.vercel.app/join/your-brand";
const q = QRCode.create(URL_TO_OPEN, { errorCorrectionLevel: "M" });
const n = q.modules.size;
const dark = (x, y) => q.modules.data[y * n + x] === 1;

// QR with a 4-module quiet zone. One rect per dark module; the diagonal wave delay is set in CSS through --d.
const Q = 4, total = n + Q * 2, PX = 20, SIZE = total * PX, LEFT = (1080 - SIZE) / 2, PANEL_TOP = 560;
let rects = "";
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (dark(x, y)) rects += `<rect class="m" x="${x + Q}" y="${y + Q}" width="1" height="1" style="--d:${x + y}"/>`;

const b64 = (f) => readFileSync(join(here, f)).toString("base64");
const marble = b64("src/marble.jpg");
const crest = b64("src/crest.png");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Brand Rewards: scan to get your card</title>
<style>
/* Animated join QR for Your Brand Rewards. Stage = 1080 x 1920 (phone, tablet or TV, scaled to fit).
   Timeline (8 s): 0 to 0.9 Your Brand, 0.9 to 1.5 panel, 1.2 to 3.2 the code appears in a diagonal wave, 3.2 to 3.9 words, then a slow light travels round the frame.
   The QR itself never moves after it has appeared, so it always scans. ?still = final state, no animation. ?t=3.5 = freeze at 3.5 s (used to make the video). */
@property --a{syntax:"<angle>";inherits:false;initial-value:0deg}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#050403;overflow:hidden}
body{display:grid;place-items:center;font-family:Georgia,"Times New Roman",serif;color:#F3E9D2}
#stage{width:1080px;height:1920px;position:relative;overflow:hidden;background:#0b0907;transform-origin:center center;flex:none}
.bg{position:absolute;inset:0;background:url(data:image/jpeg;base64,${marble}) center/cover no-repeat;filter:brightness(.55) contrast(1.05);animation:fadein 1.4s ease both}
.bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,7,5,.55) 0,rgba(8,7,5,.2) 38%,rgba(8,7,5,.72) 100%)}
.head{position:absolute;left:0;right:0;top:104px;text-align:center;animation:rise .9s cubic-bezier(.2,.7,.2,1) .15s both}
.head img{width:118px;height:auto;display:block;margin:0 auto 26px}
.k{font:600 158px/1 Georgia,"Times New Roman",serif;letter-spacing:.42em;padding-left:.42em;background:linear-gradient(100deg,#8a6f3a 0%,#e3c07e 28%,#cda55b 48%,#f6e4b0 62%,#b58d45 80%,#8a6f3a 100%);-webkit-background-clip:text;background-clip:text;color:transparent;animation:track 1.6s cubic-bezier(.2,.7,.2,1) .15s both}
.sub{margin-top:26px;font:700 30px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.5em;padding-left:.5em;text-transform:uppercase;color:#cda55b}
.panel{position:absolute;left:${LEFT}px;top:${PANEL_TOP}px;width:${SIZE}px;height:${SIZE}px;background:#fbf6ea;border-radius:14px;display:grid;place-items:center;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:panel .8s cubic-bezier(.2,.7,.2,1) .9s both}
.panel::before{content:"";position:absolute;inset:-14px;border:2px solid rgba(205,165,91,.5);border-radius:22px}
.panel::after{content:"";position:absolute;inset:-14px;border-radius:22px;padding:6px;background:conic-gradient(from var(--a),transparent 0 62%,rgba(227,192,126,0) 66%,#f6e4b0 90%,rgba(227,192,126,0) 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);animation:orbit 4.2s linear 3.8s infinite;opacity:0}
.panel svg{width:${SIZE}px;height:${SIZE}px;display:block}
.m{fill:#14110d;shape-rendering:crispEdges;opacity:0;animation:mod .36s ease-out calc(1.2s + var(--d) * .031s) both}
.words{position:absolute;left:0;right:0;top:${PANEL_TOP + SIZE + 74}px;text-align:center;animation:rise .8s cubic-bezier(.2,.7,.2,1) 3.2s both}
.words h2{font:600 74px/1.1 Georgia,"Times New Roman",serif;color:#F3E9D2}
.words h2 i{font-style:italic;color:#e3c07e}
.words p{margin:26px auto 0;max-width:800px;font:400 36px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#d9c9a8}
.pw{position:absolute;left:0;right:0;bottom:92px;text-align:center;font:600 24px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.34em;padding-left:.34em;text-transform:uppercase;color:#8d806a;animation:fadein .8s ease 3.6s both}
.pw b{color:#cda55b}
@keyframes fadein{from{opacity:0}to{opacity:1}}
@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes track{from{letter-spacing:.7em;opacity:0}to{letter-spacing:.42em;opacity:1}}
@keyframes panel{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
@keyframes mod{from{opacity:0}to{opacity:1}}
@keyframes orbit{0%{--a:0deg;opacity:1}100%{--a:360deg;opacity:1}}
html.still *,html.still *::before,html.still *::after{animation:none!important}
html.still .m{opacity:1}html.still .panel::after{opacity:0}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important}.m{opacity:1}.panel::after{opacity:0}}
</style></head><body>
<div id="stage">
 <div class="bg" aria-hidden="true"></div>
 <div class="head"><img alt="" src="data:image/png;base64,${crest}"><div class="k">Your Brand</div><div class="sub">Rewards</div></div>
 <div class="panel" role="img" aria-label="QR code. Scan it with your phone camera to get your Your Brand Rewards card."><svg viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg"><rect width="${total}" height="${total}" fill="#fbf6ea"/>${rects}</svg></div>
 <div class="words"><h2>Your <i>Your Brand</i> card</h2><p>Scan with your phone's camera.<br>It takes under a minute. Nothing to download.</p></div>
 <div class="pw">Powered by <b>LOYALTY</b></div>
</div>
<script>
(function(){
  var st=document.getElementById('stage');
  function fit(){var s=Math.min(innerWidth/1080,innerHeight/1920);st.style.transform='scale('+s+')';st.style.margin=(-(1920*(1-s))/2)+'px '+(-(1080*(1-s))/2)+'px'}
  addEventListener('resize',fit);fit();
  var q=location.search;
  if(/[?&]still\\b/.test(q))document.documentElement.classList.add('still');
  var m=q.match(/[?&]t=([0-9.]+)/);
  // used by the video export: freeze every animation at one moment
  window.seek=function(t){document.getAnimations().forEach(function(a){a.pause();a.currentTime=t*1000})};
  if(m)requestAnimationFrame(function(){window.seek(parseFloat(m[1]))});
})();
</script>
</body></html>`;

writeFileSync(join(here, "join-qr-animated.html"), html, "utf8");
console.log(`built: ${n}x${n} modules, ${Math.round(html.length / 1024)} KB, url ${URL_TO_OPEN}`);
