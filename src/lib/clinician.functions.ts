import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RequestResult = {
  ok: boolean;
  error: string | null;
};

type ClinicianSignupResult = {
  ok: boolean;
  bootstrapped: boolean; // true = caller is now the first physician
  error: string | null;
};

const fail = (error: string): RequestResult => ({ ok: false, error });

/**
 * Called when someone signs up with clinician intent. If no physician exists
 * yet in the whole system, this caller becomes the first physician (bootstrap).
 * Otherwise a pending request is recorded for an existing clinician to approve.
 */
export const requestOrBootstrapClinician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName?: string | undefined }) => ({
    fullName: input?.fullName,
  }))
  .handler(async ({ data, context }): Promise<ClinicianSignupResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Are there any physicians at all?
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "physician");

    if (!count) {
      // Bootstrap: promote this caller to physician.
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: context.userId, role: "physician" },
          { onConflict: "user_id,role" },
        );
      if (roleError) return { ok: false, bootstrapped: false, error: roleError.message };
      return { ok: true, bootstrapped: true, error: null };
    }

    // Otherwise record a pending request (idempotent on user_id).
    const { data: user } = await context.supabase.auth.getUser();
    const email = user?.user?.email ?? null;
    const fullName = data.fullName ?? (user?.user?.user_metadata?.["full_name"] as string | undefined) ?? null;

    const { error } = await supabaseAdmin.from("role_requests").upsert(
      {
        user_id: context.userId,
        email,
        full_name: fullName,
        status: "pending",
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, bootstrapped: false, error: error.message };

    return { ok: true, bootstrapped: false, error: null };
  });

/** Approve a pending clinician request. Caller must be a physician. */
export const approveClinician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => ({
    requestId: String(input?.requestId ?? "").trim(),
  }))
  .handler(async ({ data, context }): Promise<RequestResult> => {
    if (!data.requestId) return fail("Missing request.");

    const { data: isPhysician } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "physician",
    });
    if (!isPhysician) return fail("Only clinicians can approve requests.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: request } = await supabaseAdmin
      .from("role_requests")
      .select("id, user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();

    if (!request) return fail("Request not found.");
    if (request.status !== "pending") return fail("That request is no longer pending.");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: request.user_id, role: "physician" },
        { onConflict: "user_id,role" },
      );
    if (roleError) return fail(roleError.message);

    const { error: updateError } = await supabaseAdmin
      .from("role_requests")
      .update({ status: "approved", reviewer_id: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", request.id);
    if (updateError) return fail(updateError.message);

    return { ok: true, error: null };
  });

/** Reject a pending clinician request. Caller must be a physician. */
export const rejectClinician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => ({
    requestId: String(input?.requestId ?? "").trim(),
  }))
  .handler(async ({ data, context }): Promise<RequestResult> => {
    if (!data.requestId) return fail("Missing request.");

    const { data: isPhysician } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "physician",
    });
    if (!isPhysician) return fail("Only clinicians can reject requests.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: request } = await supabaseAdmin
      .from("role_requests")
      .select("id, status")
      .eq("id", data.requestId)
      .maybeSingle();

    if (!request) return fail("Request not found.");
    if (request.status !== "pending") return fail("That request is no longer pending.");

    const { error } = await supabaseAdmin
      .from("role_requests")
      .update({ status: "rejected", reviewer_id: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", request.id);
    if (error) return fail(error.message);

    return { ok: true, error: null };
  });
