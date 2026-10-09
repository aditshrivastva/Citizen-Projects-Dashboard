"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Transport = {
  id: string;
  truck_number: string;
  truck_type: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  material: string;
  quantity: number;
  unit: string;
  trip_date: string;
  arrival_time: string | null;
  origin: string | null;
  notes: string | null;
};

function getTransportErrorMessage(cause: unknown, fallback: string) {
  if (cause && typeof cause === "object") {
    const error = cause as { message?: unknown; code?: unknown; details?: unknown };
    if (error.code === "PGRST205" || error.code === "42P01") {
      return "Transportation database table is missing. Run the 202609290003_project_transport.sql migration in Supabase SQL Editor.";
    }
    if (typeof error.message === "string" && error.message.trim()) {
      return typeof error.details === "string" && error.details.trim()
        ? `${error.message} (${error.details})`
        : error.message;
    }
  }
  return cause instanceof Error ? cause.message : fallback;
}

const emptyForm = {
  truck_number: "",
  truck_type: "",
  driver_name: "",
  driver_phone: "",
  material: "",
  quantity: "",
  unit: "ton",
  trip_date: new Date().toISOString().slice(0, 10),
  arrival_time: "",
  origin: "",
  notes: "",
};

export default function TransportPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [records, setRecords] = useState<Transport[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTransports = useCallback(async () => {
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
        setCanEdit(true);
      } else {
        const { data: access, error: accessError } = await supabase
          .from("site_access")
          .select("can_edit_transport")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .maybeSingle();
        if (accessError) throw accessError;
        setCanEdit(access?.can_edit_transport ?? false);
      }

      const { data, error: fetchError } = await supabase
        .from("transports")
        .select("id, truck_number, truck_type, driver_name, driver_phone, material, quantity, unit, trip_date, arrival_time, origin, notes")
        .eq("project_id", projectId)
        .order("trip_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setRecords(data ?? []);
    } catch (cause) {
      setError(getTransportErrorMessage(cause, "Unable to load truck records."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Load the site transport log on entry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransports();
  }, [loadTransports]);

  const saveTransport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    const quantity = Number(form.quantity);
    if (!form.truck_number.trim() || !form.material.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a truck number, material, and a quantity greater than zero.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role !== "admin" && !canEdit) {
        throw new Error("You have view-only access to this site.");
      }
      const { error: insertError } = await supabase.from("transports").insert({
        project_id: projectId,
        truck_number: form.truck_number.trim(),
        truck_type: form.truck_type.trim() || null,
        driver_name: form.driver_name.trim() || null,
        driver_phone: form.driver_phone.trim() || null,
        material: form.material.trim(),
        quantity,
        unit: form.unit,
        trip_date: form.trip_date,
        arrival_time: form.arrival_time || null,
        origin: form.origin.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setForm({ ...emptyForm, trip_date: new Date().toISOString().slice(0, 10) });
      setSuccess("Truck trip added.");
      await loadTransports();
    } catch (cause) {
      setError(getTransportErrorMessage(cause, "Unable to save truck details."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href={`/dashboard/projects/${projectId}`} className="text-sm font-medium text-green-700">← Back to Project</Link>
        <div className="my-6">
          <h1 className="text-3xl font-bold text-slate-900">Transportation</h1>
          <p className="mt-1 text-sm text-slate-600">Truck trips and material deliveries for this site.</p>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}

        {canEdit ? <form onSubmit={saveTransport} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add Truck Trip</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Truck / Registration Number *
              <input required maxLength={40} value={form.truck_number} onChange={(e) => setForm((v) => ({ ...v, truck_number: e.target.value }))} placeholder="e.g. MH 12 AB 1234" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Truck Type
              <input value={form.truck_type} onChange={(e) => setForm((v) => ({ ...v, truck_type: e.target.value }))} placeholder="Tipper, trailer, pickup…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Trip Date *
              <input required type="date" value={form.trip_date} onChange={(e) => setForm((v) => ({ ...v, trip_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Driver Name
              <input value={form.driver_name} onChange={(e) => setForm((v) => ({ ...v, driver_name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Driver Phone
              <input type="tel" value={form.driver_phone} onChange={(e) => setForm((v) => ({ ...v, driver_phone: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Arrival Time
              <input type="time" value={form.arrival_time} onChange={(e) => setForm((v) => ({ ...v, arrival_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Material / Load *
              <input required value={form.material} onChange={(e) => setForm((v) => ({ ...v, material: e.target.value }))} placeholder="Cement, sand, steel…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Quantity *
              <input required type="number" min="0.01" step="any" value={form.quantity} onChange={(e) => setForm((v) => ({ ...v, quantity: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Unit
              <select value={form.unit} onChange={(e) => setForm((v) => ({ ...v, unit: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                <option value="ton">Tonnes</option><option value="kg">Kilograms</option><option value="bag">Bags</option><option value="piece">Pieces</option><option value="load">Loads</option><option value="m³">m³</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Origin / From
              <input value={form.origin} onChange={(e) => setForm((v) => ({ ...v, origin: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes
              <input value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Saving…" : "Add Truck Trip"}</button>
        </form> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to this site.</p>}

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Truck Log</h2>
            <p className="mt-1 text-sm text-slate-500">{records.length} {records.length === 1 ? "trip" : "trips"} recorded</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>{["Date / Arrival", "Truck", "Driver", "Material", "Quantity", "Origin", "Notes"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading truck log…</td></tr> : records.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">No truck trips recorded yet.</td></tr> : records.map((record) => <tr key={record.id}>
                  <td className="px-4 py-3">{new Date(`${record.trip_date}T00:00:00`).toLocaleDateString("en-IN")}<div className="text-xs text-slate-500">{record.arrival_time?.slice(0, 5) || "—"}</div></td>
                  <td className="px-4 py-3 font-medium">{record.truck_number}<div className="text-xs font-normal text-slate-500">{record.truck_type || "—"}</div></td>
                  <td className="px-4 py-3">{record.driver_name || "—"}<div className="text-xs text-slate-500">{record.driver_phone || ""}</div></td>
                  <td className="px-4 py-3">{record.material}</td>
                  <td className="px-4 py-3">{record.quantity} {record.unit}</td>
                  <td className="px-4 py-3">{record.origin || "—"}</td>
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
