import { useEffect, useRef } from "react";

import { ensureAccount, useSession } from "@/lib/session";
import { migrateDeviceSubscriptionToAccount } from "@/lib/push";
import { syncNow } from "@/lib/sync";


const PENDING_ROLE_KEY = "unclench.pendingRole";

/**
 * Mounted once at the root: whenever a session appears, makes sure the account
 * has a profile + role row and merges this device's check-ins with the cloud.
 */
export function AccountSync() {
  const { user, loading } = useSession();
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user || done.current === user.id) return;
    done.current = user.id;
    void (async () => {
      // Self-service sign-up can only ever claim the patient role; clinician
      // accounts are provisioned server-side after verification.
      await ensureAccount(user, "patient").catch(() => undefined);
      window.localStorage.removeItem(PENDING_ROLE_KEY);
      await syncNow().catch(() => undefined);
    })();
  }, [loading, user]);

  return null;
}
