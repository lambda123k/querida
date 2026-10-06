// Querida — service worker : reçoit les notifications
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "Querida", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Querida", {
    body: d.body || "", icon: "querida-icon-180.png", badge: "querida-icon-180.png", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all.length) { all[0].focus(); return; }
    return self.clients.openWindow(e.notification.data.url || "./");
  })());
});
