import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LinkResult = {
  ok: boolean;
  error: string | null;
  patient: { id: string; email: string | null; name: string | null } | null;
};

export const linkPatientByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => ({
    email: String(input?.email ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data, context }): Promise<LinkResult> => {
    const fail = (error: string): LinkResult => ({ ok: false, error, patient: null });
    if (!data.email) return fail("Enter the patient's account email.");

    const { data: isPhysician } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "physician",
    });
    if (!isPhysician) return fail("Only clinician accounts can add patients.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", data.email)
      .maybeSingle();

    if (!profile) return fail("No Unclench account uses that email yet.");
    if (profile.id === context.userId) return fail("That is your own clinician account.");

    const { data: patientRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .eq("role", "patient")
      .maybeSingle();
    if (!patientRole) return fail("That account is not registered as a patient.");

    const { error } = await supabaseAdmin
      .from("care_links")
      .upsert(
        { physician_id: context.userId, patient_id: profile.id },
        { onConflict: "physician_id,patient_id" },
      );
    if (error) return fail(error.message);

    return {
      ok: true,
      error: null,
      patient: { id: profile.id, email: profile.email, name: profile.full_name },
    };
  });
