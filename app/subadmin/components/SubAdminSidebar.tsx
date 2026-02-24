// app/subadmin/components/SubAdminSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Item = {
  key: "overview" | "topups" | "mining" | "orders" | "withdraw" | "notify" | "support";
  label: string;
};
type DepositRequestBadgeResponse = {
  ok?: boolean;
  pendingCount?: number;
};

const items: Item[] = [
  { key: "overview", label: "Overview" },
  { key: "topups", label: "Deposit Permission" },
  { key: "mining", label: "Mining Permission" },
  { key: "orders", label: "Trade Permission" },
  { key: "withdraw", label: "Withdraw Info" },
  { key: "notify", label: "Mail Notify" },
  { key: "support", label: "Customer Support" },
];

export default function SubAdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") || "overview").toLowerCase();
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutErr, setLogoutErr] = useState("");
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [pendingWithdrawCount, setPendingWithdrawCount] = useState(0);
  const [pendingNotifyCount, setPendingNotifyCount] = useState(0);
  const [pendingSupportCount, setPendingSupportCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [depRes, wdRes, notifyRes, supportRes] = await Promise.all([
          fetch("/api/admin/deposit-requests?status=PENDING&limit=1", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/admin/withdraw-requests?status=PENDING&limit=1", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/admin/notify?status=PENDING&limit=1", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/admin/support?mode=badge", {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const depJson = (await depRes.json().catch(() => ({}))) as DepositRequestBadgeResponse;
        const wdJson = (await wdRes.json().catch(() => ({}))) as DepositRequestBadgeResponse;
        const notifyJson = (await notifyRes.json().catch(() => ({}))) as DepositRequestBadgeResponse;
        const supportJson = (await supportRes.json().catch(() => ({}))) as DepositRequestBadgeResponse;
        if (!cancelled) {
          if (depRes.ok && depJson?.ok) setPendingDepositCount(Number(depJson.pendingCount ?? 0));
          if (wdRes.ok && wdJson?.ok) setPendingWithdrawCount(Number(wdJson.pendingCount ?? 0));
          if (notifyRes.ok && notifyJson?.ok) setPendingNotifyCount(Number(notifyJson.pendingCount ?? 0));
          if (supportRes.ok && supportJson?.ok) setPendingSupportCount(Number(supportJson.pendingCount ?? 0));
        }
      } catch {
        // ignore badge polling errors
      }
    };

    void run();
    const t = window.setInterval(() => {
      void run();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const onLogout = async () => {
    setLogoutLoading(true);
    setLogoutErr("");
    try {
      const r = await fetch("/api/admin/logout", {
        method: "POST",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error || "Logout failed");
      }
      router.replace("/admin/login");
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Logout failed";
      setLogoutErr(message);
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5">
        <div className="text-lg font-semibold">Sub-admin</div>
        <div className="mt-1 text-sm text-white/60">Dashboard</div>
      </div>

      <div className="mt-5 px-2">
        {items.map((it) => {
          const active = tab === it.key;
          const href = `${pathname}?tab=${it.key}`;
          return (
            <Link
              key={it.key}
              href={href}
              className={[
                "mb-1 flex items-center justify-between rounded-2xl px-3 py-2 text-sm",
                active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                {it.label}
                {it.key === "topups" && pendingDepositCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingDepositCount}
                  </span>
                ) : null}
                {it.key === "withdraw" && pendingWithdrawCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingWithdrawCount}
                  </span>
                ) : null}
                {it.key === "notify" && tab !== "notify" && pendingNotifyCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingNotifyCount}
                  </span>
                ) : null}
                {it.key === "support" && tab !== "support" && pendingSupportCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingSupportCount}
                  </span>
                ) : null}
              </span>
              {active ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : null}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-4 pb-5">
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={logoutLoading}
          className="w-full rounded-xl border border-rose-400/30 bg-rose-600/90 px-4 py-2 text-left text-sm font-semibold text-white disabled:opacity-60"
        >
          {logoutLoading ? "Logging out..." : "Log out"}
        </button>
        {logoutErr ? <div className="mt-2 text-xs text-red-300">{logoutErr}</div> : null}

        <div className="mt-3 text-xs text-white/40">
          OpenBookPro Admin
        </div>
      </div>
    </div>
  );
}
