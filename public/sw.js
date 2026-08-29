// Service worker for Unclench push notifications.
// Registered from the app at scope "/".

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Time for a jaw check-in";
  const url = data.url || "/?checkin=1";
  const options = {
    body: data.body || "Quick check-in: what's your jaw doing right now?",
    icon: data.icon || "/icon-512.png",
    badge: data.badge || "/icon-512.png",
    data: { url },
    actions: [
      { action: "log", title: "Log now" },
      { action: "later", title: "Later" },
    ],
    tag: "unclench-prompt",
    renotify: true,
    vibrate: [60, 40, 60],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/?checkin=1";
  if (event.action === "later") return;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.startsWith(self.registration.scope)) {
          try {
            await client.focus();
            await client.navigate(url);
            return;
          } catch {
            // fall through to openWindow
          }
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
