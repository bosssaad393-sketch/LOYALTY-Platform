"use client";

import { useEffect, useRef, useState } from "react";

export type MenuDish = { id: string; name: string; note: string | null; price: string; photo: string | null; thumb: string | null; off: boolean };
export type MenuSection = { id: string; name: string; dishes: MenuDish[] };
type Labels = { sections: string; soldOut: string; close: string; empty: string };

/**
 * The menu of a visit venue, read only. A row of section names stays under the thumb and follows the page; each
 * section is one sheet of dishes: name, a short description, price, and the venue's own picture. Tapping a dish with
 * a picture or a long description opens it large. Works without scripts as a plain list (the links still jump).
 */
export default function VisitMenuView({ sections, labels }: { sections: MenuSection[]; labels: Labels }) {
  const [open, setOpen] = useState<MenuDish | null>(null);
  const [at, setAt] = useState(sections[0]?.id ?? "");
  const dlg = useRef<HTMLDialogElement>(null);
  const chips = useRef<HTMLElement>(null);

  // Which section is on screen: the chip for it is marked and kept in view.
  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setAt(top.target.id.slice(2));
      },
      { rootMargin: "-90px 0px -60% 0px" },
    );
    document.querySelectorAll(".mn-sec").forEach((s) => seen.observe(s));
    return () => seen.disconnect();
  }, [sections]);
  useEffect(() => {
    const el = chips.current?.querySelector<HTMLElement>(`[data-id="${at}"]`);
    const bar = chips.current;
    if (el && bar) bar.scrollTo({ left: el.offsetLeft - bar.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [at]);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (sections.length === 0) return <p className="mn-empty">{labels.empty}</p>;
  const rich = (d: MenuDish) => Boolean(d.photo) || (d.note?.length ?? 0) > 70;

  return (
    <>
      {sections.length > 1 && (
        <nav className="mn-chips" aria-label={labels.sections} ref={chips}>
          {sections.map((s) => (
            <a key={s.id} data-id={s.id} className={`mn-chip${s.id === at ? " on" : ""}`} href={`#m-${s.id}`} aria-current={s.id === at ? "true" : undefined}>{s.name}</a>
          ))}
        </nav>
      )}
      {sections.map((s) => (
        <section key={s.id} className="mn-sec" id={`m-${s.id}`} aria-labelledby={`mh-${s.id}`}>
          <h2 className="mn-h" id={`mh-${s.id}`}>{s.name}</h2>
          <ul className="mn-list">
            {s.dishes.map((d) => {
              const body = (
                <>
                  <span className="mn-tx">
                    <b>{d.name}</b>
                    {d.note && <small>{d.note}</small>}
                    <span className="mn-price">{d.off ? labels.soldOut : d.price}</span>
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the venue's own dish picture, a small local file */}
                  {d.thumb && <img className="mn-ph" src={d.thumb} alt="" width={96} height={72} loading="lazy" decoding="async" />}
                </>
              );
              return (
                <li key={d.id} className={`mn-row${d.off ? " off" : ""}`}>
                  {rich(d) ? <button type="button" className="mn-hit" onClick={() => setOpen(d)} aria-haspopup="dialog">{body}</button> : <div className="mn-hit">{body}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- a tap on the dimmed backdrop closes the dish, as Escape does */}
      <dialog ref={dlg} className="mn-dlg" aria-labelledby="mn-dlg-t" onClose={() => setOpen(null)} onClick={(e) => { if (e.target === dlg.current) setOpen(null); }}>
        {open && (
          <div className="mn-dlg-in">
            {/* eslint-disable-next-line @next/next/no-img-element -- the venue's own dish picture, a local file */}
            {open.photo && <img className="mn-dlg-ph" src={open.photo} alt="" width={640} height={480} />}
            <div className="mn-dlg-tx">
              <h3 id="mn-dlg-t">{open.name}</h3>
              {open.note && <p>{open.note}</p>}
              <p className="mn-price">{open.off ? labels.soldOut : open.price}</p>
            </div>
            <button type="button" className="btn mn-dlg-x" onClick={() => setOpen(null)}>{labels.close}</button>
          </div>
        )}
      </dialog>
    </>
  );
}
