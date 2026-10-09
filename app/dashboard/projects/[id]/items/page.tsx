
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-error";

type Item = {
  id: string;
  item_name: string;
  category: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  remarks: string | null;
};

const initialForm = {
  item_name: "",
  category: "Metal False Ceiling",
  specification: "",
  unit: "sq ft",
  quantity: "",
  rate: "",
  remarks: "",
};

const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(value);

export default function ItemsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadItems = useCallback(async () => {
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
        setIsAdmin(true);
        setCanEdit(true);
      } else {
        setIsAdmin(false);
        const { data: access, error: accessError } = await supabase
          .from("site_access")
          .select("can_edit_items")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .maybeSingle();
        if (accessError) throw accessError;
        setCanEdit(access?.can_edit_items ?? false);
      }
      const { data, error: fetchError } = await supabase
        .from("items")
        .select(
          "id, item_name, category, specification, unit, quantity, rate, remarks"
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setItems(data ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load items. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Loading data is the purpose of this effect; the async loader updates the UI as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, [loadItems]);

  const amount =
    Number(form.quantity || 0) * Number(form.rate || 0);

  const totalAmount = items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 0) * Number(item.rate || 0),
    0
  );

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Check the project .env.local file and restart the dev server."
      );
      return;
    }

    if (!form.item_name.trim()) {
      setError("Enter an item name.");
      return;
    }

    if (
      !Number.isFinite(Number(form.quantity)) ||
      Number(form.quantity) <= 0 ||
      (isAdmin && (form.rate === "" || !Number.isFinite(Number(form.rate)) || Number(form.rate) < 0))
    ) {
      setError("Enter a positive quantity and a valid rate.");
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
        .from("items")
        .insert({
          project_id: projectId,
          item_name: form.item_name.trim(),
          category: form.category,
          specification: form.specification.trim() || null,
          unit: form.unit,
          quantity: Number(form.quantity),
          rate: isAdmin ? Number(form.rate) : 0,
          remarks: form.remarks.trim() || null,
        });

      if (insertError) throw insertError;

      setForm(initialForm);
      setSuccess("Item added successfully.");
      await loadItems();
    } catch (err) {
      setError(getSupabaseErrorMessage(err, "Unable to save item."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="items-page min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="text-sm font-medium text-green-700"
        >
          ← Back to Project
        </Link>

        <div className="my-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Project Items
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Maintain the project item and cost register.
          </p>
        </div>

        {canEdit ? <form
          onSubmit={saveItem}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-5 text-lg font-semibold">
            Add New Item
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-medium">
              Item Name *
              <input
                required
                value={form.item_name}
                onChange={(e) =>
                  setForm((current) => ({ ...current, item_name: e.target.value }))
                }
                placeholder="600 × 600 Metal Ceiling Panel"
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Category
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((current) => ({ ...current, category: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              >
                {[
                  "Metal False Ceiling",
                  "Open Cell Ceiling",
                  "Baffle Ceiling",
                  "Gypsum False Ceiling",
                  "GRG False Ceiling",
                  "Mineral Fibre Ceiling",
                  "Calcium Silicate False Ceiling",
                  "Accessories",
                  "Labour",
                  "Other",
                ].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium md:col-span-2">
              Specification
              <input
                value={form.specification}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    specification: e.target.value,
                  }))
                }
                placeholder="Size, thickness, finish, colour..."
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>

            <label className="text-sm font-medium">
              Unit
              <select
                value={form.unit}
                onChange={(e) =>
                  setForm((current) => ({ ...current, unit: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              >
                <option value="sq ft">Square Feet</option>
                <option value="sq m">Square Metres</option>
                <option value="pcs">Pieces</option>
                <option value="rft">Running Feet</option>
                <option value="kg">Kilograms</option>
                <option value="job">Job</option>
              </select>
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

            {isAdmin && <label className="text-sm font-medium">
              Rate (₹) *
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(e) =>
                  setForm((current) => ({ ...current, rate: e.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-300 p-3"
              />
            </label>}

            {isAdmin && <div className="rounded-xl bg-green-50 p-4">
              <p className="text-sm text-green-800">
                Calculated Amount
              </p>
              <p className="mt-1 text-2xl font-bold text-green-800">
                {currency(amount)}
              </p>
            </div>}

            <label className="text-sm font-medium md:col-span-2">
              Remarks
              <textarea
                rows={3}
                value={form.remarks}
                onChange={(e) =>
                  setForm((current) => ({ ...current, remarks: e.target.value }))
                }
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
            {saving ? "Saving..." : "Save Item"}
          </button>
        </form> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have view-only access to this site. Contact an administrator to request edit access.</p>}

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-lg font-semibold">
                Item Register
              </h2>
              <p className="text-sm text-slate-500">
                {items.length} items
              </p>
            </div>
            {isAdmin && <div className="text-right">
              <p className="text-xs text-slate-500">
                {isAdmin ? "Total Estimated Amount" : "Total Amount (based on area / quantity)"}
              </p>
              <p className="text-xl font-bold text-green-700">
                {currency(totalAmount)}
              </p>
            </div>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {[
                    "Item",
                    "Category",
                    "Specification",
                    ...(isAdmin ? ["Qty"] : []),
                    "Unit",
                    ...(isAdmin ? ["Rate", "Amount"] : []),
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
                        {Array.from({ length: isAdmin ? 7 : 4 }, (_, cell) => (
                          <td key={cell} className="p-4">
                            <div className="loading-skeleton h-4 w-full max-w-28 rounded bg-slate-200" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 7 : 4}
                      className="p-8 text-center text-slate-500"
                    >
                      No items added yet.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-4 font-medium">
                        {item.item_name}
                      </td>
                      <td className="p-4">{item.category}</td>
                      <td className="p-4">
                        {item.specification || "—"}
                      </td>
                      {isAdmin && <td className="p-4">{item.quantity}</td>}
                      <td className="p-4">{item.unit}</td>
                      {isAdmin && <td className="p-4">
                        {currency(Number(item.rate || 0))}
                      </td>}
                      {isAdmin && <td className="p-4 font-semibold">
                        {currency(
                          Number(item.quantity || 0) *
                            Number(item.rate || 0)
                        )}
                      </td>}
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
