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
    // Unique tag per notification so a new reminder never silently replaces a
    // pending one.
    tag: `unclench-prompt-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
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

// The browser can rotate this device's push subscription at any time. When that
// happens the stored record points at a dead endpoint and reminders silently
// stop, so resubscribe and hand the new keys to the server right away.
const VAPID_PUBLIC_KEY =
  "BEwmNe1qXYlL1kWEePXR-wVRsAx6Y6JcHWUKpJ7I9obdGUOyqloHeTvQoOuO3yQnf5nUThv881Wcb5syVYBMGXE";

function vapidKeyBytes(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint =
        (event.oldSubscription && event.oldSubscription.endpoint) ||
        (event.notification && undefined);
      try {
        const sub =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY),
          }));
        const keys = sub.toJSON().keys || {};
        await fetch("/api/public/push/renew", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            old_endpoint: oldEndpoint || sub.endpoint,
            endpoint: sub.endpoint,
            p256dh: keys.p256dh || "",
            auth_key: keys.auth || "",
          }),
        });
      } catch {
        // The app re-registers on next open.
      }
    })(),
  );
});
