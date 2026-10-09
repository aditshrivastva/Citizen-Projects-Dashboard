import { getAdminContext } from "@/lib/admin-api";

const projectStatuses = [
  "planning",
  "active",
  "manufacturing",
  "in_transit",
  "payment_pending",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export async function POST(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const projectCode = typeof body.project_code === "string" ? body.project_code.trim() : "";
  const projectName = typeof body.project_name === "string" ? body.project_name.trim() : "";
  const status = typeof body.status === "string" ? body.status : "";
  const progress = Number(body.progress_percentage);
  if (!projectCode || !projectName || !projectStatuses.includes(status as (typeof projectStatuses)[number]) || !Number.isFinite(progress) || progress < 0 || progress > 100) {
    return Response.json({ error: "Enter a project code, project name, valid status, and progress between 0 and 100." }, { status: 400 });
  }

  const optionalText = (key: string) => {
    const value = body[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const fullName = context.user.user_metadata?.full_name ?? context.user.user_metadata?.name ?? context.user.email?.split("@")[0] ?? null;
  const { error: profileError } = await context.adminClient.from("profiles").upsert({
    id: context.user.id,
    full_name: typeof fullName === "string" ? fullName : null,
    company_name: typeof context.user.user_metadata?.company_name === "string" ? context.user.user_metadata.company_name : null,
    role: "ADMIN",
    is_active: true,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    return Response.json({ error: `Could not create the admin profile required for project ownership: ${profileError.message}`, code: profileError.code }, { status: 400 });
  }

  const { data, error } = await context.adminClient.from("projects").insert({
    project_code: projectCode,
    project_name: projectName,
    client_name: optionalText("client_name"),
    client_company: optionalText("client_company"),
    site_address: optionalText("site_address"),
    start_date: optionalText("start_date"),
    expected_end_date: optionalText("expected_end_date"),
    status,
    progress_percentage: progress,
    description: optionalText("description"),
    created_by: context.user.id,
  }).select("id").single();

  if (error) {
    return Response.json({ error: error.message, details: error.details, hint: error.hint, code: error.code }, { status: 400 });
  }
  return Response.json({ id: data.id }, { status: 201 });
}
