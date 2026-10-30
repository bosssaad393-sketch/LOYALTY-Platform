"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import type { BrandProps } from "@/lib/brand";
import "@/components/pinpad.css";
import { DEVICES, cardIdFrom, cardLink, fitScale, qrPath, screenLinks, type Device } from "./screens";

const noop = () => () => {};
/** This page's own address, read in the browser only (empty while the server renders). */
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "");
const isLocal = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (id: string, text: string) => {
      try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600); } catch { setCopied(null); }
    },
  };
}

/**
 * One place that opens every surface of this deployment while you work: the guest pages (public), staff, owner
 * and this developer area. The guest join page is previewed live. Staff and owner are not embedded: the sign-in is
 * one cookie per browser, so inside this developer session they would only show "this login is for staff".
 */
export default function AllScreens({ brand, mock }: { brand: BrandProps; mock: boolean }) {
  const origin = useOrigin();
  const links = screenLinks(origin, brand.slug);
  const { copied, copy } = useCopy();
  const [cardIn, setCardIn] = useState("");
  const cardId = cardIdFrom(cardIn);

  const open = (href: string) => <a className="ow-btn small" href={href} target="_blank" rel="noopener">Open<span className="sr-only"> in a new tab</span></a>;
  const copyBtn = (id: string, text: string) => (
    <button type="button" className="sc-copy" onClick={() => copy(id, text)}>{copied === id ? "Copied" : "Copy link"}</button>
  );

  return (
    <>
      <header className="dv-head">
        <p className="dv-eyebrow">While you work</p>
        <h1>All screens</h1>
        <p className="dv-lede">Every part of {brand.name}, one click away. Guest pages are public. Staff and owners sign in with a PIN, and you sign in here with your email and password.</p>
      </header>

      <div className="sc-top">
        <GuestPreview url={links.join} />
        <JoinQr url={links.join} origin={origin} copied={copied === "qr"} onCopy={() => copy("qr", links.join)} />
      </div>

      <section className="ow-panel sc-list" aria-labelledby="sc-list-h">
        <h2 className="ow-h" id="sc-list-h">Open a screen</h2>

        <article className="sc-row">
          <div className="sc-what">
            <h3>Guest join page</h3>
            <p className="sc-who">For guests. No sign-in.</p>
            <p className="sc-try">Try joining with a test name. It creates a real member, which you can erase later in the owner&apos;s Data and privacy. The terms page is linked from the form.</p>
          </div>
          <div className="sc-act">{open(links.join)}{copyBtn("join", links.join)}</div>
        </article>

        <article className="sc-row">
          <div className="sc-what">
            <h3>Member card</h3>
            <p className="sc-who">For guests. No sign-in: the card&apos;s private link is the key.</p>
            <p className="sc-try">Joining ends on the card. Paste its link or id here to open it again and check the points, the till QR and the Wallet buttons.</p>
            <label className="sc-cardin">
              <span className="sr-only">Card link or id</span>
              <input className="ow-in" value={cardIn} onChange={(e) => setCardIn(e.target.value)} placeholder="Paste a card link or id" spellCheck={false} autoComplete="off" />
            </label>
            {cardIn.trim() && !cardId && <p className="sc-hint" role="status">That is not a card id. It looks like 8-4-4-4-12 letters and digits.</p>}
          </div>
          <div className="sc-act">
            {cardId ? <>{open(cardLink(origin, cardId))}{copyBtn("card", cardLink(origin, cardId))}</> : <span className="sc-hint">Paste a card first</span>}
          </div>
        </article>

        <article className="sc-row">
          <MiniPin role="staff" brand={brand} />
          <div className="sc-what">
            <h3>Staff</h3>
            <p className="sc-who">For the team at the till. Sign in with a staff PIN.</p>
            <p className="sc-try">Scan a member&apos;s card, add points for a bill, give a reward, then undo the last entry (it can be undone for 10 minutes).</p>
            <SessionNote who="a staff member" />
          </div>
          <div className="sc-act">
            {open(links.staff)}{copyBtn("staff", links.staff)}
            {mock && <a className="sc-copy" href="/staff?mock=1" target="_blank" rel="noopener">Demo version</a>}
          </div>
        </article>

        <article className="sc-row">
          <MiniPin role="owner" brand={brand} />
          <div className="sc-what">
            <h3>Owner</h3>
            <p className="sc-who">For the owner and managers. Sign in with an owner or manager PIN.</p>
            <p className="sc-try">Look at the overview, change the reward, send a test update to the cards, and check Data and privacy.</p>
            <SessionNote who="the owner" />
          </div>
          <div className="sc-act">
            {open(links.owner)}{copyBtn("owner", links.owner)}
            {mock && <a className="sc-copy" href="/owner?mock=1&signedout=1" target="_blank" rel="noopener">Demo version</a>}
          </div>
        </article>

        <article className="sc-row">
          <div className="sc-what">
            <h3>Developer</h3>
            <p className="sc-who">For you. Sign in with your email and password. You are here.</p>
            <p className="sc-try">Connect the till, answer the owner&apos;s requests, and give people their first PIN.</p>
          </div>
          <div className="sc-act">{copyBtn("dev", links.dev)}</div>
        </article>
      </section>
      {mock && <p className="sc-hint">Demo versions run on invented data and only exist on the development server.</p>}
    </>
  );
}

