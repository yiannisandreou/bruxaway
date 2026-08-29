import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import { savePushSubscription, removePushSubscription } from "@/lib/push.functions";

/** Registers the service worker that handles incoming push events. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Requests notification permission, subscribes this device to push, and stores
 * the subscription server-side so the cron can deliver random check-in prompts.
 * Returns true on success. Requires a signed-in account (subscription is saved
 * to the user's row).
 */
export async function enableNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof navigator === "undefined" || !("PushManager" in window)) {
    return { ok: false, reason: "This browser doesn't support push notifications." };
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Notification permission was not granted." };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "Couldn't register the background service worker." };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const keys = json.keys ?? {};
  try {
    await savePushSubscription({
      data: {
        endpoint: sub.endpoint,
        p256dh: keys["p256dh"] ?? "",
        auth_key: keys["auth"] ?? "",
      },
    });
  } catch {
    // If saving fails (e.g. not signed in), unsubscribe locally so state stays honest.
    await sub.unsubscribe();
    return { ok: false, reason: "Sign in to enable reminders." };
  }
  return { ok: true };
}

/** Unsubscribes this device from push and removes the server-side subscription. */
export async function disableNotifications(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try {
        await removePushSubscription({ data: { endpoint: sub.endpoint } });
      } catch {
        // ignore — still unsubscribe locally
      }
      await sub.unsubscribe();
    }
  } catch {
    // ignore
  }
}

/** True when this browser can actually do push + service workers. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
