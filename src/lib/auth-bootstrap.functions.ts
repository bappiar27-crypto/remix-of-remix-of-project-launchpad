import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ProfileUpsert = {
  id: string;
  email: string;
  full_name: string;
  updated_at: string;
};

type AdminRoleUpsert = {
  user_id: string;
  role: "admin";
};

export const ensureBootstrapAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authUser, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (userError) throw new Error(userError.message);

    const user = authUser.user;
    const email = user?.email ?? "";
    const fullName =
      (user?.user_metadata?.full_name as string | undefined) || email || "Admin";
    const profile: ProfileUpsert = {
      id: context.userId,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin.from("profiles").upsert(profile, { onConflict: "id" });

    const { data: ownRoles, error: ownRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("id,role")
      .eq("user_id", context.userId);
    if (ownRoleError) throw new Error(ownRoleError.message);

    if (ownRoles?.some((role) => role.role === "admin")) {
      return { isAdmin: true, bootstrapped: false };
    }

    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw new Error(countError.message);

    if ((count ?? 0) === 0) {
      const adminRole: AdminRoleUpsert = { user_id: context.userId, role: "admin" };
      const { error: insertError } = await supabaseAdmin
        .from("user_roles")
        .upsert(adminRole, { onConflict: "user_id,role" });
      if (insertError) throw new Error(insertError.message);
      return { isAdmin: true, bootstrapped: true };
    }

    return { isAdmin: false, bootstrapped: false };
  });