function SessionNote({ who }: { who: string }) {
  return (
    <p className="sc-note">
      Opens in its own tab. This browser keeps one sign-in, so signing in there as {who} signs you out here.
      To stay the developer at the same time, open the link in a private window (Ctrl+Shift+N).
    </p>
  );
}

/** The live join page in a frame the width of a phone, a tablet or a laptop, scaled down to fit. */
function GuestPreview({ url }: { url: string }) {
  const [device, setDevice] = useState<Device>("phone");
  const [round, setRound] = useState(0);
  const [box, setBox] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The frame cannot tell us the page failed, so ask the server once per load and say so plainly.
  const [status, setStatus] = useState<{ key: string; code: number } | null>(null);
  const loadKey = `${url}#${round}`;
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url, { cache: "no-store" }).then((r) => r.status, () => 0).then((code) => { if (live) setStatus({ key: loadKey, code }); });
    return () => { live = false; };
  }, [url, loadKey]);
  const failed = status?.key === loadKey && (status.code === 0 || status.code >= 400) ? status.code : null;

  const d = DEVICES[device];
  // Fit the width of the box and keep the whole page window within about one laptop screen.
  const scale = Math.min(fitScale(d.width, box), fitScale(d.height, 640));
  return (
    <section className="ow-panel sc-preview" aria-labelledby="sc-prev-h">
      <div className="dv-rowhead">
        <h2 className="ow-h" id="sc-prev-h">Guest join page, live</h2>
        <div className="sc-tools">
          <div className="dv-seg" role="group" aria-label="Preview width">
            {(Object.keys(DEVICES) as Device[]).map((k) => (
              <button key={k} type="button" aria-pressed={device === k} onClick={() => setDevice(k)}>{DEVICES[k].label}</button>
            ))}
          </div>
          <button type="button" className="ow-btn small" onClick={() => setRound((r) => r + 1)}>Reload</button>
        </div>
      </div>
      <div className="sc-stage" ref={boxRef} style={{ height: Math.round(d.height * scale) }}>
        {url && box > 0 && (
          <div className={`sc-device sc-${device}`} style={{ width: d.width, height: d.height, transform: `translateX(-50%) scale(${scale})` }}>
            <iframe key={`${device}-${round}`} src={url} title={`Guest join page at ${d.label.toLowerCase()} width`} width={d.width} height={d.height} sandbox="allow-scripts allow-same-origin allow-forms" />
          </div>
        )}
        {failed !== null && (
          <div className="sc-fail" role="status">
            <p><b>The join page did not open{failed ? ` (error ${failed})` : ""}.</b></p>
            <p>{failed === 404 ? "There is no venue with this name in the database yet." : failed === 0 ? "The server did not answer." : "Usually this means the database is not connected on this server (Supabase settings)."} Fix that, then press Reload.</p>
          </div>
        )}
      </div>
      <p className="sc-hint">{d.label} width, {d.width} px{scale < 1 ? `, shown at ${Math.round(scale * 100)}%` : ""}. This is the real page: anything you submit here is saved.</p>
    </section>
  );
}

/** The join link as a QR code, dark modules on a light plate with the full quiet zone, so any phone camera reads it. */
function JoinQr({ url, origin, copied, onCopy }: { url: string; origin: string; copied: boolean; onCopy: () => void }) {
  const qr = useMemo(() => {
    if (!url) return null;
    const { modules } = QRCode.create(url, { errorCorrectionLevel: "Q" });
    return { size: modules.size, d: qrPath(modules.size, modules.data) };
  }, [url]);
  const quiet = 4;
  return (
    <section className="ow-panel sc-qr" aria-labelledby="sc-qr-h">
      <h2 className="ow-h" id="sc-qr-h">Scan with your phone</h2>
      <div className="sc-plate">
        {qr && (
          <svg viewBox={`${-quiet} ${-quiet} ${qr.size + quiet * 2} ${qr.size + quiet * 2}`} role="img" aria-label={`QR code for ${url}`} shapeRendering="crispEdges">
            <rect x={-quiet} y={-quiet} width={qr.size + quiet * 2} height={qr.size + quiet * 2} fill="var(--text)" />
            <path d={qr.d} fill="var(--bg)" />
          </svg>
        )}
      </div>
      <p className="sc-url">{url || "…"}</p>
      {isLocal(origin) && <p className="sc-note">This address only works on this PC. Your phone needs the hosted address, or this PC&apos;s address on your network.</p>}
      <button type="button" className="ow-btn small" onClick={onCopy} disabled={!url}>{copied ? "Copied" : "Copy link"}</button>
    </section>
  );
}

/** A still picture of the PIN screen, drawn with the real PIN styles. Not interactive, hidden from screen readers. */
function MiniPin({ role, brand }: { role: "owner" | "staff"; brand: BrandProps }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "⌫"];
  return (
    <div className="sc-mini" aria-hidden="true" inert>
      <div className={`pp pp-${role}`}>
        <div className="pp-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
          <img className="pp-crest" src={`/venues/${brand.slug}/crest.png`} alt="" width={56} height={56} />
          <p className="pp-venue">{brand.name}</p>
          <p className="pp-title">{role === "owner" ? "Owner" : "Staff"}</p>
          <div className="pp-dots">{Array.from({ length: role === "owner" ? 6 : 4 }, (_, i) => <i key={i} />)}</div>
          <div className="pp-keys">{keys.map((k) => <span key={k} className={`pp-key${k.length > 1 || k === "⌫" ? " pp-fn" : ""}`}>{k}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
