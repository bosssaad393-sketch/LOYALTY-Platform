// Writes the QR design page (public/design/qr/index.html) with the scan results baked in. Called by qr-variants.mjs.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function qrDesignPage({ C, venue, VARIANTS, SIZES, results }) {
  const cell = (ok, gap) => `<td class="${ok ? "ok" : "no"}${gap ? " gap" : ""}">${ok ? "Reads" : "Fails"}</td>`;
  const passAll = (id) => results.filter((r) => r.id === id).every((r) => SIZES.every((s) => r.clean[s] && r.camera[s]));
  const figures = VARIANTS.map((v) => `
      <figure class="v${v.use === "reject" ? " rejected" : ""}">
        <img src="png/${v.id}-till.png" alt="" width="240" height="240">
        <figcaption>
          <h3>${esc(v.name)}</h3>
          <p class="use">${v.use === "reject" ? "Rejected" : v.use === "till" ? "For the member card" : "For posters and table tents"}, level ${v.ec}${passAll(v.id) ? ", read at every size tested" : ""}</p>
          <p>${esc(v.note)}</p>
        </figcaption>
      </figure>`).join("");
  const rows = results.map((r) => `
        <tr><th scope="row">${esc(VARIANTS.find((v) => v.id === r.id).name)}<small>${r.payload === "till" ? "Till code" : "Join link"}, ${r.modules} x ${r.modules} modules${r.markArea ? `, crest covers ${r.markArea}%` : ""}</small></th>
          ${SIZES.map((s) => cell(r.clean[s])).join("")}${SIZES.map((s, i) => cell(r.camera[s], i === 0)).join("")}</tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>QR code styles</title>
<style>
  :root { --bg: ${C.ink}; --text: ${C.bone}; --gold: ${C.gold}; --muted: color-mix(in srgb, var(--text) 74%, var(--bg)); --dim: color-mix(in srgb, var(--text) 56%, var(--bg)); --rule: color-mix(in srgb, var(--gold) 22%, transparent); --ok: #9cc79d; --bad: #e58b79;
    --serif: Georgia, "Times New Roman", serif; --sans: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font: 16px/1.55 var(--sans); }
  main { max-width: 1120px; margin: 0 auto; padding: 56px 24px 96px; }
  :focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .flag { display: inline-block; padding: 4px 10px; border: 1px solid var(--gold); border-radius: 4px; color: var(--gold); font-size: 13px; }
  h1 { margin-top: 20px; font: 600 44px/1.1 var(--serif); }
  h2 { margin: 72px 0 8px; font: 600 28px/1.2 var(--serif); }
  h3 { font: 600 20px/1.25 var(--serif); }
  .lede { max-width: 62ch; margin-top: 12px; color: var(--muted); font-size: 17px; }
  p + p { margin-top: 8px; }
  .s { color: var(--muted); max-width: 66ch; }
  .pick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px; margin-top: 28px; }
  .pick article { border-top: 1px solid var(--gold); padding-top: 20px; }
  .pick p { color: var(--muted); max-width: 52ch; margin-top: 8px; }
  .pick b { color: var(--text); font-weight: 600; }
  .scenes { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 40px; align-items: end; justify-items: stretch; margin-top: 56px; }
  .scene-cap { margin-top: 14px; color: var(--dim); font-size: 14px; }
  .card { container-type: inline-size; position: relative; aspect-ratio: 428 / 270; border-radius: 4.6cqw; overflow: hidden; color: var(--text);
    background: linear-gradient(100deg, rgba(10,7,16,.92) 30%, rgba(10,7,16,.35)), url(../../venues/${venue}/marble.jpg) 60% 30% / cover, var(--bg); box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 24px 60px rgba(0,0,0,.45); }
  .card > * { position: absolute; }
  .card .crest { left: 6.5cqw; top: 6cqw; width: 13cqw; }
  .card .venue { right: 6.5cqw; top: 7.6cqw; font: 600 3.4cqw/1.25 var(--serif); letter-spacing: .06em; color: var(--gold); text-align: right; }
  .card .name { left: 6.5cqw; bottom: 16cqw; font: 600 4.4cqw/1.1 var(--serif); }
  .card .pts { left: 6.5cqw; bottom: 6.5cqw; font: 400 3cqw/1.2 var(--sans); color: var(--muted); }
  .card .pts b { font: 600 6.4cqw/1 var(--serif); color: var(--gold); margin-right: 1.4cqw; }
  .card .qr { right: 6.5cqw; bottom: 6.5cqw; width: 26cqw; border-radius: 2cqw; }
  .tent-wrap { container-type: inline-size; width: 100%; max-width: 340px; margin: 0 auto; }
  .tent { position: relative; aspect-ratio: 105 / 148; width: 100%; overflow: hidden; color: var(--text); text-align: center;
    background: linear-gradient(180deg, rgba(10,7,16,.55), rgba(10,7,16,.92) 55%), url(../../venues/${venue}/marble.jpg) 70% 20% / cover, var(--bg);
    padding: 10cqw 11cqw 10cqw; display: flex; flex-direction: column; align-items: center; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  .tent::after { content: ""; position: absolute; inset: 3.6cqw; border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent); pointer-events: none; }
  .tent .crest { width: 20cqw; }
  .tent h3 { margin-top: 5cqw; font: 600 8.4cqw/1.1 var(--serif); }
  .tent p { margin-top: 2.6cqw; font-size: 4.4cqw; color: var(--muted); line-height: 1.4; }
  .tent .qr { margin-top: 6cqw; width: 54cqw; border-radius: 2.4cqw; }
  .tent .how { margin-top: auto; padding-top: 5cqw; font-size: 3.8cqw; color: var(--dim); }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px 32px; margin-top: 28px; }
  .v img { display: block; width: 100%; height: auto; border-radius: 8px; }
  .v figcaption { margin-top: 16px; }
  .v .use { margin-top: 4px; color: var(--gold); font-size: 14px; }
  .v figcaption p:not(.use) { color: var(--muted); font-size: 15px; }
  .v.rejected img { opacity: .5; }
  .v.rejected .use { color: var(--bad); }
  .table-wrap { overflow-x: auto; margin-top: 24px; }
  table { border-collapse: collapse; min-width: 760px; width: 100%; font-size: 14px; }
  th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--rule); }
  thead th { color: var(--dim); font-weight: 600; }
  thead tr:first-child th { color: var(--muted); }
  tbody th { font-weight: 600; }
  tbody th small { display: block; color: var(--dim); font-weight: 400; }
  td { text-align: center; }
  td.ok { color: var(--ok); }
  td.no { color: var(--bad); font-weight: 700; }
  .gap { border-left: 1px solid var(--rule); }
  ul.rules { margin-top: 20px; padding-left: 20px; color: var(--muted); max-width: 70ch; }
  ul.rules li + li { margin-top: 6px; }
  code { font-size: 14px; color: var(--text); }
  footer { margin-top: 80px; padding-top: 20px; border-top: 1px solid var(--rule); color: var(--dim); font-size: 13px; }
  @media (max-width: 860px) {
    main { padding: 40px 16px 72px; }
    h1 { font-size: 34px; }
    .pick, .scenes { grid-template-columns: minmax(0, 1fr); }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 16px; }
  }
  @media (max-width: 520px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>
<body>
<main>
  <span class="flag">Design exploration, sample data</span>
  <h1>QR code styles</h1>
  <p class="lede">Two jobs: the small till code on each member&rsquo;s card, read by staff phones at the counter, and the join code on posters, table tents and NFC plates, read by guests&rsquo; own cameras. Every style here was decoded by machine before it was allowed on this page.</p>

  <h2>Recommendation</h2>
  <div class="pick">
    <article>
      <h3>Member card: Soft corners</h3>
      <p>Ink modules on a bone plate, level Q, a full four-module quiet zone. It read at every size tested, from 96 to 600 px, clean and after a simulated phone capture. The softened eyes are the only styling: enough to feel made for the card, nothing that costs the scanner.</p>
      <p><b>Why not more:</b> the till code is read in a hurry, in low light, by our own scanner, which reads dark-on-light codes only.</p>
    </article>
    <article>
      <h3>Posters and tents: Crest centre</h3>
      <p>The same soft-corner code at level H, with the venue crest on a small ink tile in the middle (about 6 to 7% of the code). The crest tells a guest whose code it is before they scan. It read from 128 px up; give it room on print and test the printer&rsquo;s proof with two different phones.</p>
      <p><b>Alternative:</b> Gold plate, for a poster where bone looks too bright. It also read at every size.</p>
    </article>
  </div>

  <div class="scenes" aria-label="The two recommended styles in use">
    <figure>
      <div class="card">
        <img class="crest" src="../../venues/${venue}/crest.png" alt="">
        <div class="venue">Nº10<br>by Hydur</div>
        <div class="name">Sample Member</div>
        <div class="pts"><b>240</b>points of 500</div>
        <img class="qr" src="png/b-soft-till.png" alt="Sample till QR code, soft corners">
      </div>
      <figcaption class="scene-cap">On the member card. Sample name and points; the card itself is designed separately.</figcaption>
    </figure>
    <figure>
      <div class="tent-wrap"><div class="tent">
        <img class="crest" src="../../venues/${venue}/crest.png" alt="">
        <h3>Join our rewards</h3>
        <p>Your card lives in your phone&rsquo;s Wallet. Nothing to download.</p>
        <img class="qr" src="png/e-crest-join.png" alt="Sample join QR code with the crest in the centre">
        <p class="how">Point your camera at the code.<br>Powered by LOYALTY</p>
      </div></div>
      <figcaption class="scene-cap">On a table tent. The link inside is a placeholder (example.com).</figcaption>
    </figure>
  </div>

  <h2>All six styles</h2>
  <p class="s">Shown with the till code. Each was also made with the join link; the PNGs for both are in <code>png/</code>.</p>
  <div class="grid">${figures}
  </div>

  <h2>Scan test</h2>
  <p class="s">Decoded with jsQR, the library the staff scanner uses, set the same way (dark-on-light only). The camera-like capture puts the code on a dark surround, blurs it, dims it and saves it as a low-quality JPEG. Sizes are the whole code including its quiet zone, in pixels. On the web card the code is about 80 CSS px, which is 160 to 240 real pixels on a phone screen.</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th></th><th colspan="${SIZES.length}">Clean image</th><th colspan="${SIZES.length}" class="gap">Camera-like capture</th></tr>
        <tr><th scope="col">Style</th>${SIZES.map((s) => `<th scope="col">${s}</th>`).join("")}${SIZES.map((s, i) => `<th scope="col"${i === 0 ? ' class="gap"' : ""}>${s}</th>`).join("")}</tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </div>
  <ul class="rules">
    <li>Dots were rejected: they failed at some sizes even at level H.</li>
    <li>Gold on black was rejected: inverted codes never read in our scanner, and other apps read them only when they try both polarities.</li>
    <li>Rules for any client: dark modules on a light plate, level Q on the card and H when a mark sits in the middle, four modules of quiet zone, the mark under about 20% of the area (here 6 to 7%).</li>
    <li>Not tested yet: real phones, real print, and Apple or Google Wallet (Wallet draws its own barcode).</li>
  </ul>
  <footer>Made by <code>web/scripts/qr-variants.mjs</code> on ${new Date().toISOString().slice(0, 10)}. Colours come from the brand settings. Powered by LOYALTY.</footer>
</main>
</body>
</html>
`;
}
