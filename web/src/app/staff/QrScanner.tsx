"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/** Back camera + jsQR. Calls onCode once with the decoded text, then stops the camera. */
export default function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [found, setFound] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    let lock = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      const v = video.current;
      if (done || !v || !ctx) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (hit?.data) {
          done = true;
          setFound(true);
          // a beat for the corners to lock before the guest sheet comes up
          lock = window.setTimeout(() => onCode(hit.data), 450);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError("The camera is not available. Type the 4-digit code instead."));

    return () => {
      done = true;
      clearTimeout(lock);
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className={`scan${found ? " scan-found" : ""}`}>
      {error ? <p className="err">{error}</p> : (
        <div className="scan-view">
          <video ref={video} playsInline muted />
          <div className="scan-frame" aria-hidden="true"><u /><u /><u /><u /><i className="scan-line" /></div>
          <p className="scan-hint" role="status">{found ? "Got it" : "Point at the guest’s card"}</p>
        </div>
      )}
      <button className="btn" type="button" onClick={onClose}>Stop camera</button>
    </div>
  );
}
