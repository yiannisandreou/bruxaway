/** Server-only web push delivery helper (shared by the cron tick and test sends). */

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export type PushDeliveryResult = {
  status: number;
  detail: string | null;
};

export async function sendPush(
  target: PushTarget,
  privateKey: string,
  origin: string,
  body = "What's your jaw doing right now?",
): Promise<PushDeliveryResult> {
  const { sendPushNotification } = await import("web-push-browser");
  const privateJwk = JSON.parse(privateKey) as JsonWebKey;
  const publicJwk: JsonWebKey = {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y,
  };
  const [publicCryptoKey, privateCryptoKey] = await Promise.all([
    crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    ),
    crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    ),
  ]);
  const response = await sendPushNotification(
    { publicKey: publicCryptoKey, privateKey: privateCryptoKey },
    {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth_key },
    },
    "hello@unclench.app",
    JSON.stringify({
      title: "Jaw check-in",
      body,
      url: `${origin}/?checkin=1`,
      icon: `${origin}/icon-512.png`,
    }),
    {
      // Apple Web Push requires the final RFC 8291 payload format.
      algorithm: "aes128gcm",
      ttl: 600,
      urgency: "high",
    },
  );
  const detail = response.ok ? null : (await response.text()).slice(0, 200) || null;
  return { status: response.status, detail };
}
