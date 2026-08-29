import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import { deviceId, localTimezone, readSettings } from "@/lib/ema";
import { supabase } from "@/integrations/supabase/client";
import {
  savePushSubscription,
  removePushSubscription,
  saveDevicePushSubscription,
  removeDevicePushSubscription,
} from "@/lib/push.functions";

async function signedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

function devicePayload(sub: PushSubscription) {
  const keys = sub.toJSON().keys ?? {};
  const s = readSettings();
  return {
    device_id: deviceId(),
    endpoint: sub.endpoint,
    p256dh: keys["p256dh"] ?? "",
    auth_key: keys["auth"] ?? "",
    prompts_per_day: s.promptsPerDay,
    start_hour: s.startHour,
    end_hour: s.endHour,
    timezone: localTimezone(),
  };
}

/** Pushes changed prompt settings to this device's account-free subscription. */
export async function syncDeviceSubscriptionSettings(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await saveDevicePushSubscription({ data: devicePayload(sub) });
}


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
 * No account required: signed-out devices are stored against a local device id.
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

  const keys = sub.toJSON().keys ?? {};
  try {
    if (await signedIn()) {
      await savePushSubscription({
        data: {
          endpoint: sub.endpoint,
          p256dh: keys["p256dh"] ?? "",
          auth_key: keys["auth"] ?? "",
        },
      });
    } else {
      await saveDevicePushSubscription({ data: devicePayload(sub) });
    }
  } catch {
    // Keep local state honest if the subscription couldn't be stored.
    await sub.unsubscribe();
    return { ok: false, reason: "Couldn't save reminders. Check your connection and try again." };
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
      // Remove from both stores — the device may have signed in since enabling.
      await removeDevicePushSubscription({
        data: { device_id: deviceId(), endpoint: sub.endpoint },
      }).catch(() => undefined);
      await removePushSubscription({ data: { endpoint: sub.endpoint } }).catch(() => undefined);
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
