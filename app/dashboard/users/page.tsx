"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = { id: string; project_code: string; project_name: string };
type Grant = {
  project_id: string;
  can_edit_measurements: boolean;
  can_edit_items: boolean;
  can_edit_transport: boolean;
  can_edit_labour: boolean;
  can_edit_billing: boolean;
  can_edit_payments: boolean;
};
type ManagedUser = { id: string; email: string; company_name: string; grants: Grant[] };

const emptyGrant = (project_id: string): Grant => ({
  project_id,
  can_edit_measurements: false,
  can_edit_items: false,
  can_edit_transport: false,
  can_edit_labour: false,
  can_edit_billing: false,
  can_edit_payments: false,
});

export default function UsersPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [newGrants, setNewGrants] = useState<Record<string, Grant>>({});
  const [drafts, setDrafts] = useState<Record<string, Grant[]>>({});
  const [companyDrafts, setCompanyDrafts] = useState<Record<string, string>>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [accountRole, setAccountRole] = useState<"user" | "admin">("user");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const adminRequest = useCallback(async (method = "GET", body?: unknown) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in again.");
    const response = await fetch("/api/admin/users", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Admin request failed.");
    return result;
  }, []);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const result = await adminRequest();
      setUsers(result.users);
      setProjects(result.projects);
      setIsSuperAdmin(result.is_super_admin === true);
      setDrafts(Object.fromEntries(result.users.map((user: ManagedUser) => [user.id, user.grants])));
      setCompanyDrafts(Object.fromEntries(result.users.map((user: ManagedUser) => [user.id, user.company_name])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [adminRequest]);

  useEffect(() => {
    // Fetch the admin-managed account list when the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const grants = Object.values(newGrants);
    if (accountRole === "user" && !grants.length) {
      setError("Choose at least one site and set its access level.");
      return;
    }
    setSaving(true);
    try {
      await adminRequest("POST", { email, password, company_name: companyName, account_role: accountRole, grants: accountRole === "user" ? grants : [] });
      setEmail("");
      setCompanyName("");
      setPassword("");
      setNewGrants({});
      setAccountRole("user");
      setMessage(accountRole === "admin" ? "Admin account created." : "User account created and site access assigned.");
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create account.");
    } finally {
      setSaving(false);
    }
  };

  const saveGrants = async (user: ManagedUser) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await adminRequest("PUT", { user_id: user.id, grants: drafts[user.id] ?? [], company_name: companyDrafts[user.id] ?? "" });
      setMessage(`Site access updated for ${user.email}.`);
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update permissions.");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    if (!window.confirm(`Permanently delete ${user.email}? Their site access and account will be removed. This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await adminRequest("DELETE", { user_id: user.id });
      setMessage(`User account deleted: ${user.email}.`);
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete user.");
    } finally {
      setSaving(false);
    }
  };

  const changeGrant = (userId: string, projectId: string, grant: Grant | null) => {
    setDrafts((current) => {
      const currentGrants = current[userId] ?? [];
      const without = currentGrants.filter((grant) => grant.project_id !== projectId);
      return {
        ...current,
        [userId]: grant ? [...without, grant] : without,
      };
    });
  };

  if (loading) return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
      <div role="status" aria-live="polite" className="flex w-full max-w-sm items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
        <div>
          <p className="font-semibold text-slate-900">Loading user access</p>
          <p className="mt-1 text-sm text-slate-500">Fetching users and site permissions…</p>
        </div>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="text-sm font-medium text-green-700">← Back to Projects</Link>
        <h1 className="mt-5 text-3xl font-bold text-slate-900">User and Site Access</h1>
        <p className="mt-2 text-sm text-slate-600">Create accounts and choose which project sites each user can view or edit.</p>

        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}

        <form onSubmit={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create User Account</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Email
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Company name
              <input required maxLength={120} value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Temporary password (8+ characters)
              <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            {isSuperAdmin && <label className="text-sm font-medium text-slate-700">Account role
              <select value={accountRole} onChange={(event) => setAccountRole(event.target.value as "user" | "admin")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>}
          </div>
          {accountRole === "user" && <SitePermissionList projects={projects} selected={newGrants} onChange={(projectId, grant) => setNewGrants((current) => {
            const next = { ...current };
            if (grant === null) delete next[projectId];
            else next[projectId] = grant;
            return next;
          })} />}
          <button disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-3 font-semibold !text-white disabled:opacity-60">
            {saving ? "Saving…" : accountRole === "admin" ? "Create Admin" : "Create User"}
          </button>
        </form>

        <section className="mt-8 space-y-5">
          <h2 className="text-xl font-bold text-slate-900">Existing Users</h2>
          {users.length === 0 && <p className="rounded-xl bg-white p-6 text-sm text-slate-600">No user accounts yet.</p>}
          {users.map((user) => {
            const selected = Object.fromEntries((drafts[user.id] ?? []).map((grant) => [grant.project_id, grant]));
            return <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">{user.email}</h3>
              <label className="mt-3 block max-w-md text-sm font-medium text-slate-700">Company name
                <input required maxLength={120} value={companyDrafts[user.id] ?? ""} onChange={(event) => setCompanyDrafts((current) => ({ ...current, [user.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <SitePermissionList projects={projects} selected={selected} onChange={(projectId, grant) => changeGrant(user.id, projectId, grant)} />
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saving} onClick={() => void saveGrants(user)} className="rounded-lg border border-green-700 px-5 py-2.5 font-semibold text-green-800 disabled:opacity-60">{saving ? "Saving…" : "Save Changes"}</button>
                <button type="button" disabled={saving} onClick={() => void deleteUser(user)} className="rounded-lg border border-red-300 px-5 py-2.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">{saving ? "Working…" : "Delete User"}</button>
              </div>
            </article>;
          })}
        </section>
      </div>
    </main>
  );
}

function SitePermissionList({
  projects,
  selected,
  onChange,
}: {
  projects: Project[];
  selected: Record<string, Grant>;
  onChange: (projectId: string, grant: Grant | null) => void;
}) {
  return <fieldset className="mt-5">
    <legend className="text-sm font-semibold text-slate-800">Site permissions</legend>
    {projects.length === 0 ? <p className="mt-2 text-sm text-slate-500">Create a project site before assigning access.</p> :
      <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {projects.map((project) => {
          const grant = selected[project.id];
          const modulePermissions = [
            ["can_edit_measurements", "Measurements"],
            ["can_edit_items", "Items"],
            ["can_edit_transport", "Transportation"],
            ["can_edit_labour", "Labour"],
            ["can_edit_billing", "Billing"],
            ["can_edit_payments", "Payments"],
          ] as const;
          return <div key={project.id} className="p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={Boolean(grant)} onChange={(event) => onChange(project.id, event.target.checked ? emptyGrant(project.id) : null)} />
              <span>{project.project_name} <span className="font-normal text-slate-500">({project.project_code})</span></span>
            </label>
            {grant && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-6">
              {modulePermissions.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={grant[key]} onChange={(event) => onChange(project.id, { ...grant, [key]: event.target.checked })} />
                Edit {label}
              </label>)}
            </div>}
          </div>;
        })}
      </div>}
    <p className="mt-2 text-xs text-slate-500">A selected site grants view access. Turn on edit access separately for each module.</p>
  </fieldset>;
}
