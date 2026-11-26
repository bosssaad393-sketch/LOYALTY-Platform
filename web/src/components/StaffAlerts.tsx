"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/uiLang";

type State = "checking" | "unsupported" | "unavailable" | "off" | "on" | "blocked";

const toBytes = (b64u: string) => Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Where this device stands: can it take alerts at all, and has it asked for them? */
async function currentState(): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/staff-sw.js").catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  const res = await fetch(`/api/staff/push${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ""}`).catch(() => null);
  const data = res?.ok ? ((await res.json()) as { available: boolean; on?: boolean }) : null;
  return !data?.available ? "unavailable" : data.on ? "on" : "off";
}

/**
 * Alerts on this phone (and the watch paired with it): a guest calling the waiter, a new order, a table request.
 * One tap switches them on for this device. On an iPhone the staff page has to be on the Home Screen first: that is
 * Apple's rule for web alerts, and the note says so.
 */
export default function StaffAlerts() {
  const t = useT();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void currentState().then((next) => { if (live) setState(next); });
    return () => { live = false; };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const res = await fetch("/api/staff/push");
      const data = (await res.json()) as { available: boolean; publicKey?: string };
      if (!data.available || !data.publicKey) { setState("unavailable"); return; }
      if ((await Notification.requestPermission()) !== "granted") { setState(Notification.permission === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/staff-sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(data.publicKey) }));
      const saved = await fetch("/api/staff/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(saved.ok ? "on" : "off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/staff-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/staff/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking" || state === "unavailable") return null;
  return (
    <div className="sa" role="group" aria-label={t("Alerts on this phone")}>
      {state === "on" ? (
        <>
          <span className="sa-on">{t("Alerts are on for this phone and the watch paired with it.")}</span>
          <button type="button" className="chip" onClick={turnOff} disabled={busy}>{t("Switch alerts off")}</button>
        </>
      ) : state === "off" ? (
        <>
          <span>{t("Get a buzz when a guest calls, orders or asks for a table.")}</span>
          <button type="button" className="chip" onClick={turnOn} disabled={busy}>{t("Switch alerts on")}</button>
        </>
      ) : state === "blocked" ? (
        <span>{t("Alerts are blocked for this page in the phone's settings. Allow notifications there, then come back.")}</span>
      ) : (
        <span>{t("For alerts on an iPhone: tap Share, then Add to Home Screen, and open this page from there. On other phones use Chrome.")}</span>
      )}
    </div>
  );
}
