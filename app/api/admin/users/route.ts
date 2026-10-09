import { getAdminContext } from "@/lib/admin-api";

type Grant = {
  project_id: string;
  can_edit_measurements: boolean;
  can_edit_items: boolean;
  can_edit_transport: boolean;
  can_edit_labour: boolean;
  can_edit_billing: boolean;
  can_edit_payments: boolean;
};

type NotificationInsert = {
  recipient_id?: string;
  recipient_role?: "admin";
  project_id?: string;
  title: string;
  message: string;
  href: string;
};

type AdminContext = Extract<Awaited<ReturnType<typeof getAdminContext>>, { adminClient: unknown }>;

async function writeNotifications(adminClient: AdminContext["adminClient"], rows: NotificationInsert[]) {
  if (!rows.length) return;
  const { error } = await adminClient.from("app_notifications").insert(rows);
  if (error) console.error("Could not save admin activity notifications:", error.message);
}

function validGrants(value: unknown): value is Grant[] {
  return Array.isArray(value) && value.every(
    (grant) => grant && typeof grant.project_id === "string" &&
      typeof grant.can_edit_measurements === "boolean" &&
      typeof grant.can_edit_items === "boolean" &&
      typeof grant.can_edit_transport === "boolean" &&
      typeof grant.can_edit_labour === "boolean" &&
      typeof grant.can_edit_billing === "boolean" &&
      typeof grant.can_edit_payments === "boolean"
  ) && new Set(value.map((grant) => grant.project_id)).size === value.length;
}

export async function GET(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  const [{ data: userData, error: usersError }, { data: grants, error: grantsError }, { data: projects, error: projectsError }] = await Promise.all([
    context.adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    context.adminClient.from("site_access").select("user_id, project_id, can_edit_measurements, can_edit_items, can_edit_transport, can_edit_labour, can_edit_billing, can_edit_payments"),
    context.adminClient.from("projects").select("id, project_code, project_name").order("project_name"),
  ]);
  if (usersError || grantsError || projectsError) {
    return Response.json({ error: usersError?.message || grantsError?.message || projectsError?.message }, { status: 500 });
  }

  const users = userData.users
    .filter((user) => user.app_metadata?.role === "user")
    .map((user) => ({
      id: user.id,
      email: user.email ?? "",
      company_name: String(user.user_metadata?.company_name ?? ""),
      grants: (grants ?? []).filter((grant) => grant.user_id === user.id),
    }));
  return Response.json({ users, projects: projects ?? [], is_super_admin: context.isSuperAdmin });
}

export async function POST(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  let body: { email?: string; password?: string; company_name?: string; account_role?: "user" | "admin"; grants?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const companyName = body.company_name?.trim();
  const accountRole = body.account_role ?? "user";
  const grants = body.grants ?? [];
  if (!email || !body.password || body.password.length < 8 || !companyName || companyName.length > 120 || !["user", "admin"].includes(accountRole) || !validGrants(grants) || (accountRole === "user" && grants.length === 0)) {
    return Response.json({ error: "Enter a valid email, company name, password of at least 8 characters, and required site permissions." }, { status: 400 });
  }
  if (accountRole === "admin" && !context.isSuperAdmin) {
    return Response.json({ error: "Only a super admin can create admin accounts." }, { status: 403 });
  }

  const { data, error } = await context.adminClient.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    app_metadata: { role: accountRole, is_super_admin: false },
    user_metadata: { company_name: companyName },
  });
  if (error || !data.user) return Response.json({ error: error?.message || "Could not create user." }, { status: 400 });

  if (accountRole === "user") {
    const { error: grantError } = await context.adminClient.from("site_access").insert(
      grants.map((grant) => ({ user_id: data.user.id, can_edit: false, ...grant }))
    );
    if (grantError) {
      await context.adminClient.auth.admin.deleteUser(data.user.id);
      return Response.json({ error: grantError.message }, { status: 400 });
    }
  }
  const projectNames = new Map((await context.adminClient.from("projects").select("id, project_name")).data?.map((project) => [project.id, project.project_name]) ?? []);
  await writeNotifications(context.adminClient, [
    { recipient_role: "admin", title: "Account created", message: `${email} was added as ${accountRole === "admin" ? "an admin" : "a user"}.`, href: "/dashboard/users" },
    ...grants.map((grant) => ({
      recipient_id: data.user!.id,
      project_id: grant.project_id,
      title: "Project access granted",
      message: `You can now access ${projectNames.get(grant.project_id) ?? "a project site"}.`,
      href: `/dashboard/projects/${grant.project_id}`,
    })),
  ]);
  return Response.json({ id: data.user.id, email: data.user.email, role: accountRole }, { status: 201 });
}

