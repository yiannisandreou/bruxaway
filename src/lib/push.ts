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
 * Returns the existing subscription only if it was created with the current
 * VAPID public key. A subscription made with an older key gets rejected by the
 * push service (HTTP 400) on every send, so it's unsubscribed and a fresh one
 * is created instead. Returns null when there is no usable subscription.
 */
async function usableSubscription(
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const key = sub.options?.applicationServerKey;
  if (!key) return sub; // can't verify on this browser — assume it's current
  const expected = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const actual = new Uint8Array(key);
  const matches =
    actual.length === expected.length && actual.every((b, i) => b === expected[i]);
  if (matches) return sub;
  await sub.unsubscribe().catch(() => undefined);
  return null;
}

/** Stores a subscription server-side (account row when signed in, else device row). */
async function storeSubscription(sub: PushSubscription): Promise<void> {
  const keys = sub.toJSON().keys ?? {};
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

  let sub = await usableSubscription(reg);
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  try {
    await storeSubscription(sub);
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


/**
 * Fires one reminder to this device right now, so closed-app delivery can be
 * verified without waiting for the next random prompt.
 */
export async function sendTestReminder(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "This browser can't receive reminders." };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: false, reason: "Turn reminders on first." };
  const { sendTestPush } = await import("@/lib/push-test.functions");

  const send = async (endpoint: string) => {
    try {
      return await sendTestPush({ data: { endpoint } });
    } catch {
      return { ok: false as const, reason: "Couldn't send the test reminder." };
    }
  };

  let sub = await usableSubscription(reg);
  if (sub) {
    const res = await send(sub.endpoint);
    if (res.ok) return res;
    // A rejected send means the subscription or its server-side row is stale —
    // drop it and resubscribe once, then retry.
    if (res.reason === "Turn reminders on first.") return res;
    await Promise.all([
      removeDevicePushSubscription({
        data: { device_id: deviceId(), endpoint: sub.endpoint },
      }).catch(() => undefined),
      removePushSubscription({ data: { endpoint: sub.endpoint } }).catch(() => undefined),
    ]);
    await sub.unsubscribe().catch(() => undefined);
  }

  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await storeSubscription(sub);
  } catch {
    return { ok: false, reason: "Couldn't refresh the reminder subscription." };
  }
  return send(sub.endpoint);
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

/**
 * After signing in, moves this device's account-free subscription onto the
 * account so prompts follow the user's profile settings instead.
 */
export async function migrateDeviceSubscriptionToAccount(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const keys = sub.toJSON().keys ?? {};
    await savePushSubscription({
      data: {
        endpoint: sub.endpoint,
        p256dh: keys["p256dh"] ?? "",
        auth_key: keys["auth"] ?? "",
      },
    });
    await removeDevicePushSubscription({
      data: { device_id: deviceId(), endpoint: sub.endpoint },
    });
  } catch {
    // ignore — reminders keep working from whichever row still exists
  }
}
