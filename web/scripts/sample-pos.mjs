#!/usr/bin/env node
/**
 * A SAMPLE till (POS) for showing LOYALTY's till link. Runs on YOUR PC, serves one page, and sends real messages to the platform:
 *   POS_URL=https://loyalty-platform-steel.vercel.app POS_KEY=loy_pos_... node scripts/sample-pos.mjs        then open http://localhost:8790
 * The key stays in this program (an environment variable), never in the browser page. Plain Node, nothing to install.
 * It is a stand-in for a real POS: the cashier picks items, types the guest's 4-digit card code, presses Pay, and the platform adds the points.
 * Nothing here touches real money. Use only with a sample business.
 */
import http from "node:http";

const URL_BASE = (process.env.POS_URL || "").replace(/\/+$/, "");
const KEY = process.env.POS_KEY || "";
const PORT = Number(process.env.PORT || 8790);
if (!/^https?:\/\//.test(URL_BASE) || !KEY.startsWith("loy_pos_")) {
  console.error("Set POS_URL (your platform address) and POS_KEY (the key from /dev > Till, starts with loy_pos_) first.");
  process.exit(1);
}

async function send(body) {
  try {
    const r = await fetch(`${URL_BASE}/api/pos/events`, { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) {
    return { status: 0, error: "could not reach the platform (" + (e?.name || "error") + ")" };
  }
}

const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sample POS</title>
<style>
:root{--bg:#0d0d10;--card:#17171c;--line:#2c2c34;--text:#ecebe6;--dim:#9a98a0;--gold:#e0b45f;--ok:#7fc08a;--bad:#e38b7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,Segoe UI,Arial,sans-serif;display:grid;grid-template-columns:1fr 340px;min-height:100vh}
main{padding:24px}aside{background:var(--card);border-left:1px solid var(--line);padding:24px;display:flex;flex-direction:column;gap:14px}
h1{margin:0 0 4px;font-size:22px}small{color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:18px}
.item{background:var(--card);border:1px solid var(--line);color:var(--text);border-radius:14px;padding:18px 12px;text-align:left;cursor:pointer;font:inherit}
.item:hover{border-color:var(--gold)}.item b{display:block;font-size:17px}.item span{color:var(--dim)}
.line{display:flex;justify-content:space-between;gap:8px;color:var(--dim)}.total{font-size:30px;color:var(--text);display:flex;justify-content:space-between}
input{background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:14px;font:600 22px system-ui;letter-spacing:.3em;text-align:center;width:100%}
button.act{border:0;border-radius:12px;padding:16px;font:700 16px system-ui;cursor:pointer}.pay{background:var(--gold);color:#201808}.ghost{background:transparent;border:1px solid var(--line)!important;color:var(--text)}
#msg{min-height:64px;border:1px solid var(--line);border-radius:10px;padding:12px;font-size:15px}.ok{color:var(--ok)}.bad{color:var(--bad)}
@media(max-width:800px){body{grid-template-columns:1fr}aside{border-left:0;border-top:1px solid var(--line)}}
</style>
<main><h1>Sample POS</h1><small>A stand-in till for showing the LOYALTY link. Sample items, not real prices.</small>
<div class="grid" id="items"></div></main>
<aside><h1>Order</h1><div id="lines" class="line">Nothing yet</div><div class="total"><span>Total</span><span id="tot">0.000</span></div>
<label><small>Guest card code (4 digits)</small><input id="code" inputmode="numeric" maxlength="4" placeholder="4821"></label>
<button class="act pay" id="pay">Pay</button><button class="act ghost" id="refund">Refund last sale</button><button class="act ghost" id="ping">Test connection</button>
<button class="act ghost" id="clear">Clear order</button><div id="msg" aria-live="polite"></div></aside>
<script>
const ITEMS=[["Mint lemonade",3.5],["Sparkling water",1.5],["Mezze platter",9.5],["Grilled chicken",8],["Falafel box",5],["Dessert of the day",4.5],["Tea pot",3],["Arabic coffee",2.5]];
let order=[],last=null;const $=s=>document.querySelector(s);
const money=n=>n.toFixed(3);
function draw(){$("#lines").innerHTML=order.length?order.map(o=>"<div class='line'><span>"+o[0]+"</span><span>"+money(o[1])+"</span></div>").join(""):"Nothing yet";$("#tot").textContent=money(order.reduce((s,o)=>s+o[1],0))}
$("#items").innerHTML=ITEMS.map((i,n)=>"<button class='item' data-n='"+n+"'><b>"+i[0]+"</b><span>BHD "+money(i[1])+"</span></button>").join("");
document.querySelectorAll(".item").forEach(b=>b.onclick=()=>{order.push(ITEMS[b.dataset.n]);draw()});
const say=(t,c)=>{$("#msg").className=c||"";$("#msg").textContent=t};
async function post(p,body){const r=await fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});return r.json()}
$("#clear").onclick=()=>{order=[];draw();say("")};
$("#ping").onclick=async()=>{const r=await post("/api/ping",{});say(r.ok?"Connected. The platform answered.":"Not connected: "+(r.error||r.status),r.ok?"ok":"bad")};
$("#pay").onclick=async()=>{const total=order.reduce((s,o)=>s+o[1],0);if(!total)return say("Add an item first.","bad");const code=$("#code").value.trim();
 if(!/^\\d{4}$/.test(code))return say("Type the guest's 4-digit card code, or pay without a card (no points).","bad");
 const receiptId="SAMPLE-"+Date.now();const r=await post("/api/sale",{receiptId,cardCode:code,billBhd:Math.round(total*1000)/1000});
 if(r.ok){last=receiptId;say("Paid BHD "+money(total)+". Points added: "+r.pointsAdded+". Guest balance: "+r.balance+(r.duplicate?" (duplicate ignored)":""),"ok");order=[];draw()}else say("Not sent: "+(r.error||r.status),"bad")};
$("#refund").onclick=async()=>{if(!last)return say("No sale to refund yet.","bad");const r=await post("/api/refund",{receiptId:last});
 if(r.ok){say("Refunded. Points taken back: "+r.pointsRemoved+". Balance: "+r.balance+(r.duplicate?" (already refunded)":""),"ok")}else say("Not refunded: "+(r.error||r.status),"bad")};
</script>`;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(PAGE);
  }
  if (req.method === "POST" && ["/api/ping", "/api/sale", "/api/refund"].includes(req.url || "")) {
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 5000) break; }
    let b = {};
    try { b = JSON.parse(raw || "{}"); } catch { /* empty */ }
    const msg = req.url === "/api/ping" ? { type: "ping" } : req.url === "/api/sale" ? { type: "sale", receiptId: String(b.receiptId || ""), cardCode: String(b.cardCode || ""), billBhd: Number(b.billBhd) } : { type: "refund", receiptId: String(b.receiptId || "") };
    const r = await send(msg);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: r.status === 200 && r.ok !== false, ...r }));
  }
  res.writeHead(404).end("Not found");
});
server.listen(PORT, "127.0.0.1", () => console.log(`Sample POS on http://localhost:${PORT}  ->  ${URL_BASE}`));
