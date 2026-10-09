"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-error";

type Bill = {
  id: string;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  amount: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  pdf_path: string | null;
  description: string | null;
};

const emptyForm = {
  bill_number: "",
  bill_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  amount: "",
  status: "pending" as Bill["status"],
  description: "",
};

const formatMoney = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(amount);

export default function BillingPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [bills, setBills] = useState<Bill[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadBills = useCallback(async () => {
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
      if (user.app_metadata?.role === "admin") setCanEdit(true);
      else {
        const { data: access, error: accessError } = await supabase.from("site_access")
          .select("can_edit_billing").eq("user_id", user.id).eq("project_id", projectId).maybeSingle();
        if (accessError) throw accessError;
        setCanEdit(access?.can_edit_billing ?? false);
      }
      const { data, error: fetchError } = await supabase.from("project_bills")
        .select("id, bill_number, bill_date, due_date, amount, status, pdf_path, description")
        .eq("project_id", projectId).order("bill_date", { ascending: false });
      if (fetchError) throw fetchError;
      setBills(data ?? []);
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to load bills."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Load project bills when the module opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBills();
  }, [loadBills]);

  const saveBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) return setError("Supabase is not configured.");
    const amount = Number(form.amount);
    if (!form.bill_number.trim() || !Number.isFinite(amount) || amount <= 0) {
      return setError("Enter a bill number and amount greater than zero.");
    }
    if (file && (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024)) {
      return setError("Choose a PDF file no larger than 10 MB.");
    }

    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role !== "admin" && !canEdit) throw new Error("You have view-only access to Billing for this site.");

      if (file) {
        uploadedPath = `${projectId}/${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage.from("project-bills").upload(uploadedPath, file, {
          contentType: "application/pdf", upsert: false,
        });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase.from("project_bills").insert({
        project_id: projectId,
        bill_number: form.bill_number.trim(),
        bill_date: form.bill_date,
        due_date: form.due_date || null,
        amount,
        status: form.status,
        pdf_path: uploadedPath,
        description: form.description.trim() || null,
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setForm({ ...emptyForm, bill_date: new Date().toISOString().slice(0, 10) });
      setFile(null);
      setMessage("Bill added.");
      await loadBills();
    } catch (cause) {
      if (uploadedPath && supabase) await supabase.storage.from("project-bills").remove([uploadedPath]);
      setError(getSupabaseErrorMessage(cause, "Unable to save bill."));
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async (path: string) => {
    if (!supabase) return;
    const { data, error: urlError } = await supabase.storage.from("project-bills").createSignedUrl(path, 60);
    if (urlError) {
      setError(getSupabaseErrorMessage(urlError, "Unable to open the bill PDF."));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const total = bills.reduce((sum, bill) => sum + Number(bill.amount), 0);

  return <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
    <div className="mx-auto max-w-6xl">
      <Link href={`/dashboard/projects/${projectId}`} className="text-sm font-medium text-green-700">← Back to Project</Link>
      <div className="my-6"><h1 className="text-3xl font-bold text-slate-900">Billing</h1><p className="mt-1 text-sm text-slate-600">Bills, due dates and invoice documents for this project.</p></div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {canEdit ? <form onSubmit={saveBill} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add Bill</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Bill Number *<input required maxLength={80} value={form.bill_number} onChange={(e) => setForm((v) => ({ ...v, bill_number: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Bill Date *<input required type="date" value={form.bill_date} onChange={(e) => setForm((v) => ({ ...v, bill_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Due Date<input type="date" value={form.due_date} onChange={(e) => setForm((v) => ({ ...v, due_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Bill Amount (₹) *<input required type="number" min="0.01" step="any" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Status<select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as Bill["status"] }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="pending">Pending</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></select></label>
          <label className="text-sm font-medium text-slate-700">Bill PDF (optional, max 10 MB)<input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">Description / Notes<textarea rows={2} value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
        </div>
        <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Saving…" : "Add Bill"}</button>
      </form> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to Billing for this site.</p>}

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-semibold text-slate-900">Bills Register</h2><p className="mt-1 text-sm text-slate-500">{bills.length} bills · Total billed: {formatMoney(total)}</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{["Bill #", "Bill Date", "Due Date", "Amount", "Status", "Invoice", "Description"].map((title) => <th key={title} className="px-4 py-3">{title}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading bills…</td></tr> : bills.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">No bills recorded yet.</td></tr> : bills.map((bill) => <tr key={bill.id}>
              <td className="px-4 py-3 font-medium">{bill.bill_number}</td><td className="px-4 py-3">{bill.bill_date}</td><td className="px-4 py-3">{bill.due_date || "—"}</td><td className="px-4 py-3 font-semibold">{formatMoney(Number(bill.amount))}</td><td className="px-4 py-3 capitalize">{bill.status}</td><td className="px-4 py-3">{bill.pdf_path ? <button onClick={() => void openPdf(bill.pdf_path!)} className="font-medium text-green-700 underline">View PDF</button> : "—"}</td><td className="px-4 py-3">{bill.description || "—"}</td>
            </tr>)}
          </tbody>
        </table></div>
      </section>
    </div>
  </main>;
}
