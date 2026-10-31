"use client";

import { useEffect, useRef } from "react";
import "./network.css";

type Node = { x: number; y: number; vx: number; vy: number; r: number };

/** Slow gold network of linked points with two drifting ribbons of fine lines. Draws in the venue's own gold; still when motion is reduced. */
export default function NetworkBackdrop({ fixed = false }: { fixed?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rgb = getComputedStyle(document.documentElement).getPropertyValue("--gold-rgb").trim() || "205 165 91";
    const gold = (a: number) => `rgb(${rgb} / ${a})`;
    let w = 0, h = 0, raf = 0, nodes: Node[] = [];

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.min(34, Math.round((w * h) / 30000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: 0.8 + Math.random() * 1.6,
      }));
    };

    const ribbon = (t: number, y0: number, amp: number, phase: number, lines: number, alpha: number) => {
      for (let i = 0; i < lines; i++) {
        const k = i / (lines - 1);
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 28) {
          const u = x / w;
          const y = y0 + Math.sin(u * 5 + t * 0.35 + phase) * amp * (0.35 + k * 0.65) + Math.sin(u * 2.2 - t * 0.2 + phase) * amp * 0.5 + (k - 0.5) * amp * 0.9 * Math.sin(u * 3 + t * 0.25);
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = gold(alpha * (0.4 + 0.6 * Math.sin(k * Math.PI)));
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };

    const frame = (ms: number) => {
      const t = ms / 1000;
      ctx.clearRect(0, 0, w, h);
      ribbon(t, h * 0.22, h * 0.09, 0, 9, 0.2);
      ribbon(t, h * 0.82, h * 0.1, 2.4, 9, 0.18);
      const link = Math.min(170, Math.max(110, w / 6));
      for (const n of nodes) {
        if (!still) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
        }
      }
      // One path for all links and one for all points: a draw call per line made this the slowest thing on the page.
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          if (dx * dx + dy * dy < link * link) { ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); }
        }
      }
      ctx.strokeStyle = gold(0.2);
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.beginPath();
      for (const n of nodes) { ctx.moveTo(n.x + n.r, n.y); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); }
      ctx.fillStyle = gold(0.8);
      ctx.fill();
    };

    // About 24 frames a second, and nothing at all while the tab is hidden.
    let prev = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || ms - prev < 42) return;
      prev = ms;
      frame(ms);
    };

    size();
    if (still) frame(0); else raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { size(); if (still) frame(0); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className={`netbg${fixed ? " netbg-fixed" : ""}`} aria-hidden="true" />;
}
