import type { PointerEvent } from "react";

/** For a ".spot" card: moves its light to the pointer. Attach as onPointerMove. */
export function spotMove(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}
