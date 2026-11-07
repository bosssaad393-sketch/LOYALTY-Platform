"use client";

import { useMemo } from "react";
import { QR_QUIET, qrShape } from "@/lib/qr";

/**
 * A scannable QR code on a white plate, for screens (owner tables, guest cards, team invites).
 * Black on white whatever the theme, because phone cameras read that best.
 */
export default function QrSvg({ text, label, size = 200 }: { text: string; label: string; size?: number }) {
  const qr = useMemo(() => qrShape(text), [text]);
  const box = qr.size + QR_QUIET * 2;
  return (
    <svg className="qr-svg" role="img" aria-label={label} width={size} height={size} viewBox={`${-QR_QUIET} ${-QR_QUIET} ${box} ${box}`}>
      <rect x={-QR_QUIET} y={-QR_QUIET} width={box} height={box} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  );
}
