
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  project_code: string;
  project_name: string;
  client_name: string | null;
  client_company: string | null;
  site_address: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  status: string;
  progress_percentage: number;
  description: string | null;
};

export default function ProjectDetailsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [measurementsCount, setMeasurementsCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const [transportCount, setTransportCount] = useState(0);
  const [labourCount, setLabourCount] = useState(0);
  const [billingCount, setBillingCount] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [billedTotal, setBilledTotal] = useState(0);
  const [receivedTotal, setReceivedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
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

  const loadProject = useCallback(async () => {
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

      const [projectResult, measurementResult, itemResult, transportResult, labourResult, billingResult, paymentsResult, billsAmountResult, paymentsAmountResult] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .maybeSingle(),
        supabase
          .from("measurements")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("transports")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("labour_records")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("project_bills")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("project_payments")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("project_bills")
          .select("amount")
          .eq("project_id", projectId)
          .neq("status", "cancelled"),
        supabase
          .from("project_payments")
          .select("amount")
          .eq("project_id", projectId),
      ]);

      if (projectResult.error) {
        setError(projectResult.error.message);
      } else if (!projectResult.data) {
        setError("Project not found or access denied.");
      } else {
        setProject(projectResult.data);
      }

      if (measurementResult.error || itemResult.error || transportResult.error || labourResult.error || billingResult.error || paymentsResult.error || billsAmountResult.error || paymentsAmountResult.error) {
        setError("Some project statistics could not be loaded.");
      }

      setMeasurementsCount(measurementResult.count ?? 0);
      setItemsCount(itemResult.count ?? 0);
      setTransportCount(transportResult.count ?? 0);
      setLabourCount(labourResult.count ?? 0);
      setBillingCount(billingResult.count ?? 0);
      setPaymentsCount(paymentsResult.count ?? 0);
      setBilledTotal((billsAmountResult.data ?? []).reduce((sum, bill) => sum + Number(bill.amount), 0));
      setReceivedTotal((paymentsAmountResult.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load project details. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  const startEditing = () => {
    if (!project) return;
    setEditForm({
      project_code: project.project_code,
      project_name: project.project_name,
      client_name: project.client_name ?? "",
      client_company: project.client_company ?? "",
      site_address: project.site_address ?? "",
      start_date: project.start_date ?? "",
      expected_end_date: project.expected_end_date ?? "",
      status: project.status,
      progress_percentage: String(project.progress_percentage),
      description: project.description ?? "",
    });
    setEditError("");
    setEditing(true);
  };

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditError("");
    const progress = Number(editForm.progress_percentage);
    if (!editForm.project_code.trim() || !editForm.project_name.trim()) {
      setEditError("Project code and project name are required.");
      return;
    }
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      setEditError("Progress must be between 0 and 100.");
      return;
    }
    if (!supabase) {
      setEditError("Supabase is not configured.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.from("projects").update({
      project_code: editForm.project_code.trim(),
      project_name: editForm.project_name.trim(),
      client_name: editForm.client_name.trim() || null,
      client_company: editForm.client_company.trim() || null,
      site_address: editForm.site_address.trim() || null,
      start_date: editForm.start_date || null,
      expected_end_date: editForm.expected_end_date || null,
      status: editForm.status,
      progress_percentage: progress,
      description: editForm.description.trim() || null,
    }).eq("id", projectId);
    setSaving(false);

    if (updateError) {
      setEditError(updateError.message);
      return;
    }
    setEditing(false);
    await loadProject();
  };

  useEffect(() => {
    // Loading data is the purpose of this effect; the async loader updates the UI as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProject();
  }, [loadProject]);

  const formatDate = (value: string | null) =>
    value
      ? new Date(`${value}T00:00:00`).toLocaleDateString(
          "en-IN",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }
        )
      : "Not specified";

  const formatMoney = (amount: number) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

  if (loading) {
    return (
      <main aria-label="Loading project details" className="min-h-screen bg-slate-100 p-5 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="loading-skeleton h-4 w-32 rounded bg-slate-200" />
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="loading-skeleton h-4 w-28 rounded bg-slate-200" />
            <div className="loading-skeleton mt-3 h-9 w-72 max-w-full rounded bg-slate-200" />
            <div className="loading-skeleton mt-3 h-4 w-48 rounded bg-slate-200" />
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {[0, 1].map((card) => (
              <div key={card} className="h-36 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="loading-skeleton h-5 w-36 rounded bg-slate-200" />
                <div className="loading-skeleton mt-5 h-4 w-48 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <div className="p-8">
        <p className="text-red-700">
          {error || "Project not found or access denied."}
        </p>
        <Link href="/dashboard" className="text-green-700">
          Back to Projects
        </Link>
      </div>
    );
  }

  const modules = [
    {
      name: "Measurements",
      description: "Record and review site dimensions",
      count: measurementsCount,
      href: `/dashboard/projects/${projectId}/measurements`,
    },
    {
      name: "Items",
      description: "Manage materials, quantities and rates",
      count: itemsCount,
      href: `/dashboard/projects/${projectId}/items`,
    },
    {
      name: "Transportation",
      description: "Track truck trips, drivers and material deliveries",
      count: transportCount,
      href: `/dashboard/projects/${projectId}/transport`,
    },
    {
      name: "Labour",
      description: "Track workforce, working days and labour costs",
      count: labourCount,
      href: `/dashboard/projects/${projectId}/labour`,
    },
    {
      name: "Order Value",
      description: "Calculate item value, freight, GST and payments received",
      count: null,
      href: `/dashboard/projects/${projectId}/order-value`,
    },
    {
      name: "Billing",
      description: "Manage bills, due dates and invoice PDFs",
      count: billingCount,
      href: `/dashboard/projects/${projectId}/billing`,
    },
    {
      name: "Payments",
      description: "Record received amounts, references and payment types",
      count: paymentsCount,
      href: `/dashboard/projects/${projectId}/payments`,
    },
  ];

  return (
    <main className="project-detail-page min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-green-700"
        >
          ← All Projects
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">
              {project.project_code}
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              {project.project_name}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {project.client_company ||
                project.client_name ||
                "Client not specified"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-semibold capitalize text-green-700">
              {project.status.replaceAll("_", " ")}
            </span>
            {isAdmin && <button type="button" onClick={startEditing} className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold !text-white hover:bg-green-800">Edit Project</button>}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-700">{error}</p>
        )}

        {editing && isAdmin && (
          <form onSubmit={saveProject} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Edit Project Details</h2>
                <p className="mt-1 text-sm text-slate-500">Update the project and site information below.</p>
              </div>
              <button type="button" onClick={() => setEditing(false)} className="text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Project Code
                <input required value={editForm.project_code} onChange={(event) => setEditForm((form) => ({ ...form, project_code: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Project Name
                <input required value={editForm.project_name} onChange={(event) => setEditForm((form) => ({ ...form, project_name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Client Name
                <input value={editForm.client_name} onChange={(event) => setEditForm((form) => ({ ...form, client_name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Client Company
                <input value={editForm.client_company} onChange={(event) => setEditForm((form) => ({ ...form, client_company: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Site Address
                <textarea rows={2} value={editForm.site_address} onChange={(event) => setEditForm((form) => ({ ...form, site_address: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Start Date
                <input type="date" value={editForm.start_date} onChange={(event) => setEditForm((form) => ({ ...form, start_date: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Expected End Date
                <input type="date" value={editForm.expected_end_date} onChange={(event) => setEditForm((form) => ({ ...form, expected_end_date: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Status
                <select value={editForm.status} onChange={(event) => setEditForm((form) => ({ ...form, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="planning">Planning</option><option value="active">Active</option><option value="manufacturing">Manufacturing</option><option value="in_transit">In Transit</option><option value="payment_pending">Payment Pending</option><option value="on_hold">On Hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Progress (%)
                <input type="number" min="0" max="100" value={editForm.progress_percentage} onChange={(event) => setEditForm((form) => ({ ...form, progress_percentage: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description
                <textarea rows={4} value={editForm.description} onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
            </div>
            {editError && <p role="alert" className="mt-4 text-sm text-red-700">{editError}</p>}
            <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Saving…" : "Save Changes"}</button>
          </form>
        )}

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Project Overview
          </h2>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Client</p>
              <p className="mt-1 font-semibold">
                {project.client_name || "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Start Date
              </p>
              <p className="mt-1 font-semibold">
                {formatDate(project.start_date)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Expected End Date
              </p>
              <p className="mt-1 font-semibold">
                {formatDate(project.expected_end_date)}
              </p>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-sm text-slate-500">
                Site Address
              </p>
              <p className="mt-1 font-semibold">
                {project.site_address || "—"}
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <div className="mb-3 flex justify-between">
              <p className="font-semibold">Overall Progress</p>
              <p className="font-bold text-green-700">
                {project.progress_percentage}%
              </p>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-green-600"
                style={{
                  width: `${project.progress_percentage}%`,
                }}
              />
            </div>
          </div>
        </section>

        <section aria-label="Project billing summary" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Billing Summary</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Total Billed</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(billedTotal)}</p>
            </div>
            <div className="rounded-xl bg-green-50 p-4">
              <p className="text-sm text-green-800">Payments Received</p>
              <p className="mt-1 text-xl font-bold text-green-800">{formatMoney(receivedTotal)}</p>
            </div>
            <div className={`rounded-xl p-4 ${billedTotal >= receivedTotal ? "bg-red-50" : "bg-green-50"}`}>
              <p className={`text-sm ${billedTotal >= receivedTotal ? "text-red-800" : "text-green-800"}`}>{billedTotal >= receivedTotal ? "Amount Due" : "Extra Received"}</p>
              <p className={`mt-1 text-xl font-bold ${billedTotal >= receivedTotal ? "text-red-800" : "text-green-800"}`}>{formatMoney(Math.abs(billedTotal - receivedTotal))}</p>
            </div>
          </div>
        </section>

        <h2 className="mb-4 mt-8 text-xl font-bold">
          Project Modules
        </h2>

        <div className="grid gap-5 md:grid-cols-2">
          {modules.map((module) => (
            <Link
              key={module.name}
              href={module.href}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-green-500 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">
                  {module.name}
                </h3>
                {module.count !== null && <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
                  {module.count} records
                </span>}
              </div>

              <p className="mt-3 text-sm text-slate-500">
                {module.description}
              </p>

              <p className="mt-6 text-sm font-semibold text-green-700">
                Open {module.name} →
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
