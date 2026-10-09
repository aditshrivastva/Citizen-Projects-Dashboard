"use client";

import Image from "next/image";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"user" | "admin">("user");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the project root .env.local file, then restart the dev server."
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError(loginError.message);
        return;
      }

      const actualRole = data.user.app_metadata?.role;
      if (actualRole !== accountType) {
        await supabase.auth.signOut();
        setError(
          actualRole === "user" || actualRole === "admin"
            ? `This account is assigned the ${actualRole === "admin" ? "Admin" : "User"} role. Choose that option to continue.`
            : "This account has no valid role assigned. Contact your administrator."
        );
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Could not connect to Supabase. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setMessage(
      "Please contact your administrator to reset your password."
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="Citizen"
            width={220}
            height={30}
            priority
            className="mx-auto mb-1 mt-14 h-10 w-auto object-contain"
          />
          <p className="mt-1 text-sm text-slate-500">
            Project & Site Management Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">

          <h2 className="text-2xl font-semibold text-slate-900">
            Welcome back
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Sign in to access your dashboard
          </p>

          <fieldset className="mt-6">
            <legend className="mb-2 block text-sm font-medium text-slate-700">Sign in as</legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {(["user", "admin"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={accountType === type}
                  onClick={() => setAccountType(type)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold capitalize transition ${
                    accountType === type
                      ? "bg-white text-green-800 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {type === "user" ? "User" : "Admin"}
                </button>
              ))}
            </div>
          </fieldset>

          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-5"
          >

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@citizenprojects.in"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-black placeholder:text-slate-400 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-green-700 hover:text-green-800"
                >
                  Forgot password?
                </button>
              </div>

              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-black placeholder:text-slate-400 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {/* Message */}
            {message && (
              <div
                role="status"
                className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"
              >
                {message}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-700 px-4 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : `Sign in as ${accountType === "admin" ? "Admin" : "User"}`}
            </button>

          </form>

          {/* Footer */}
          <div className="mt-6 border-t border-slate-200 pt-5 text-center">
            <p className="text-xs text-slate-500">
              Need access? Contact your administrator.
            </p>
          </div>

        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Citizen Projects. All rights reserved.
        </p>

      </div>
    </main>
  );
}
