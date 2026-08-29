import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RequestResult = {
  ok: boolean;
  error: string | null;
};

const fail = (error: string): RequestResult => ({ ok: false, error });

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

    // Grant the physician role (bypass RLS with admin client).
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

/** Lists pending clinician requests. Caller must be a physician. */
export const listPendingClinicianRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isPhysician } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "physician",
    });
    if (!isPhysician) return { requests: [] as Array<{ id: string; email: string | null; full_name: string | null; created_at: string }> };

    const { data } = await context.supabase
      .from("role_requests")
      .select("id, email, full_name, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    return { requests: data ?? [] };
  });
