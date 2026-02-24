import React, { Suspense } from "react";

export default function AdminShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-black text-white">
      <div className="mx-auto flex h-full w-full max-w-[1400px] gap-6 px-6 py-6">
        <aside className="h-full w-[260px] shrink-0 overflow-y-auto pr-1">
          <Suspense fallback={<div className="h-full rounded-3xl border border-white/10 bg-white/5" />}>
            {sidebar}
          </Suspense>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pr-1">
          <div className="min-h-full rounded-3xl border border-white/10 bg-white/5 p-6">
            <Suspense fallback={<div className="h-20 rounded-2xl border border-white/10 bg-black/20" />}>
              {children}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
