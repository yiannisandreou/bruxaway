import { useEffect, useRef } from "react";

const PENDING_ROLE_KEY = "unclench.pendingRole";

import { ensureAccount, useSession, type AppRole } from "@/lib/session";
import { syncNow } from "@/lib/sync";

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
      const pending = window.localStorage.getItem(PENDING_ROLE_KEY) as AppRole | null;
      const metaRole = (user.user_metadata as { role?: AppRole } | null)?.role;
      await ensureAccount(user, pending ?? metaRole ?? "patient").catch(() => undefined);
      window.localStorage.removeItem(PENDING_ROLE_KEY);
      await syncNow().catch(() => undefined);
    })();
  }, [loading, user]);

  return null;
}
