"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-error";

type Payment = {
  id: string;
  amount: number;
  reference: string;
  payment_type: string;
  payment_date: string;
  notes: string | null;
};

const initialForm = {
  amount: "",
  reference: "",
  payment_type: "bank_transfer",
  payment_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const formatMoney = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(amount);

export default function PaymentsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState(initialForm);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPayments = useCallback(async () => {
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
          .select("can_edit_payments").eq("user_id", user.id).eq("project_id", projectId).maybeSingle();
        if (accessError) throw accessError;
        setCanEdit(access?.can_edit_payments ?? false);
      }
      const { data, error: fetchError } = await supabase.from("project_payments")
        .select("id, amount, reference, payment_type, payment_date, notes")
        .eq("project_id", projectId).order("payment_date", { ascending: false });
      if (fetchError) throw fetchError;
      setPayments(data ?? []);
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to load payments."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Load project payments when the module opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPayments();
  }, [loadPayments]);

  const savePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) return setError("Supabase is not configured.");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !form.reference.trim()) {
      return setError("Enter an amount greater than zero and a payment reference.");
    }

    setSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role !== "admin" && !canEdit) throw new Error("You have view-only access to Payments for this site.");
      const { error: insertError } = await supabase.from("project_payments").insert({
        project_id: projectId,
        amount,
        reference: form.reference.trim(),
        payment_type: form.payment_type,
        payment_date: form.payment_date,
        notes: form.notes.trim() || null,
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setForm({ ...initialForm, payment_date: new Date().toISOString().slice(0, 10) });
      setMessage("Payment recorded.");
      await loadPayments();
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to record payment."));
    } finally {
      setSaving(false);
    }
  };

  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
    <div className="mx-auto max-w-6xl">
      <Link href={`/dashboard/projects/${projectId}`} className="text-sm font-medium text-green-700">← Back to Project</Link>
      <div className="my-6"><h1 className="text-3xl font-bold text-slate-900">Payments</h1><p className="mt-1 text-sm text-slate-600">Record payment amounts, references and payment methods.</p></div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {canEdit ? <form onSubmit={savePayment} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Record Payment</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Amount (₹) *<input required type="number" min="0.01" step="any" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Payment Reference *<input required maxLength={120} value={form.reference} onChange={(e) => setForm((v) => ({ ...v, reference: e.target.value }))} placeholder="Transaction ID, cheque number…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Payment Type<select value={form.payment_type} onChange={(e) => setForm((v) => ({ ...v, payment_type: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label>
          <label className="text-sm font-medium text-slate-700">Payment Date *<input required type="date" value={form.payment_date} onChange={(e) => setForm((v) => ({ ...v, payment_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes<textarea rows={2} value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
        </div>
        <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Saving…" : "Save Payment"}</button>
      </form> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to Payments for this site.</p>}

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-semibold text-slate-900">Payment Register</h2><p className="mt-1 text-sm text-slate-500">{payments.length} payments · Total received: {formatMoney(totalPaid)}</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{["Date", "Amount", "Reference", "Type", "Notes"].map((title) => <th key={title} className="px-4 py-3">{title}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading payments…</td></tr> : payments.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No payments recorded yet.</td></tr> : payments.map((payment) => <tr key={payment.id}>
              <td className="px-4 py-3">{payment.payment_date}</td><td className="px-4 py-3 font-semibold">{formatMoney(Number(payment.amount))}</td><td className="px-4 py-3">{payment.reference}</td><td className="px-4 py-3">{payment.payment_type.replaceAll("_", " ")}</td><td className="px-4 py-3">{payment.notes || "—"}</td>
            </tr>)}
          </tbody>
        </table></div>
      </section>
    </div>
  </main>;
}
