"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  email: string;
  name: string;
  companyName: string;
  role: string;
};

export default function ProfileMenu() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  useEffect(() => {
    const loadProfile = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const displayName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "");
      setProfile({
        email: user.email ?? "",
        name: displayName,
        companyName: String(user.user_metadata?.company_name ?? ""),
        role: user.app_metadata?.role === "admin"
          ? (user.app_metadata?.is_super_admin === true ? "Super Admin" : "Admin")
          : user.app_metadata?.role === "user" ? "User" : "Unassigned",
      });
      setName(displayName);
      setEditingName(!displayName);
    };

    // Load the signed-in user's profile when the navbar mounts.
    void loadProfile();
  }, [router]);

  const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSaving(true);
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { full_name: trimmedName },
    });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setName(trimmedName);
    setProfile((current) => current ? { ...current, name: String(data.user.user_metadata?.full_name ?? trimmedName) } : current);
    setEditingName(false);
    setMessage("Name saved.");
  };

  const logOut = async () => {
    if (!supabase) return;
    setLoggingOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setLoggingOut(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  const initials = profile?.name
    ? profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
    : profile?.email.slice(0, 1).toUpperCase() || "?";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); setError(""); setMessage(""); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 pr-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">{initials}</span>
        <span className="hidden max-w-36 truncate sm:block">{profile?.name || "Profile"}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-slate-500">
          <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <section aria-label="Profile details" role="dialog" className="absolute right-0 z-[60] mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-semibold text-slate-900">Profile</h2>
            <p className="mt-2 break-all text-sm text-slate-600">{profile?.email || "Loading account…"}</p>
            {profile?.companyName && <p className="mt-1 text-sm text-slate-600">Company: <span className="font-medium text-slate-900">{profile.companyName}</span></p>}
            <p className="mt-1 text-sm text-slate-600">Role: <span className="font-semibold text-slate-900">{profile?.role || "Loading…"}</span></p>
          </div>

          <div className="pt-4">
            {profile?.name && !editingName ? (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-slate-700"><span className="font-medium">Name:</span> {profile.name}</p>
                <button
                  type="button"
                  onClick={() => { setName(profile.name); setEditingName(true); setError(""); setMessage(""); }}
                  className="shrink-0 text-xs font-semibold text-green-700 hover:text-green-800"
                >
                  Edit
                </button>
              </div>
            ) : (
              <form onSubmit={saveName}>
                <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  placeholder="Add your name"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
                {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
                {message && <p role="status" className="mt-2 text-sm text-green-700">{message}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-green-700 px-3 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-60">
                    {saving ? "Saving…" : profile?.name ? "Save" : "Add Name"}
                  </button>
                  {profile?.name && <button type="button" onClick={() => { setEditingName(false); setName(profile.name); setError(""); setMessage(""); }} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>}
                </div>
              </form>
            )}
          </div>

          <button type="button" onClick={() => void logOut()} disabled={loggingOut} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </section>
      )}
    </div>
  );
}
