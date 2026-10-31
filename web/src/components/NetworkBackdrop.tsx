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
      const count = Math.max(26, Math.min(70, Math.round((w * h) / 16000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: 0.8 + Math.random() * 1.6,
      }));
    };

    const ribbon = (t: number, y0: number, amp: number, phase: number, lines: number, alpha: number) => {
      for (let i = 0; i < lines; i++) {
        const k = i / (lines - 1);
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 12) {
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
      ribbon(t, h * 0.22, h * 0.09, 0, 26, 0.16);
      ribbon(t, h * 0.82, h * 0.1, 2.4, 26, 0.14);
      const link = Math.min(170, Math.max(110, w / 6));
      for (const n of nodes) {
        if (!still) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.hypot(dx, dy);
          if (d < link) {
            ctx.strokeStyle = gold(0.34 * (1 - d / link));
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = gold(0.85);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!still && !document.hidden) raf = requestAnimationFrame(frame);
      else if (!still) raf = requestAnimationFrame(frame);
    };

    size();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { size(); if (still) frame(0); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className={`netbg${fixed ? " netbg-fixed" : ""}`} aria-hidden="true" />;
}
