// Staff alerts. The push carries no text: it wakes this worker, which asks the server what is waiting (with the
// device's own sign-in) and shows it. A device that is no longer signed in shows a plain line instead.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let alert = { title: "Staff", body: "Something needs you. Open the table board.", url: "/staff/board" };
    try {
      const res = await fetch("/api/staff/alerts", { credentials: "include", cache: "no-store" });
      if (res.ok) alert = await res.json();
    } catch (e) { /* offline: the plain line */ }
    await self.registration.showNotification(alert.title, { body: alert.body, tag: "staff-alert", renotify: true, data: { url: alert.url }, icon: "/staff-icon-192.png", badge: "/staff-icon-192.png" });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/staff/board";
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) { if (new URL(c.url).pathname === url && "focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
