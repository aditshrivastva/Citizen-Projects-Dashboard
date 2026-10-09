
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-error";

type Measurement = {
  id: string;
  measurement_name: string;
  location: string | null;
  length: number | null;
  width: number | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
};

const initialForm = {
  measurement_name: "",
  location: "",
  length: "",
  width: "",
  quantity: "1",
  unit: "ft",
  remarks: "",
};

export default function MeasurementsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [rows, setRows] = useState<Measurement[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const loadMeasurements = useCallback(async () => {
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (user.app_metadata?.role === "admin") {
        setCanEdit(true);
      } else {
        const { data: access, error: accessError } = await supabase
          .from("site_access")
          .select("can_edit_measurements")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .maybeSingle();
        if (accessError) throw accessError;
        setCanEdit(access?.can_edit_measurements ?? false);
      }
      const { data, error: fetchError } = await supabase
        .from("measurements")
        .select("id, measurement_name, location, length, width, quantity, unit, remarks")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setRows(data ?? []);
    } catch (err) {
      setError(getSupabaseErrorMessage(err, "Unable to load measurements. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Loading data is the purpose of this effect; the async loader updates the UI as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMeasurements();
  }, [loadMeasurements]);

  const area =
    Number(form.length || 0) *
    Number(form.width || 0) *
    Number(form.quantity || 0);

  const saveMeasurement = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Check the project .env.local file and restart the dev server."
      );
      return;
    }

    if (!form.measurement_name.trim() || !form.location.trim()) {
      setError("Enter a measurement name and site location.");
      return;
    }

    if (
      Number(form.length) <= 0 ||
      Number(form.width) <= 0 ||
      Number(form.quantity) <= 0
    ) {
      setError("Length, width and quantity must be positive.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please sign in again.");
      }
      if (user.app_metadata?.role !== "admin" && !canEdit) {
        throw new Error("You have view-only access to this site.");
      }

      const { error: insertError } = await supabase
        .from("measurements")
        .insert({
          project_id: projectId,
          measurement_name: form.measurement_name.trim(),
          location: form.location.trim(),
          length: Number(form.length),
          width: Number(form.width),
          quantity: Number(form.quantity),
          unit: form.unit,
          remarks: form.remarks.trim() || null,
        });

      if (insertError) throw insertError;

      setForm(initialForm);
      setSuccess("Measurement added successfully.");
      await loadMeasurements();
    } catch (err) {
      setError(getSupabaseErrorMessage(err, "Unable to save measurement."));
    } finally {
      setSaving(false);
    }
  };

  const totalArea = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.length || 0) *
        Number(row.width || 0) *
        Number(row.quantity || 0),
    0
  );

  return (
    <main className="measurements-page min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="text-sm font-medium text-green-700"
        >
          ← Back to Project
        </Link>

        <div className="my-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Site Measurements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Record ceiling measurements for this project.
          </p>
        </div>

        {canEdit ? <form
          onSubmit={saveMeasurement}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-5 text-lg font-semibold">
            Add Measurement
          </h2>

          <div className="grid gap-5 md:grid-cols-3">
            <label className="text-sm font-medium">
              Measurement Name *
              <input
                required
                value={form.measurement_name}
                onChange={(e) => setForm((current) => ({ ...current, measurement_name: e.target.value }))}
                placeholder="False ceiling - Reception"
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Site Location *
              <input
                required
                value={form.location}
                onChange={(e) =>
                  setForm((current) => ({ ...current, location: e.target.value }))
                }
                placeholder="Ground Floor - Reception"
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Length *
              <input
                required
                type="number"
                min="0.001"
                step="any"
                value={form.length}
                onChange={(e) =>
                  setForm((current) => ({ ...current, length: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Width *
              <input
                required
                type="number"
                min="0.001"
                step="any"
                value={form.width}
                onChange={(e) =>
                  setForm((current) => ({ ...current, width: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Quantity *
              <input
                required
                type="number"
                min="0.001"
                step="any"
                value={form.quantity}
                onChange={(e) =>
                  setForm((current) => ({ ...current, quantity: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Measurement Unit
              <select
                value={form.unit}
                onChange={(e) =>
                  setForm((current) => ({ ...current, unit: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              >
                <option value="ft">Feet</option>
                <option value="m">Metres</option>
              </select>
            </label>

            <div className="rounded-xl bg-green-50 p-4">
              <p className="text-sm text-green-800">
                Calculated Area
              </p>
              <p className="mt-1 text-2xl font-bold text-green-800">
                {area.toFixed(2)}{" "}
                {form.unit === "ft" ? "sq ft" : "sq m"}
              </p>
            </div>

            <label className="text-sm font-medium md:col-span-3">
              Remarks
              <textarea
                rows={3}
                value={form.remarks}
                onChange={(e) =>
                  setForm((current) => ({ ...current, remarks: e.target.value }))
                }
                placeholder="Measurement notes..."
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="mt-4 text-sm text-green-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 rounded-lg bg-green-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Measurement"}
          </button>
        </form> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to this site. Contact an administrator to request edit access.</p>}

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold">
              Measurement Register
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length} records
              {rows.length > 0 &&
                rows.every((r) => r.unit === rows[0].unit) &&
                ` · Total area: ${totalArea.toFixed(2)} ${
                  rows[0].unit === "ft" ? "sq ft" : "sq m"
                }`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {[
                    "Measurement",
                    "Location",
                    "Length",
                    "Width",
                    "Qty",
                    "Area",
                    "Remarks",
                  ].map((heading) => (
                    <th key={heading} className="p-4">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <>
                    {[0, 1, 2].map((row) => (
                      <tr key={row} aria-hidden="true">
                        {Array.from({ length: 7 }, (_, cell) => (
                          <td key={cell} className="p-4">
                            <div className="loading-skeleton h-4 w-full max-w-28 rounded bg-slate-200" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      No measurements recorded yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="p-4 font-medium">
                        {row.measurement_name}
                      </td>
                      <td className="p-4 font-medium">
                        {row.location}
                      </td>
                      <td className="p-4">{row.length}</td>
                      <td className="p-4">{row.width}</td>
                      <td className="p-4">{row.quantity}</td>
                      <td className="p-4 font-semibold">
                        {(
                          Number(row.length || 0) *
                          Number(row.width || 0) *
                          Number(row.quantity || 0)
                        ).toFixed(2)}{" "}
                        {row.unit === "ft" ? "sq ft" : "sq m"}
                      </td>
                      <td className="p-4">{row.remarks || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
