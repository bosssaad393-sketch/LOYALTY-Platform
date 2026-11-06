"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { filsText, linesTotal, REQUEST_KINDS, type RequestKind } from "@/lib/table/rules";
import type { MenuView } from "@/lib/table/db";
import "./table.css";

type Round = { id: string; status: string; readyMinutes: number | null; acceptedAt: string | null; lines: { nameEn: string; nameAr: string | null; qty: number; note: string | null }[] };
type Tab = { rounds: Round[]; totalFils: number; calls: string[] };
type Props = { token: string; label: string; venueName: string; venueSlug: string; menu: MenuView; initialTab: Tab; poweredBy: string };

const POLL_MS = 5000;

export default function TableApp({ token, label, venueName, venueSlug, menu: initialMenu, initialTab, poweredBy }: Props) {
  const t = useTranslations("table");
  const locale = useLocale();
  const ar = locale === "ar";
  const name = (x: { nameEn: string; nameAr: string | null }) => (ar && x.nameAr) || x.nameEn;

  const [menu, setMenu] = useState(initialMenu);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [section, setSection] = useState(initialMenu[0]?.id ?? "");
  const [review, setReview] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  const money = (fils: number) => t("money", { amount: filsText(fils) });

  // Status page: the guest's rounds and sold-out items stay current. Paused while the page is in the background.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/table/${token}`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => null);
      if (data) { setMenu(data.menu); setTab(data.tab); }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token]);

  // The chip follows the section on screen, and stays in view in its own sideways strip.
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id.slice(2), e.isIntersecting);
      const first = initialMenu.find((c) => seen.get(c.id));
      if (first) setSection(first.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    for (const c of initialMenu) {
      const el = document.getElementById(`c-${c.id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [initialMenu]);

  useEffect(() => {
    const chip = document.querySelector<HTMLElement>(".tb-chip.on");
    const bar = chip?.parentElement;
    if (chip && bar) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [section]);

  // The order sheet: a native dialog, so focus and the Escape key are handled by the browser.
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (review && !d.open) d.showModal();
    if (!review && d.open) d.close();
  }, [review]);

  const allItems = useMemo(() => menu.flatMap((c) => c.items), [menu]);
  const picked = allItems.filter((i) => i.available && (qty[i.id] ?? 0) > 0);
  const count = picked.reduce((n, i) => n + qty[i.id], 0);
  const total = linesTotal(picked.map((i) => ({ price_fils: i.priceFils, qty: qty[i.id] })));

  function change(id: string, by: number) {
    setError(null);
    setSent(false);
    if (count + by <= 0) setReview(false);
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + by)) }));
  }

  async function post(path: string, body: unknown) {
    const res = await fetch(`/api/table/${token}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res) { setError(t("errors.offline")); return null; }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status === 409) setError(t("errors.soldOut"));
    else if (res.status === 429) setError(t("errors.tooMany"));
    else setError(t("errors.server"));
    return null;
  }

  async function send() {
    setBusy(true);
    setError(null);
    const data = await post("order", { items: picked.map((i) => ({ id: i.id, qty: qty[i.id] })) });
    setBusy(false);
    if (!data) return;
    setTab(data.tab);
    setQty({});
    setReview(false);
    setSent(true);
    document.getElementById("tb-rounds")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function call(kind: RequestKind) {
    setError(null);
    const data = await post("request", { kind });
    if (data) setTab(data.tab);
  }

  const status = (r: Round) => {
    if (r.status === "accepted" && r.readyMinutes) return t("status.acceptedIn", { minutes: r.readyMinutes });
    return t(`status.${r.status}` as "status.new");
  };

  return (
    <>
      <header className="tb-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark; hidden when the client has no crest file */}
        <img className="tb-crest" src={`/venues/${venueSlug}/crest.png`} alt={venueName} width={64} height={64} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <div>
          <p className="tb-venue">{venueName}</p>
          <h1 className="tb-table">{t("tableLabel", { label })}</h1>
        </div>
      </header>

      <section className="tb-calls" aria-label={t("callsLabel")}>
        {REQUEST_KINDS.map((k) => {
          const open = tab.calls.includes(k);
          return (
            <button key={k} type="button" className={`tb-call${open ? " on" : ""}`} aria-pressed={open} disabled={open} onClick={() => call(k)}>
              <b>{t(`calls.${k}`)}</b>
              <small>{open ? t("calls.onTheWay") : t("calls.tap")}</small>
            </button>
          );
        })}
      </section>

      {tab.rounds.length > 0 && (
        <section className="tb-rounds" id="tb-rounds" aria-labelledby="tb-h-rounds">
          <div className="tb-rowhead">
            <h2 className="tb-h" id="tb-h-rounds">{t("yourTab")}</h2>
            <b className="tb-fig">{money(tab.totalFils)}</b>
          </div>
          <div role="status">{sent && <p className="tb-sent">{t("sent")}</p>}</div>
          <ol className="tb-roundlist">
            {tab.rounds.map((r, i) => (
              <li key={r.id} className={`tb-round s-${r.status}`}>
                <div className="tb-rowhead">
                  <span className="tb-roundno">{t("round", { n: i + 1 })}</span>
                  <span className="tb-status">{status(r)}</span>
                </div>
                {r.status !== "cancelled" && <div className={`tb-prog p-${r.status}`} aria-hidden="true"><i /><i /><i /></div>}
                <ul>
                  {r.lines.map((l, j) => <li key={j}><span className="tb-q">{l.qty}×</span> {name(l)}{l.note ? <small> · {l.note}</small> : null}</li>)}
                </ul>
              </li>
            ))}
          </ol>
          <a className="tb-card" href={`/join/${venueSlug}`}>
            <b>{t("cardOffer", { venue: venueName })}</b>
            <small>{t("cardOfferSub")}</small>
          </a>
        </section>
      )}

      {menu.length > 1 && (
        <nav className="tb-chips" aria-label={t("menu")}>
          {menu.map((c) => (
            <a key={c.id} href={`#c-${c.id}`} className={`tb-chip${section === c.id ? " on" : ""}`} aria-current={section === c.id ? "true" : undefined}>{name(c)}</a>
          ))}
        </nav>
      )}

      {menu.length === 0 && <p className="tb-empty">{t("noMenu")}</p>}

      {menu.map((c) => (
        <section key={c.id} id={`c-${c.id}`} className="tb-cat" aria-labelledby={`h-${c.id}`}>
          <h2 className="tb-cat-h" id={`h-${c.id}`}>{name(c)}</h2>
          <ul className="tb-items">
            {c.items.map((i) => {
              const n = qty[i.id] ?? 0;
              const note = (ar && i.noteAr) || i.noteEn;
              return (
                <li key={i.id} className={`tb-item${i.available ? "" : " off"}`}>
                  {i.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element -- venue photos live in the venue's own storage */
                    <img className="tb-photo" src={i.imageUrl} alt="" width={88} height={88} loading="lazy" decoding="async" />
                  )}
                  <div className="tb-item-main">
                    <b>{name(i)}</b>
                    {note && <small>{note}</small>}
                    <span className="tb-price">{i.available ? money(i.priceFils) : t("soldOut")}</span>
                  </div>
                  {i.available && (
                    <div className="tb-step">
                      {n > 0 && <button type="button" aria-label={t("less", { item: name(i) })} onClick={() => change(i.id, -1)}>−</button>}
                      {n > 0 && <span aria-live="polite">{n}</span>}
                      <button type="button" className="add" aria-label={t("more", { item: name(i) })} onClick={() => change(i.id, 1)}>+</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {poweredBy && <p className="foot">{poweredBy}</p>}
      {allItems.some((i) => i.imageUrl?.startsWith("/menu-photos/")) && <p className="foot"><a href="/menu-photos/CREDITS.txt">{t("photoCredits")}</a></p>}

      {!review && <div role="alert">{error && <p className="tb-error">{error}</p>}</div>}

      {count > 0 && (
        <div className="tb-bar">
          <div className="tb-bar-in">
            <div className="tb-bar-sum"><small>{t("items", { count })}</small><b>{money(total)}</b></div>
            <button type="button" className="btn primary" onClick={() => setReview(true)}>{t("review")}</button>
          </div>
        </div>
      )}

      <dialog ref={sheet} className="tb-sheet" aria-labelledby="tb-h-order" onClose={() => setReview(false)} onClick={(e) => { if (e.target === e.currentTarget) setReview(false); }}>
        <div className="tb-sheet-in">
          <div className="tb-grip" aria-hidden="true" />
          <h2 className="tb-h" id="tb-h-order">{t("yourOrder")}</h2>
          <ul className="tb-sum">
            {picked.map((i) => (
              <li key={i.id}>
                <div className="tb-step">
                  <button type="button" aria-label={t("less", { item: name(i) })} onClick={() => change(i.id, -1)}>−</button>
                  <span aria-live="polite">{qty[i.id]}</span>
                  <button type="button" className="add" aria-label={t("more", { item: name(i) })} onClick={() => change(i.id, 1)}>+</button>
                </div>
                <b>{name(i)}</b>
                <em>{money(i.priceFils * qty[i.id])}</em>
              </li>
            ))}
          </ul>
          <div className="tb-sum-total"><span>{t("total")}</span><b>{money(total)}</b></div>
          {review && <div role="alert">{error && <p className="tb-error" style={{ marginBlock: "0 12px" }}>{error}</p>}</div>}
          <button type="button" className="btn primary" disabled={busy} onClick={send}>{busy ? t("sending") : t("send", { count })}</button>
          <button type="button" className="tb-more" onClick={() => setReview(false)}>{t("addMore")}</button>
        </div>
      </dialog>
    </>
  );
}
