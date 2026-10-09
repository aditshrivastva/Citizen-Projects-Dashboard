"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-error";

type LabourRecord = {
  id: string;
  labour_name: string;
  work_type: string | null;
  labour_count: number;
  days_worked: number;
  cost_per_unit: number;
  start_date: string;
  notes: string | null;
};

const initialForm = {
  labour_name: "",
  work_type: "",
  labour_count: "1",
  days_worked: "1",
  cost_per_unit: "",
  start_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const formatMoney = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(amount);

export default function LabourPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [records, setRecords] = useState<LabourRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadLabour = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role === "admin") {
        setIsAdmin(true);
        setCanEdit(true);
      } else {
        setIsAdmin(false);
        const { data: access, error: accessError } = await supabase
          .from("site_access")
          .select("can_edit_labour")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .maybeSingle();
        if (accessError) throw accessError;
        setCanEdit(access?.can_edit_labour ?? false);
      }

      const { data, error: fetchError } = await supabase
        .from("labour_records")
        .select("id, labour_name, work_type, labour_count, days_worked, cost_per_unit, start_date, notes")
        .eq("project_id", projectId)
        .order("start_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setRecords(data ?? []);
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to load labour records."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Load the site's labour log when the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLabour();
  }, [loadLabour]);

  const estimatedTotal = Number(form.labour_count || 0)
    * Number(form.days_worked || 0)
    * Number(form.cost_per_unit || 0);

  const saveLabour = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    const labourCount = Number(form.labour_count);
    const daysWorked = Number(form.days_worked);
    const costPerUnit = isAdmin ? Number(form.cost_per_unit) : 0;
    if (!form.labour_name.trim() || labourCount < 1 || daysWorked <= 0 || (isAdmin && (costPerUnit < 0 || form.cost_per_unit === ""))) {
      setError(isAdmin ? "Enter a name, at least one labourer, positive days, and a valid per-unit cost." : "Enter a name, at least one labourer, and positive days.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role !== "admin" && !canEdit) {
        throw new Error("You have view-only access to this site.");
      }
      const { error: insertError } = await supabase.from("labour_records").insert({
        project_id: projectId,
        labour_name: form.labour_name.trim(),
        work_type: form.work_type.trim() || null,
        labour_count: labourCount,
        days_worked: daysWorked,
        cost_per_unit: costPerUnit,
        start_date: form.start_date,
        notes: form.notes.trim() || null,
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setForm({ ...initialForm, start_date: new Date().toISOString().slice(0, 10) });
      setSuccess("Labour details added.");
      await loadLabour();
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to save labour details."));
    } finally {
      setSaving(false);
    }
  };

  const totalCost = records.reduce((sum, record) => sum + record.labour_count * record.days_worked * record.cost_per_unit, 0);

  return (
    <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href={`/dashboard/projects/${projectId}`} className="text-sm font-medium text-green-700">← Back to Project</Link>
        <div className="my-6">
          <h1 className="text-3xl font-bold text-slate-900">Labour Details</h1>
          <p className="mt-1 text-sm text-slate-600">Track workforce, duration and labour costs for this site.</p>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}

        {canEdit ? <form onSubmit={saveLabour} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add Labour Entry</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Labour / Team Name *
              <input required maxLength={120} value={form.labour_name} onChange={(e) => setForm((v) => ({ ...v, labour_name: e.target.value }))} placeholder="Team or supervisor name" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Work Type
              <input value={form.work_type} onChange={(e) => setForm((v) => ({ ...v, work_type: e.target.value }))} placeholder="Mason, electrician…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Start Date
              <input required type="date" value={form.start_date} onChange={(e) => setForm((v) => ({ ...v, start_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Number of Labourers *
              <input required type="number" min="1" step="1" value={form.labour_count} onChange={(e) => setForm((v) => ({ ...v, labour_count: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Days Worked *
              <input required type="number" min="0.01" step="any" value={form.days_worked} onChange={(e) => setForm((v) => ({ ...v, days_worked: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            {isAdmin && <label className="text-sm font-medium text-slate-700">Cost per Labourer / Day (₹) *
              <input required type="number" min="0" step="any" value={form.cost_per_unit} onChange={(e) => setForm((v) => ({ ...v, cost_per_unit: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>}
            {!isAdmin && <p className="self-center text-sm text-slate-500">Labour cost is managed by the administrator.</p>}
            {isAdmin && <div className="rounded-xl bg-green-50 p-4 sm:col-span-2 lg:col-span-3">
              <p className="text-sm text-green-800">Estimated Labour Cost (people × days × rate)</p>
              <p className="mt-1 text-2xl font-bold text-green-800">{formatMoney(estimatedTotal)}</p>
            </div>}
            <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">Notes
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Saving…" : "Add Labour Details"}</button>
        </form> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to this site.</p>}

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Labour Register</h2>
            <p className="mt-1 text-sm text-slate-500">{records.length} entries{isAdmin && ` · Total estimated cost: ${formatMoney(totalCost)}`}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>{["Name / Team", "Work Type", "Start Date", "Labourers", "Days", ...(isAdmin ? ["Rate / Labour / Day", "Total Cost"] : []), "Notes"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={isAdmin ? 8 : 6} className="p-8 text-center text-slate-500">Loading labour records…</td></tr> : records.length === 0 ? <tr><td colSpan={isAdmin ? 8 : 6} className="p-8 text-center text-slate-500">No labour records yet.</td></tr> : records.map((record) => <tr key={record.id}>
                  <td className="px-4 py-3 font-medium">{record.labour_name}</td>
                  <td className="px-4 py-3">{record.work_type || "—"}</td>
                  <td className="px-4 py-3">{new Date(`${record.start_date}T00:00:00`).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">{record.labour_count}</td>
                  <td className="px-4 py-3">{record.days_worked}</td>
                  {isAdmin && <><td className="px-4 py-3">{formatMoney(record.cost_per_unit)}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(record.labour_count * record.days_worked * record.cost_per_unit)}</td></>}
                  <td className="px-4 py-3">{record.notes || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
