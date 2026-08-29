import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { ensureAccount, useSession } from "@/lib/session";
import { migrateDeviceSubscriptionToAccount } from "@/lib/push";
import { requestOrBootstrapClinician } from "@/lib/clinician.functions";
import { supabase } from "@/integrations/supabase/client";
import { syncNow } from "@/lib/sync";


const PENDING_ROLE_KEY = "unclench.pendingRole";
export const CLINICIAN_INTENT_KEY = "unclench.clinicianIntent";

/**
 * Mounted once at the root: whenever a session appears, makes sure the account
 * has a profile + role row, resolves any pending clinician intent, and merges
 * this device's check-ins with the cloud.
 */
export function AccountSync() {
  const { user, role, loading } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user || done.current === user.id) return;
    done.current = user.id;
    void (async () => {
      // Self-service sign-up can only ever claim the patient role; clinician
      // accounts are provisioned server-side after verification.
      await ensureAccount(user, "patient").catch(() => undefined);
      window.localStorage.removeItem(PENDING_ROLE_KEY);

      // Clinician intent survives email confirmation and later sign-ins, so
      // resolve it on every session start rather than only right after signup.
      const wantsClinician = window.localStorage.getItem(CLINICIAN_INTENT_KEY) === "1";
      if (wantsClinician) {
        if (role === "physician") {
          window.localStorage.removeItem(CLINICIAN_INTENT_KEY);
        } else {
          const result = await requestOrBootstrapClinician({
            data: {
              fullName:
                (user.user_metadata?.["full_name"] as string | undefined) ?? undefined,
            },
          }).catch(() => null);
          if (result?.ok) {
            window.localStorage.removeItem(CLINICIAN_INTENT_KEY);
            if (result.bootstrapped) {
              // Force a session re-read so the physician role is picked up.
              await supabase.auth.refreshSession().catch(() => undefined);
              await queryClient.invalidateQueries();
              router.invalidate();
            }
          }
        }
      }

      await migrateDeviceSubscriptionToAccount().catch(() => undefined);
      await syncNow().catch(() => undefined);
    })();
  }, [loading, user, role, router, queryClient]);

  return null;
}
