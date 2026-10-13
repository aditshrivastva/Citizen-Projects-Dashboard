"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Notice = {
  id: string;
  title: string;
  message: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

type Reminder = {
  id: string;
  title: string;
  message: string;
  href: string;
  date: string;
};

const dateOnly = (value: string) => new Date(`${value}T00:00:00`);
const prettyDate = (value: string) => dateOnly(value).toLocaleDateString("en-IN", {
  day: "2-digit", month: "short", year: "numeric",
});
const reminderDismissalsKey = (userId: string) => `dismissed-notification-reminders:${userId}`;

export default function NotificationBell() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deletingNoticeId, setDeletingNoticeId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setLoading(false);
      return;
    }
    const [noticeResult, projectsResult, billsResult] = await Promise.all([
      supabase.from("app_notifications").select("id, title, message, href, read_at, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, project_name, expected_end_date, status"),
      supabase.from("project_bills").select("id, project_id, bill_number, due_date, status")
        .in("status", ["pending", "overdue"]).not("due_date", "is", null),
    ]);

    if (noticeResult.error) setError(noticeResult.error.message);
    else setNotices((noticeResult.data ?? []) as Notice[]);

    const projectMap = new Map((projectsResult.data ?? []).map((project) => [project.id, project]));
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + 7);
    const upcoming: Reminder[] = [];

    for (const project of projectsResult.data ?? []) {
      const endDate = project.expected_end_date;
      if (!endDate || ["completed", "cancelled"].includes(project.status)) continue;
      const due = dateOnly(endDate);
      if (due <= cutoff) {
        const overdue = due < now;
        upcoming.push({
          id: `project-end-${project.id}`,
          title: overdue ? "Project end date passed" : "Project end date coming up",
          message: `${project.project_name} · ${prettyDate(endDate)}`,
          href: `/dashboard/projects/${project.id}`,
          date: endDate,
        });
      }
    }

    for (const bill of billsResult.data ?? []) {
      if (!bill.due_date || dateOnly(bill.due_date) > cutoff) continue;
      const projectName = projectMap.get(bill.project_id)?.project_name ?? "Project";
      upcoming.push({
        id: `bill-due-${bill.id}`,
        title: dateOnly(bill.due_date) < now ? "Bill is overdue" : "Bill due soon",
        message: `${projectName} · Bill ${bill.bill_number} · ${prettyDate(bill.due_date)}`,
        href: `/dashboard/projects/${bill.project_id}/billing`,
        date: bill.due_date,
      });
    }

    let dismissedReminderIds: string[] = [];
    try {
      const storedDismissals = window.localStorage.getItem(reminderDismissalsKey(user.id));
      const parsedDismissals: unknown = storedDismissals ? JSON.parse(storedDismissals) : [];
      if (Array.isArray(parsedDismissals)) dismissedReminderIds = parsedDismissals.filter((id): id is string => typeof id === "string");
    } catch {
      // If local storage is unavailable, keep showing reminders rather than failing notification loading.
    }
    setReminders(upcoming.filter((reminder) => !dismissedReminderIds.includes(reminder.id)).sort((a, b) => a.date.localeCompare(b.date)));
    setLoading(false);
  }, []);

  useEffect(() => {
    // Refresh project reminders and saved notifications when the navbar loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openNotice = async (event: MouseEvent<HTMLAnchorElement>, notice: Notice) => {
    event.preventDefault();
    if (!notice.read_at && supabase) {
      const readAt = new Date().toISOString();
      const { error: updateError } = await supabase.from("app_notifications")
        .update({ read_at: readAt })
        .eq("id", notice.id);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, read_at: readAt } : item));
    }
    setOpen(false);
    router.push(notice.href);
  };

  const clearNotifications = async () => {
    if (!supabase || clearing || (notices.length === 0 && reminders.length === 0)) return;
    setClearing(true);
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      if (notices.length > 0) {
        const deleteQuery = supabase.from("app_notifications").delete();
        const { data: deletedRows, error: deleteError } = user.app_metadata?.role === "admin"
          ? await deleteQuery.or(`recipient_id.eq.${user.id},recipient_role.eq.admin`).select("id")
          : await deleteQuery.eq("recipient_id", user.id).select("id");
        if (deleteError) throw deleteError;
        if ((deletedRows?.length ?? 0) < notices.length) {
          throw new Error(`Supabase deleted ${deletedRows?.length ?? 0} of ${notices.length} visible notifications. Check the notification DELETE policy in Supabase.`);
        }
      }
      if (reminders.length > 0) {
        const key = reminderDismissalsKey(user.id);
        let existing: string[] = [];
        try {
          const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
          if (Array.isArray(stored)) existing = stored.filter((id): id is string => typeof id === "string");
        } catch { /* Replace invalid local data with the reminders being dismissed now. */ }
        window.localStorage.setItem(key, JSON.stringify([...new Set([...existing, ...reminders.map((reminder) => reminder.id)])]));
      }
      setNotices([]);
      setReminders([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to clear notifications.");
    } finally {
      setClearing(false);
    }
  };

  const deleteNotification = async (noticeId: string) => {
    if (!supabase || clearing || deletingNoticeId) return;
    setDeletingNoticeId(noticeId);
    setError("");
    try {
      const { data: deletedRows, error: deleteError } = await supabase.from("app_notifications").delete().eq("id", noticeId).select("id");
      if (deleteError) throw deleteError;
      if (!deletedRows?.length) throw new Error("Supabase did not delete this notification. Check the notification DELETE policy.");
      setNotices((current) => current.filter((notice) => notice.id !== noticeId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this notification.");
    } finally {
      setDeletingNoticeId(null);
    }
  };

  const dismissReminder = async (reminderId: string) => {
    if (!supabase || clearing || deletingNoticeId) return;
    setDeletingNoticeId(reminderId);
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      const key = reminderDismissalsKey(user.id);
      let existing: string[] = [];
      try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
        if (Array.isArray(stored)) existing = stored.filter((id): id is string => typeof id === "string");
      } catch { /* Replace invalid local data with the reminder being dismissed now. */ }
      window.localStorage.setItem(key, JSON.stringify([...new Set([...existing, reminderId])]));
      setReminders((current) => current.filter((reminder) => reminder.id !== reminderId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to dismiss this reminder.");
    } finally {
      setDeletingNoticeId(null);
    }
  };

  const unreadCount = notices.filter((notice) => !notice.read_at).length + reminders.length;

  return <div className="relative" ref={menuRef}>
    <button type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className="relative flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4" />
      </svg>
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>

    {open && <section aria-label="Notifications" className="absolute right-0 z-[60] mt-2 max-h-[min(75vh,38rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          <p className="text-xs text-slate-500">Project deadlines, bill reminders and account updates</p>
        </div>
        {(notices.length > 0 || reminders.length > 0) && <button type="button" disabled={clearing || deletingNoticeId !== null} onClick={() => void clearNotifications()} className="shrink-0 text-xs font-semibold text-red-700 hover:underline disabled:opacity-60">{clearing ? "Clearing…" : "Clear notifications"}</button>}
      </div>
      {error && <p role="alert" className="p-4 text-sm text-red-700">{error}</p>}
      {loading ? <p className="p-5 text-sm text-slate-500">Loading notifications…</p> : <>
        {reminders.length > 0 && <div className="border-b border-slate-100 p-3">
          <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Reminders</p>
          {reminders.map((reminder) => <div key={reminder.id} className="mb-1 flex items-start gap-2 rounded-xl px-3 py-2.5 hover:bg-amber-50">
            <Link href={reminder.href} onClick={() => setOpen(false)} className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">{reminder.title}</p>
              <p className="mt-0.5 text-xs text-slate-600">{reminder.message}</p>
            </Link>
            <button type="button" aria-label={`Dismiss reminder: ${reminder.title}`} title="Dismiss reminder" disabled={clearing || deletingNoticeId !== null} onClick={() => void dismissReminder(reminder.id)} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
              {deletingNoticeId === reminder.id ? <span className="text-xs">…</span> : <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4"><path fillRule="evenodd" d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>}
            </button>
          </div>)}
        </div>}
        <div className="p-3">
          <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Recent updates</p>
          {notices.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">No recent updates.</p> : notices.map((notice) => <div key={notice.id} className={`mb-1 flex items-start gap-2 rounded-xl px-3 py-2.5 hover:bg-slate-50 ${notice.read_at ? "" : "bg-green-50/70"}`}>
            <Link href={notice.href} onClick={(event) => { void openNotice(event, notice); }} className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
              <p className="mt-0.5 text-xs text-slate-600">{notice.message}</p>
              <time className="mt-1 block text-[11px] text-slate-400" dateTime={notice.created_at}>{new Date(notice.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
            </Link>
            <button type="button" aria-label={`Delete notification: ${notice.title}`} title="Delete notification" disabled={clearing || deletingNoticeId !== null} onClick={() => void deleteNotification(notice.id)} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
              {deletingNoticeId === notice.id ? <span className="text-xs">…</span> : <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4"><path fillRule="evenodd" d="M8.5 2a1 1 0 0 0-.894.553L7.382 3H4.5a.75.75 0 0 0 0 1.5h.29l.69 10.35A2.25 2.25 0 0 0 7.726 17h4.548a2.25 2.25 0 0 0 2.246-2.15l.69-10.35h.29a.75.75 0 0 0 0-1.5h-2.882l-.224-.447A1 1 0 0 0 11.5 2h-3Zm-.96 2.5h4.92l-.18-.36a.25.25 0 0 0-.224-.14h-4.112a.25.25 0 0 0-.224.14l-.18.36Zm.71 2a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Zm3.5.75a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z" clipRule="evenodd" /></svg>}
            </button>
          </div>)}
        </div>
      </>}
    </section>}
  </div>;
}
