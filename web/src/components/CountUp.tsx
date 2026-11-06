"use client";

import { useEffect, useRef } from "react";

/** A number that counts up once when it appears. The real figure is in the HTML, so it reads correctly with no script or with reduced motion. */
export default function CountUp({ value, ms = 800 }: { value: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      el.textContent = String(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(value);
    };
  }, [value, ms]);
  return <span ref={ref}>{value}</span>;
}
