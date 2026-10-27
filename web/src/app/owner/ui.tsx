"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { n } from "./format";
import type { Call, Note, Res } from "./types";

/** Eyebrow, page title and one line of explanation. The title takes focus when the section changes. */
export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="ow-head">
      <div className="ow-eyebrow">{eyebrow}</div>
      <h1 className="ow-title" id="ow-title" tabIndex={-1}>{title}</h1>
      {children && <p className="ow-sub">{children}</p>}
    </header>
  );
}

/** Result of an action. The wrapper stays in the page so screen readers announce what appears inside it. */
export function Msg({ note }: { note: Note | null }) {
  return (
    <div role={note?.kind === "bad" ? "alert" : "status"} className="ow-live">
      {note && <p className={`ow-msg ${note.kind}`}>{note.text}</p>}
    </div>
  );
}

export function Loading() {
  return <p className="ow-note" role="status">Loading…</p>;
}

export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="ow-panel" role="alert">
      <p className="ow-msg bad">{text}</p>
      <div className="ow-actions"><button type="button" className="ow-btn" onClick={onRetry}>Try again</button></div>
    </div>
  );
}

/** Loads one endpoint when the section opens. `loader` must be stable (wrap it in useCallback). */
export function useLoad<T>(loader: () => Promise<Res<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    loader().then((r) => {
      if (!live) return;
      if (r.ok) { setData(r.data); setError(null); }
      else if (r.status !== 401) setError(r.error);
    });
    return () => { live = false; };
  }, [loader, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, error, reload };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The loader most sections use: GET one path through `call`. */
export function useGet<T>(call: Call, path: string) {
  const loader = useCallback(() => call<T>(path), [call, path]);
  return useLoad<T>(loader);
}

/** Small line icons, drawn with the text colour. */
export function Arrow() {
  return (
    <svg className="ow-ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 8h11M9.5 4l4 4-4 4" /></svg>
  );
}

export function Cross() {
  return (
    <svg className="ow-ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
  );
}

const noMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Figures that have already counted up in this page load. They show their value straight away from then on.
const counted = new Set<string>();

/**
 * A figure that counts up from zero once, the first time it is shown after the page loads (not for reduced motion).
 * Screen readers get the final value only: the moving digits are hidden from them.
 */
export function Count({ id, value, format = n }: { id: string; value: number; format?: (x: number) => string }) {
  const [moving, setMoving] = useState<number | null>(() => (counted.has(id) || noMotion() ? null : 0));
  useEffect(() => {
    if (counted.has(id) || noMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const ms = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setMoving(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
      else { counted.add(id); setMoving(null); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, value]);
  if (moving === null) return <>{format(value)}</>;
  return (
    <>
      <span className="ow-sr">{format(value)}</span>
      <span aria-hidden="true">{format(moving)}</span>
    </>
  );
}

export function Stepper({ label, value, step, min, max, disabled, onChange }: { label: string; value: number; step: number; min: number; max: number; disabled?: boolean; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="ow-field" role="group" aria-labelledby={id}>
      <span className="ow-lbl" id={id}>{label}</span>
      <div className="ow-step">
        <button type="button" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={`Less: ${label}`}>−</button>
        <output aria-label={label}>{n(value)}</output>
        <button type="button" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`More: ${label}`}>+</button>
      </div>
    </div>
  );
}

/**
 * A larger native modal dialog for a task of its own (the points summary, the reward). Bottom sheet on a phone, centred on a laptop.
 * Focus stays inside, Esc and the dark area close it, and focus returns to what opened it. Mount it only while it is open.
 */
export function Sheet({ eyebrow, title, children, onClose }: { eyebrow: string; title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!opener.current) opener.current = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    return () => { opener.current?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className="ow-dialog ow-sheet" aria-labelledby={id} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="ow-box ow-sheet-box">
        <header className="ow-sheet-head">
          <div>
            <div className="ow-eyebrow">{eyebrow}</div>
            <h2 className="ow-sheet-title" id={id}>{title}</h2>
          </div>
          <button type="button" className="ow-x" aria-label="Close" onClick={onClose}><Cross /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

/**
 * A confirmation step on a native modal dialog: focus stays inside, Esc and the dark area cancel.
 * Mount it only while it is open. The safer button ("Keep") has the focus.
 */
export function Confirm({ title, children, confirmLabel, cancelLabel = "Keep", danger, busy, onConfirm, onClose }: { title: string; children: React.ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // Remember who opened it once. React may run this effect twice in development.
    if (!opener.current) opener.current = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-first]")?.focus();
    return () => { opener.current?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className="ow-dialog" aria-labelledby={id} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="ow-box ow-dialog-box">
        <h2 className="ow-dialog-title" id={id}>{title}</h2>
        {children}
        <div className="ow-actions">
          <button type="button" className={`ow-btn ${danger ? "danger" : "primary"}`} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="ow-btn" data-first onClick={onClose}>{cancelLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
