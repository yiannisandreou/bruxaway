import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "patient" | "physician";

export type SessionState = {
  loading: boolean;
  user: User | null;
  role: AppRole | null;
};

async function loadRole(userId: string): Promise<AppRole | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (data?.role as AppRole | undefined) ?? null;
}

/** Ensures the signed-in user has a profile row and a role claim. */
export async function ensureAccount(user: User, role: AppRole, fullName?: string) {
  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? null,
    ...(fullName ? { full_name: fullName } : {}),
    updated_at: new Date().toISOString(),
  });
  const existing = await loadRole(user.id);
  if (!existing) {
    await supabase.from("user_roles").insert({ user_id: user.id, role });
  }
  return existing ?? role;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    user: null,
    role: null,
  });

  useEffect(() => {
    let alive = true;

    const handle = async (user: User | null) => {
      if (!user) {
        if (alive) setState({ loading: false, user: null, role: null });
        return;
      }
      const role = await loadRole(user.id);
      if (alive) setState({ loading: false, user, role });
    };

    void supabase.auth.getSession().then(({ data }) => handle(data.session?.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void handle(session?.user ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
