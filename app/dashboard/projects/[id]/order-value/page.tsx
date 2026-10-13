"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-error";

type Unit = "sq_ft" | "piece" | "sq_m";
type MeasurementMode = "dimensions" | "direct";
type ProjectItem = { id: string; item_name: string; specification: string | null; unit: string | null; quantity: number | null; rate: number | null };
type OrderItem = {
  id: string;
  item_name: string;
  measurement_mode: MeasurementMode;
  length: number | null;
  width: number | null;
  dimension_unit: "ft" | "m" | null;
  unit_count: number | null;
  direct_quantity: number | null;
  unit: Unit;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
};
type Payment = { id: string; amount: number; reference: string; payment_date: string };

const emptyForm = {
  source_item_id: "",
  item_name: "",
  measurement_mode: "dimensions" as MeasurementMode,
  length: "",
  width: "",
  dimension_unit: "ft" as "ft" | "m",
  unit_count: "1",
  direct_quantity: "",
  unit: "sq_ft" as Unit,
  rate: "",
};
const unitLabels: Record<string, string> = { sq_ft: "sq ft", piece: "piece", sq_m: "sq m" };
const itemUnit = (unit: string | null): string => {
  const normalized = unit?.trim().toLowerCase();
  if (["sq ft", "sq.ft", "sq feet"].includes(normalized ?? "")) return "sq_ft";
  if (["sq m", "sq.m", "sq metres", "sq meters"].includes(normalized ?? "")) return "sq_m";
  if (["pcs", "pieces"].includes(normalized ?? "")) return "piece";
  return unit?.trim() || "piece";
};
const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(value);

function calculatedQuantity(form: typeof emptyForm) {
  if (form.measurement_mode === "direct") return Number(form.direct_quantity || 0);
  const area = Number(form.length || 0) * Number(form.width || 0) * Number(form.unit_count || 0);
  if (form.dimension_unit === "m") return form.unit === "sq_ft" ? area * 10.7639104167 : area;
  return form.unit === "sq_m" ? area * 0.09290304 : area;
}

