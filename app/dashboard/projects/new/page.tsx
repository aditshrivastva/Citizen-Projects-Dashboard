"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export default function NewProjectPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    project_code: "",
    project_name: "",
    client_name: "",
    client_company: "",
    site_address: "",
    start_date: "",
    expected_end_date: "",
    status: "planning",
    progress_percentage: "0",
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the project root .env.local file, then restart the dev server."
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Your session has expired. Please login again.");
        return;
      }

      if (user.app_metadata?.role !== "admin") {
        setError("Only administrators can create projects.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Your session has expired. Please login again.");
        return;
      }

      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_code: form.project_code.trim(),
          project_name: form.project_name.trim(),
          client_name: form.client_name.trim() || null,
          client_company: form.client_company.trim() || null,
          site_address: form.site_address.trim() || null,
          start_date: form.start_date || null,
          expected_end_date: form.expected_end_date || null,
          status: form.status,
          progress_percentage: Number(form.progress_percentage),
          description: form.description.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = [result.error, result.details, result.hint, result.code]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(" ");
        throw new Error(message || "Unable to create project.");
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Project creation failed:", err);
      const errorDetails = typeof err === "object" && err !== null
        ? err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
        : null;
      const errorMessage = typeof errorDetails?.message === "string"
        ? [errorDetails.message, errorDetails.details, errorDetails.hint]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(" ")
        : err instanceof Error ? err.message : "Unable to create project. Please try again.";

      setError(errorDetails?.code && typeof errorDetails.code === "string"
        ? `${errorMessage} (code: ${errorDetails.code})`
        : errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">

          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Link
                href="/dashboard"
                className="hover:text-green-700"
              >
                Dashboard
              </Link>

              <span>/</span>

              <Link
                href="/dashboard"
                className="hover:text-green-700"
              >
                Projects
              </Link>

              <span>/</span>

              <span>New Project</span>
            </div>

            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Create New Project
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Add a new project and site to Citizen Projects.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>

        </div>
      </header>

      {/* Form */}
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Unable to create project</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Basic Information */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="font-semibold text-slate-900">
                Basic Information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Basic identification details for the project.
              </p>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-2">

              {/* Project Code */}
              <div>
                <label
                  htmlFor="project_code"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Project Code <span className="text-red-500">*</span>
                </label>

                <input
                  id="project_code"
                  name="project_code"
                  type="text"
                  required
                  value={form.project_code}
                  onChange={handleChange}
                  placeholder="CP-2026-001"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />

                <p className="mt-1.5 text-xs text-slate-400">
                  Must be unique.
                </p>
              </div>

              {/* Project Name */}
              <div>
                <label
                  htmlFor="project_name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Project Name <span className="text-red-500">*</span>
                </label>

                <input
                  id="project_name"
                  name="project_name"
                  type="text"
                  required
                  value={form.project_name}
                  onChange={handleChange}
                  placeholder="ABC Corporate Office"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

            </div>
          </section>

          {/* Client Information */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="font-semibold text-slate-900">
                Client Information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Details of the client associated with this project.
              </p>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-2">

              <div>
                <label
                  htmlFor="client_name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Client Name
                </label>

                <input
                  id="client_name"
                  name="client_name"
                  type="text"
                  value={form.client_name}
                  onChange={handleChange}
                  placeholder="Rahul Sharma"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <div>
                <label
                  htmlFor="client_company"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Client Company
                </label>

                <input
                  id="client_company"
                  name="client_company"
                  type="text"
                  value={form.client_company}
                  onChange={handleChange}
                  placeholder="ABC Private Limited"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="site_address"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Site Address
                </label>

                <textarea
                  id="site_address"
                  name="site_address"
                  rows={3}
                  value={form.site_address}
                  onChange={handleChange}
                  placeholder="Complete project site address"
                  className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

            </div>
          </section>

          {/* Project Timeline */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="font-semibold text-slate-900">
                Project Timeline
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Set the planned project schedule and current status.
              </p>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-3">

              <div>
                <label
                  htmlFor="start_date"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Start Date
                </label>

                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <div>
                <label
                  htmlFor="expected_end_date"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Expected End Date
                </label>

                <input
                  id="expected_end_date"
                  name="expected_end_date"
                  type="date"
                  value={form.expected_end_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <div>
                <label
                  htmlFor="status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>

                <select
                  id="status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                >
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

            </div>
          </section>

          {/* Progress & Description */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="font-semibold text-slate-900">
                Project Details
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Add progress and additional project information.
              </p>
            </div>

            <div className="space-y-6 p-6">

              <div>
                <label
                  htmlFor="progress_percentage"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Current Progress (%)
                </label>

                <div className="flex items-center gap-4">

                  <input
                    id="progress_percentage"
                    name="progress_percentage"
                    type="number"
                    min="0"
                    max="100"
                    value={form.progress_percentage}
                    onChange={handleChange}
                    className="w-32 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  />

                  <div className="flex-1">
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-green-600 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Number(form.progress_percentage) || 0
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                </div>
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Description
                </label>

                <textarea
                  id="description"
                  name="description"
                  rows={5}
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Add project scope, special instructions, notes, etc."
                  className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

            </div>
          </section>

          {/* Actions */}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-green-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating Project..." : "Create Project"}
            </button>

          </div>

        </form>
      </main>
    </div>
  );
}
