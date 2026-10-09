import { createClient } from "@supabase/supabase-js";

export async function getAdminContext(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missingVariables = [
    ["NEXT_PUBLIC_SUPABASE_URL", url],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missingVariables.length) {
    return {
      error: Response.json(
        { error: `Missing environment variable${missingVariables.length > 1 ? "s" : ""}: ${missingVariables.join(", ")}. Add ${missingVariables.join(", ")} to .env.local and restart the dev server.` },
        { status: 500 }
      ),
    };
  }

  // The presence check above returns for any missing value.
  const configuredUrl = url as string;
  const configuredPublishableKey = publishableKey as string;
  const configuredServiceRoleKey = serviceRoleKey as string;

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: Response.json({ error: "Sign in is required." }, { status: 401 }) };

  const authClient = createClient(configuredUrl, configuredPublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { error: Response.json({ error: "Your session is invalid. Sign in again." }, { status: 401 }) };
  }
  if (data.user.app_metadata?.role !== "admin") {
    return { error: Response.json({ error: "Administrator access is required." }, { status: 403 }) };
  }

  const adminClient = createClient(configuredUrl, configuredServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { adminClient, user: data.user, isSuperAdmin: data.user.app_metadata?.is_super_admin === true };
}
