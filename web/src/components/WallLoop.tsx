"use client";

import { useEffect, useRef } from "react";

/**
 * The moving wall behind the guest's pages (glass finish): a short silent film of the venue's own background, played
 * in a loop over the still picture. The still is always there first; the film is fetched only when it will be shown
 * (a phone held upright, on a guest page), never for someone who asked for less motion or to save data, and it stops
 * while the page is in the background. If the phone will not play it (Low Power Mode), the still stays.
 */
export default function WallLoop({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const quiet = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (quiet || getComputedStyle(v).display === "none") return;
    v.muted = true;
    v.src = src;
    const on = () => v.classList.add("on");
    v.addEventListener("playing", on, { once: true });
    const play = () => void v.play().catch(() => {});
    const vis = () => (document.hidden ? v.pause() : play());
    document.addEventListener("visibilitychange", vis);
    play();
    return () => {
      document.removeEventListener("visibilitychange", vis);
      v.removeEventListener("playing", on);
      v.pause();
    };
  }, [src]);
  return <video ref={ref} className="wall-v" muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} disablePictureInPicture disableRemotePlayback />;
}
