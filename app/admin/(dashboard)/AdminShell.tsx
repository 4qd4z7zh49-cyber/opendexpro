"use client";

import React, { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

type AdminTheme = "dark" | "light";

function normalizeTheme(value: string | null): AdminTheme {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "light" ? "light" : "dark";
}

export default function AdminShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const sp = useSearchParams();
  const theme = useMemo(() => normalizeTheme(sp.get("theme")), [sp]);

  return (
    <div className={`admin-shell admin-shell--${theme}`}>
      <div className="admin-shell__backdrop" aria-hidden />
      <div className="mx-auto flex h-full w-full max-w-[1440px] gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-6">
        <aside className="admin-shell__sidebar-frame h-full w-[252px] shrink-0 overflow-y-auto p-1.5 sm:w-[260px]">
          <Suspense fallback={<div className="h-full rounded-3xl admin-glass-panel" />}>{sidebar}</Suspense>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="admin-shell__content-frame min-h-full rounded-3xl admin-glass-panel p-4 sm:p-6">
            <Suspense fallback={<div className="h-20 rounded-2xl admin-glass-soft" />}>{children}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
