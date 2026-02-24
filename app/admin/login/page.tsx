"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_LOGIN_MAINTENANCE_MESSAGE,
  ADMIN_LOGIN_MAINTENANCE_NOTICE_ENABLED,
} from "@/lib/maintenance";

function AdminLoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/admin";
  const maintenanceMode = ADMIN_LOGIN_MAINTENANCE_NOTICE_ENABLED;

  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [loginAttempt, setLoginAttempt] = useState(0);

  function safeNext(path: string) {
    // ✅ prevent redirecting back to login
    if (!path || path.startsWith("/admin/login")) return "/admin";
    return path;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (maintenanceMode) {
      setErr(ADMIN_LOGIN_MAINTENANCE_MESSAGE);
      return;
    }
    setErr("");
    setLoading(true);
    setLoginAttempt((v) => v + 1);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          username: username.trim(),
          password: pw,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setErr(j?.error || "Login မအောင်မြင်ပါ");
        return;
      }

      const role = String(j?.role || "");
      const dest =
        role === "sub-admin" || role === "subadmin"
          ? "/subadmin"
          : safeNext(next);

      router.replace(String(j?.redirect || "") || dest);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setErr("Login request timeout ဖြစ်နေပါတယ်။ ပြန်စမ်းပါ။");
      } else {
        const message = e instanceof Error ? e.message : "Network error";
        setErr(message || "Network error");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#06080d] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-120px] h-[360px] w-[360px] rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -right-28 top-[-80px] h-[340px] w-[340px] rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-[-180px] left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center justify-center px-4 py-10">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f131b]/95 p-6 shadow-[0_28px_80px_rgba(0,0,0,.6)] backdrop-blur"
        >
          <div className="mb-6">
            <div className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-blue-200">
              opendex ADMIN
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Administrator Sign In</h2>
            <p className="mt-1 text-sm text-white/60">
              Secure access for admin and sub-admin operations.
            </p>
            {maintenanceMode ? (
              <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                {ADMIN_LOGIN_MAINTENANCE_MESSAGE}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-white/60">
                Username
              </span>
              <input
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={maintenanceMode || loading}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-55"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-white/60">
                Password
              </span>
              <input
                placeholder="Enter password"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                disabled={maintenanceMode || loading}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-55"
              />
            </label>

            {err ? (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {err}
              </div>
            ) : null}

            <button
              disabled={maintenanceMode || loading || !username.trim() || !pw}
              className="mt-1 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {maintenanceMode ? "Maintenance in progress" : loading ? "Logging in..." : "Sign in"}
            </button>
            {loading && loginAttempt > 0 ? (
              <div className="text-center text-xs text-white/55">If it takes too long, request will auto-timeout.</div>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center bg-[#06080d] text-sm text-white/70">
          Loading...
        </div>
      }
    >
      <AdminLoginPageInner />
    </Suspense>
  );
}
