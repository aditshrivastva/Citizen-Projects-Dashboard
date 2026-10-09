"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  project_code: string;
  project_name: string;
  client_name: string | null;
  client_company: string | null;
  status: string;
  progress_percentage: number;
  expected_end_date: string | null;
};

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusStyle(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
      return "bg-green-50 text-green-700";
    case "on_hold":
      return "bg-yellow-50 text-yellow-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "in_transit":
      return "bg-sky-50 text-sky-700";
    case "payment_pending":
      return "bg-amber-50 text-amber-700";
    case "manufacturing":
      return "bg-purple-50 text-purple-700";
    default:
      return "bg-blue-50 text-blue-700";
  }
}

function formatDate(date: string | null) {
  if (!date) return "—";

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "—";

  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Check the project .env.local file and restart the dev server."
      );
      setLoading(false);
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }

      setIsAdmin(authData.user.app_metadata?.role === "admin");

      const { data, error: fetchError } = await supabase
        .from("projects")
        .select(
          `
          id,
          project_code,
          project_name,
          client_name,
          client_company,
          status,
          progress_percentage,
          expected_end_date
        `
        )
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setProjects(data ?? []);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load projects. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  const deleteProject = async (project: Project) => {
    if (!supabase || deletingProjectId) return;
    const confirmed = window.confirm(
      `Delete “${project.project_name}” (${project.project_code})? This also removes its related project records and cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingProjectId(project.id);
    setError("");
    const { error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);

    if (deleteError) {
      setError(`Unable to delete project: ${deleteError.message}`);
    } else {
      setProjects((current) => current.filter((item) => item.id !== project.id));
    }
    setDeletingProjectId(null);
  };

  useEffect(() => {
    // Load remote project data when this page mounts or the loader changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);

  const filteredProjects = projects.filter((project) => {
    const searchValue = search.toLowerCase();

    const matchesSearch =
      project.project_name.toLowerCase().includes(searchValue) ||
      project.project_code.toLowerCase().includes(searchValue) ||
      (project.client_name ?? "").toLowerCase().includes(searchValue) ||
      (project.client_company ?? "").toLowerCase().includes(searchValue);

    const matchesStatus =
      status === "all" ||
      project.status.toLowerCase() === status.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">

          <div>
            <div className="text-sm text-slate-500">
              Dashboard / Projects
            </div>

            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Projects
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Manage all Citizen Projects sites.
            </p>
          </div>

          {isAdmin && (
            <div className="flex gap-3">
              <Link href="/dashboard/analytics" className="rounded-lg border border-green-700 px-4 py-3 text-sm font-semibold text-green-800 hover:bg-green-50">
                See Analytics
              </Link>
              <Link href="/dashboard/users" className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Manage Users
              </Link>
              <Link href="/dashboard/projects/new" className="rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold !text-white hover:bg-green-800">
                + New Project
              </Link>
            </div>
          )}

        </div>
      </header>

      <main className="p-5 sm:p-8">

        {error && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="font-semibold underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, client or code..."
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-green-600"
          >
            <option value="all">All Status</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="in_transit">In Transit</option>
            <option value="payment_pending">Payment Pending</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="overflow-x-auto">

            <table className="w-full min-w-[900px] text-left">

              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Project
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Client
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Progress
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Expected End
                  </th>

                  {isAdmin && <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>}

                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">

                {loading ? (
                  <>
                    {[0, 1, 2].map((row) => (
                      <tr key={row} aria-hidden="true">
                        <td className="px-5 py-5"><div className="loading-skeleton h-4 w-40 rounded bg-slate-200" /></td>
                        <td className="px-5 py-5"><div className="loading-skeleton h-4 w-32 rounded bg-slate-200" /></td>
                        <td className="px-5 py-5"><div className="loading-skeleton h-4 w-28 rounded bg-slate-200" /></td>
                        <td className="px-5 py-5"><div className="loading-skeleton h-6 w-20 rounded-full bg-slate-200" /></td>
                        <td className="px-5 py-5"><div className="loading-skeleton h-4 w-24 rounded bg-slate-200" /></td>
                      </tr>
                    ))}
                  </>
                ) : filteredProjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="px-5 py-14 text-center"
                    >
                      <p className="font-medium text-slate-800">
                        No projects found
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {isAdmin ? "Create a new project or change your search." : "Try changing your search or status filter."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((project) => (
                    <tr
                      key={project.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open project ${project.project_name}`}
                      onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/dashboard/projects/${project.id}`);
                        }
                      }}
                      className="group cursor-pointer transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-700"
                    >

                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-800 group-hover:text-green-700">
                          {project.project_name}
                        </span>

                        <p className="mt-1 text-xs text-slate-400">
                          {project.project_code}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm text-slate-700">
                          {project.client_name || "—"}
                        </p>

                        {project.client_company && (
                          <p className="mt-1 text-xs text-slate-400">
                            {project.client_company}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="w-36">
                          <div className="mb-2 flex justify-between">
                            <span className="text-xs text-slate-500">
                              Progress
                            </span>

                            <span className="text-xs font-semibold">
                              {Math.min(100, Math.max(0, project.progress_percentage))}%
                            </span>
                          </div>

                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-green-600"
                              style={{
                                width: `${Math.min(100, Math.max(0, project.progress_percentage))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusStyle(
                            project.status
                          )}`}
                        >
                          {formatStatus(project.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {formatDate(project.expected_end_date)}
                      </td>

                      {isAdmin && (
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            disabled={deletingProjectId !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteProject(project);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                            aria-label={`Delete project ${project.project_name}`}
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingProjectId === project.id ? "Deleting…" : "Delete"}
                          </button>
                        </td>
                      )}

                    </tr>
                  ))
                )}

              </tbody>

            </table>

          </div>
        </div>
      </main>
    </div>
  );
}
