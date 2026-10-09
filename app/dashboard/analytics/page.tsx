"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  project_code: string;
  project_name: string;
  client_company: string | null;
};

type AmountRecord = { project_id: string; amount: number | string };
type ProjectAnalytics = Project & { billed: number; received: number; due: number };

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

export default function AnalyticsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!supabase) {
      setError("Supabase is not configured. Check the project .env.local file and restart the dev server.");
      setLoading(false);
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }
      if (authData.user.app_metadata?.role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      const [projectsResult, billsResult, paymentsResult] = await Promise.all([
        supabase.from("projects").select("id, project_code, project_name, client_company").order("created_at", { ascending: false }),
        supabase.from("project_bills").select("project_id, amount, status").neq("status", "cancelled"),
        supabase.from("project_payments").select("project_id, amount"),
      ]);

      if (projectsResult.error) throw projectsResult.error;
      if (billsResult.error) throw billsResult.error;
      if (paymentsResult.error) throw paymentsResult.error;

      const billedByProject = new Map<string, number>();
      const receivedByProject = new Map<string, number>();
      for (const bill of (billsResult.data ?? []) as AmountRecord[]) {
        billedByProject.set(bill.project_id, (billedByProject.get(bill.project_id) ?? 0) + Number(bill.amount));
      }
      for (const payment of (paymentsResult.data ?? []) as AmountRecord[]) {
        receivedByProject.set(payment.project_id, (receivedByProject.get(payment.project_id) ?? 0) + Number(payment.amount));
      }

      setRows((projectsResult.data ?? []).map((project) => {
        const billed = billedByProject.get(project.id) ?? 0;
        const received = receivedByProject.get(project.id) ?? 0;
        return { ...project, billed, received, due: Math.max(0, billed - received) };
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load project analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Load the latest billing and payment totals when analytics opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAnalytics();
  }, [loadAnalytics]);

  const totals = rows.reduce((sum, row) => ({
    billed: sum.billed + row.billed,
    received: sum.received + row.received,
    due: sum.due + row.due,
  }), { billed: 0, received: 0, due: 0 });

  return (
    <main className="min-h-screen bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-green-700">← Back to Projects</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Dashboard / Analytics</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Project Analytics</h1>
            <p className="mt-2 text-sm text-slate-600">Billed, received and outstanding amounts for every site.</p>
          </div>
          <button type="button" onClick={() => void loadAnalytics()} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section aria-label="Overall project totals" className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total Billed", amount: totals.billed, color: "text-slate-900" },
            { label: "Total Received", amount: totals.received, color: "text-green-700" },
            { label: "Total Payment Due", amount: totals.due, color: "text-amber-700" },
          ].map((card) => (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className={`mt-2 text-2xl font-bold ${card.color}`}>{loading ? "—" : formatMoney(card.amount)}</p>
            </article>
          ))}
        </section>

        <section aria-label="Site-wise analytics" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Site-wise Amounts</h2>
            <p className="mt-1 text-sm text-slate-500">Outstanding amount is total billed minus recorded payments, with a minimum of ₹0.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Project / Site</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Billed</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Received</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">Loading site amounts…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">No projects found.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/projects/${row.id}`} className="font-semibold text-green-800 hover:underline">{row.project_name}</Link>
                      <p className="mt-1 text-xs text-slate-500">{row.project_code}{row.client_company ? ` · ${row.client_company}` : ""}</p>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-slate-800">{formatMoney(row.billed)}</td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-green-700">{formatMoney(row.received)}</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-amber-700">{formatMoney(row.due)}</td>
                  </tr>
                ))}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr className="font-bold">
                    <td className="px-5 py-4 text-slate-900">Total ({rows.length} sites)</td>
                    <td className="px-5 py-4 text-right text-slate-900">{formatMoney(totals.billed)}</td>
                    <td className="px-5 py-4 text-right text-green-700">{formatMoney(totals.received)}</td>
                    <td className="px-5 py-4 text-right text-amber-700">{formatMoney(totals.due)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