export default function OrderValuePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [freightInput, setFreightInput] = useState("0");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFreight, setSavingFreight] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
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

      const [itemResult, settingResult, paymentResult, projectItemsResult] = await Promise.all([
        supabase.from("project_order_items").select("id, item_name, measurement_mode, length, width, dimension_unit, unit_count, direct_quantity, unit, quantity, rate, amount, created_at")
          .eq("project_id", projectId).order("created_at", { ascending: true }),
        supabase.from("project_order_settings").select("freight_charge").eq("project_id", projectId).maybeSingle(),
        supabase.from("project_payments").select("id, amount, reference, payment_date")
          .eq("project_id", projectId).order("payment_date", { ascending: false }),
        supabase.from("items").select("id, item_name, specification, unit, quantity, rate")
          .eq("project_id", projectId).order("created_at", { ascending: true }),
      ]);
      if (itemResult.error) throw itemResult.error;
      if (settingResult.error) throw settingResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (projectItemsResult.error) throw projectItemsResult.error;
      setItems((itemResult.data ?? []) as OrderItem[]);
      setProjectItems((projectItemsResult.data ?? []) as ProjectItem[]);
      setFreightInput(String(settingResult.data?.freight_charge ?? 0));
      setPayments((paymentResult.data ?? []) as Payment[]);
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to load project order value."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Load order value and received payments for this project.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const quantity = calculatedQuantity(form);
  const amount = Math.round(quantity * Number(form.rate || 0) * 100) / 100;
  const itemsTotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.amount), 0), [items]);
  const freight = Number(freightInput || 0);
  const beforeTax = itemsTotal + freight;
  const gst = Math.round(beforeTax * 0.18 * 100) / 100;
  const finalTotal = beforeTax + gst;
  const received = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = finalTotal - received;

  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) return setError("Supabase is not configured.");
    if (!form.item_name.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(Number(form.rate)) || Number(form.rate) < 0) {
      return setError("Enter an item name, positive measurement, and a valid rate.");
    }
    setSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role !== "admin" && !canEdit) throw new Error("You have view-only access to Order Value for this site.");
      const dimensional = form.measurement_mode === "dimensions";
      const { error: insertError } = await supabase.from("project_order_items").insert({
        project_id: projectId,
        item_name: form.item_name.trim(),
        measurement_mode: form.measurement_mode,
        length: dimensional ? Number(form.length) : null,
        width: dimensional ? Number(form.width) : null,
        dimension_unit: dimensional ? form.dimension_unit : null,
        unit_count: dimensional ? Number(form.unit_count) : null,
        direct_quantity: dimensional ? null : Number(form.direct_quantity),
        unit: form.unit,
        rate: Number(form.rate),
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setForm(emptyForm);
      setMessage("Order item added.");
      await load();
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to add order item."));
    } finally {
      setSaving(false);
    }
  };

  const recallProjectItem = (itemId: string) => {
    const item = projectItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      setForm((current) => ({ ...current, source_item_id: itemId }));
      return;
    }
    setForm((current) => ({
      ...current,
      source_item_id: item.id,
      item_name: [item.item_name, item.specification].filter(Boolean).join(" — "),
      measurement_mode: "direct",
      direct_quantity: String(item.quantity ?? ""),
      unit: itemUnit(item.unit) as Unit,
      rate: String(item.rate ?? "0"),
    }));
  };

  const saveFreight = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) return setError("Supabase is not configured.");
    const freightCharge = Number(freightInput);
    if (!Number.isFinite(freightCharge) || freightCharge < 0) return setError("Enter a valid freight charge.");
    setSavingFreight(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role !== "admin" && !canEdit) throw new Error("You have view-only access to Order Value for this site.");
      const { error: saveError } = await supabase.from("project_order_settings").upsert({
        project_id: projectId,
        freight_charge: freightCharge,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, { onConflict: "project_id" });
      if (saveError) throw saveError;
      setMessage("Freight charge saved.");
      await load();
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to save freight charge."));
    } finally {
      setSavingFreight(false);
    }
  };

  const removeItem = async (item: OrderItem) => {
    if (!supabase || !window.confirm(`Remove ${item.item_name} from this order?`)) return;
    setError("");
    setMessage("");
    try {
      const { error: deleteError } = await supabase.from("project_order_items").delete().eq("id", item.id).eq("project_id", projectId);
      if (deleteError) throw deleteError;
      setMessage("Order item removed.");
      await load();
    } catch (cause) {
      setError(getSupabaseErrorMessage(cause, "Unable to remove order item."));
    }
  };

  return <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
    <div className="mx-auto max-w-7xl">
      <Link href={`/dashboard/projects/${projectId}`} className="text-sm font-medium text-green-700">← Back to Project</Link>
      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Order Value</h1>
        <p className="mt-1 text-sm text-slate-600">Measurements, item rates, freight, GST and payments received.</p>
      </header>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      <section aria-label="Order value totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Items subtotal", money(itemsTotal), "bg-white"],
          ["Freight", money(freight), "bg-white"],
          ["GST (18%)", money(gst), "bg-white"],
          ["Final order value", money(finalTotal), "bg-green-50"],
          ["Payments received", money(received), "bg-blue-50"],
          [balance >= 0 ? "Balance due" : "Extra received", money(Math.abs(balance)), balance >= 0 ? "bg-amber-50" : "bg-blue-50"],
        ].map(([label, value, background]) => <div key={label} className={`rounded-2xl border border-slate-200 ${background} p-5`}>
          <p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{loading ? "—" : value}</p>
        </div>)}
      </section>

      {canEdit && <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_auto]">
        <form onSubmit={addItem} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add Order Item</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Recall from Project Items
              <select value={form.source_item_id} onChange={(event) => recallProjectItem(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                <option value="">Select an existing item…</option>
                {projectItems.map((item) => <option key={item.id} value={item.id}>{item.item_name}{item.specification ? ` — ${item.specification}` : ""}</option>)}
              </select>
              {projectItems.length === 0 && <span className="mt-1 block text-xs font-normal text-slate-500">No items saved in Project Items yet.</span>}
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Item / Work Description *
              <input required maxLength={160} value={form.item_name} onChange={(event) => setForm((current) => ({ ...current, item_name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Ceiling panels, installation…" />
            </label>
            <label className="text-sm font-medium text-slate-700">Measurement Entry *
              <select value={form.measurement_mode} onChange={(event) => setForm((current) => ({ ...current, measurement_mode: event.target.value as MeasurementMode }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                <option value="dimensions">Calculate from dimensions</option><option value="direct">Enter calculated quantity</option>
              </select>
            </label>
            {form.measurement_mode === "dimensions" ? <>
              <label className="text-sm font-medium text-slate-700">Length *
                <input required type="number" min="0.0001" step="any" value={form.length} onChange={(event) => setForm((current) => ({ ...current, length: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Width *
                <input required type="number" min="0.0001" step="any" value={form.width} onChange={(event) => setForm((current) => ({ ...current, width: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Dimension Unit *
                <select value={form.dimension_unit} onChange={(event) => setForm((current) => ({ ...current, dimension_unit: event.target.value as "ft" | "m" }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="ft">Feet</option><option value="m">Metres</option></select>
              </label>
              <label className="text-sm font-medium text-slate-700">Number of same pieces *
                <input required type="number" min="0.001" step="any" value={form.unit_count} onChange={(event) => setForm((current) => ({ ...current, unit_count: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Rate Unit *
                <select value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value as Unit }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="sq_ft">Per sq ft</option><option value="sq_m">Per sq m</option></select>
              </label>
            </> : <>
              <label className="text-sm font-medium text-slate-700">Calculated Quantity *
                <input required type="number" min="0.0001" step="any" value={form.direct_quantity} onChange={(event) => setForm((current) => ({ ...current, direct_quantity: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Rate Unit *
                <select value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value as Unit }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="sq_ft">Per sq ft</option><option value="piece">Per piece</option><option value="sq_m">Per sq m</option>{!["sq_ft", "piece", "sq_m"].includes(form.unit) && <option value={form.unit}>Per {unitLabels[form.unit] ?? form.unit}</option>}</select>
              </label>
            </>}
            <label className="text-sm font-medium text-slate-700">Rate (₹ / {unitLabels[form.unit] ?? form.unit}) *
              <input required type="number" min="0" step="0.01" value={form.rate} onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="flex items-end rounded-lg bg-slate-50 p-3 sm:col-span-2 lg:col-span-2">
              <p className="text-sm text-slate-700">Calculated: <strong>{Number.isFinite(quantity) ? quantity.toLocaleString("en-IN", { maximumFractionDigits: 4 }) : "0"} {unitLabels[form.unit] ?? form.unit}</strong> × {money(Number(form.rate || 0))} = <strong>{money(amount)}</strong></p>
            </div>
          </div>
          <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Adding…" : "Add to Order"}</button>
        </form>

        <form onSubmit={saveFreight} className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:w-72">
          <h2 className="text-lg font-semibold text-slate-900">Freight Charges</h2>
          <label className="mt-4 block text-sm font-medium text-slate-700">Freight amount (₹)
            <input type="number" min="0" step="0.01" value={freightInput} onChange={(event) => setFreightInput(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <button type="submit" disabled={savingFreight} className="mt-4 w-full rounded-lg border border-green-700 px-4 py-2.5 text-sm font-semibold text-green-800 disabled:opacity-60">{savingFreight ? "Saving…" : "Save Freight"}</button>
        </form>
      </div>}

      {!canEdit && !loading && <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to Order Value for this site.</p>}

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div><h2 className="text-lg font-semibold text-slate-900">Order Items</h2><p className="mt-1 text-sm text-slate-500">{items.length} entries · Subtotal {money(itemsTotal)}</p></div>
          <Link href={`/dashboard/projects/${projectId}/payments`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">View / Record Payments</Link>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{["Item", "Measurement", "Quantity", "Rate", "Amount", ""].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading order value…</td></tr> : items.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">No order items added yet.</td></tr> : items.map((item) => <tr key={item.id}>
              <td className="px-4 py-3 font-medium text-slate-900">{item.item_name}</td>
              <td className="px-4 py-3 text-slate-600">{item.measurement_mode === "direct" ? "Direct quantity" : `${item.length} × ${item.width} ${item.dimension_unit} × ${item.unit_count}`}</td>
              <td className="px-4 py-3">{Number(item.quantity).toLocaleString("en-IN", { maximumFractionDigits: 4 })} {unitLabels[item.unit] ?? item.unit}</td>
              <td className="px-4 py-3">{money(Number(item.rate))} / {unitLabels[item.unit] ?? item.unit}</td>
              <td className="px-4 py-3 font-semibold">{money(Number(item.amount))}</td>
              <td className="px-4 py-3">{canEdit && <button type="button" onClick={() => void removeItem(item)} className="font-medium text-red-700 hover:underline">Remove</button>}</td>
            </tr>)}
          </tbody>
        </table></div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-slate-900">Payments Received</h2><p className="mt-1 text-sm text-slate-600">{payments.length} payments · Total received {money(received)}</p></div>
          <Link href={`/dashboard/projects/${projectId}/payments`} className="text-sm font-semibold text-green-700 hover:underline">Open payment register →</Link>
        </div>
        {payments.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Date</th><th className="py-2">Reference</th><th className="py-2 text-right">Received</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment.id}><td className="py-2">{payment.payment_date}</td><td className="py-2">{payment.reference}</td><td className="py-2 text-right font-semibold">{money(Number(payment.amount))}</td></tr>)}</tbody>
        </table></div>}
      </section>

      <section aria-label="Order total calculation" className="mt-6 ml-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between py-1 text-sm text-black"><span>Items subtotal</span><span>{money(itemsTotal)}</span></div>
        <div className="flex justify-between py-1 text-sm text-black"><span>Freight</span><span>{money(freight)}</span></div>
        <div className="flex justify-between py-1 text-sm text-black"><span>GST @ 18%</span><span>{money(gst)}</span></div>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 font-bold text-black"><span>Final order value</span><span>{money(finalTotal)}</span></div>
        <div className="flex justify-between py-2 text-sm text-blue-800"><span>Payments received</span><span>{money(received)}</span></div>
        <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-black"><span>{balance >= 0 ? "Balance due" : "Extra received"}</span><span>{money(Math.abs(balance))}</span></div>
      </section>
    </div>
  </main>;
}