export async function PUT(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  let body: { user_id?: string; grants?: unknown; company_name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const companyName = body.company_name?.trim();
  if (!body.user_id || !validGrants(body.grants) || !companyName || companyName.length > 120) {
    return Response.json({ error: "A user, valid company name, and valid site permissions are required." }, { status: 400 });
  }
  const { data: userResult, error: userError } = await context.adminClient.auth.admin.getUserById(body.user_id);
  if (userError || userResult.user?.app_metadata?.role !== "user") {
    return Response.json({ error: "User account not found." }, { status: 404 });
  }
  const { error: metadataError } = await context.adminClient.auth.admin.updateUserById(body.user_id, {
    user_metadata: { ...userResult.user.user_metadata, company_name: companyName },
  });
  if (metadataError) return Response.json({ error: metadataError.message }, { status: 400 });

  const { data: oldGrants, error: oldGrantsError } = await context.adminClient.from("site_access")
    .select("project_id, can_edit_measurements, can_edit_items, can_edit_transport, can_edit_labour, can_edit_billing, can_edit_payments")
    .eq("user_id", body.user_id);
  if (oldGrantsError) return Response.json({ error: oldGrantsError.message }, { status: 400 });
  const before = new Map((oldGrants ?? []).map((grant) => [grant.project_id, JSON.stringify(grant)]));
  const after = new Map(body.grants.map((grant) => [grant.project_id, JSON.stringify(grant)]));
  const changedProjectIds = [...new Set([...before.keys(), ...after.keys()])]
    .filter((projectId) => before.get(projectId) !== after.get(projectId));

  const { error: deleteError } = await context.adminClient.from("site_access").delete().eq("user_id", body.user_id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 });
  if (body.grants.length) {
    const { error: insertError } = await context.adminClient.from("site_access").insert(
      body.grants.map((grant) => ({ user_id: body.user_id, can_edit: false, ...grant }))
    );
    if (insertError) return Response.json({ error: insertError.message }, { status: 400 });
  }
  if (changedProjectIds.length) {
    const { data: projects } = await context.adminClient.from("projects").select("id, project_name").in("id", changedProjectIds);
    const projectNames = new Map((projects ?? []).map((project) => [project.id, project.project_name]));
    const email = userResult.user.email ?? "User";
    await writeNotifications(context.adminClient, [
      { recipient_role: "admin", title: "User access updated", message: `Site permissions were changed for ${email}.`, href: "/dashboard/users" },
      ...changedProjectIds.map((projectId) => ({
        recipient_id: body.user_id!,
        project_id: projectId,
        title: after.has(projectId) ? "Site permissions updated" : "Project access removed",
        message: after.has(projectId)
          ? `Your permissions for ${projectNames.get(projectId) ?? "a project site"} were updated by an administrator.`
          : `Your access to ${projectNames.get(projectId) ?? "a project site"} was removed by an administrator.`,
        href: after.has(projectId) ? `/dashboard/projects/${projectId}` : "/dashboard",
      })),
    ]);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  let body: { user_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.user_id) return Response.json({ error: "A user is required." }, { status: 400 });

  const { data: userResult, error: userError } = await context.adminClient.auth.admin.getUserById(body.user_id);
  if (userError || userResult.user?.app_metadata?.role !== "user") {
    return Response.json({ error: "User account not found." }, { status: 404 });
  }

  const email = userResult.user.email ?? "User";
  const { error: deleteError } = await context.adminClient.auth.admin.deleteUser(body.user_id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 });

  await writeNotifications(context.adminClient, [
    { recipient_role: "admin", title: "User account deleted", message: `${email} was removed by an administrator.`, href: "/dashboard/users" },
  ]);
  return Response.json({ ok: true });
}
