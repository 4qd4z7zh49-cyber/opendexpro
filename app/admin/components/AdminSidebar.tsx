"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type DepositRequestBadgeResponse = {
  ok?: boolean;
  pendingCount?: number;
};

type ManagerRow = {
  id: string;
  username?: string | null;
  role?: string | null;
};

type ManagersResponse = {
  ok?: boolean;
  managers?: ManagerRow[];
};

type SidebarLang = "en" | "zh";

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") || "overview").toLowerCase();
  const managedBy = String(sp.get("managedBy") || "ALL").trim() || "ALL";
  const lang: SidebarLang = sp.get("lang") === "zh" ? "zh" : "en";
  const isZh = lang === "zh";
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutErr, setLogoutErr] = useState("");
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [pendingWithdrawCount, setPendingWithdrawCount] = useState(0);
  const [pendingNotifyCount, setPendingNotifyCount] = useState(0);
  const [pendingSupportCount, setPendingSupportCount] = useState(0);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const text = {
    superadmin: isZh ? "超级管理员" : "Superadmin",
    managedBy: isZh ? "管理者" : "Managed By",
    allUsers: isZh ? "全部用户" : "All users",
    unassigned: isZh ? "未分配" : "Unassigned",
    overview: isZh ? "总览" : "Overview",
    userControl: isZh ? "用户控制" : "User Control",
    depositPermission: isZh ? "充值权限" : "Deposit Permission",
    miningPermission: isZh ? "挖矿权限" : "Mining Permission",
    tradePermission: isZh ? "交易权限" : "Trade Permission",
    withdrawPermission: isZh ? "提现权限" : "Withdraw Permission",
    mailNotify: isZh ? "邮件通知" : "Mail Notify",
    customerSupport: isZh ? "客服支持" : "Customer Support",
    superAdminProfile: isZh ? "超级管理员资料" : "Super Admin Profile",
    manageSubadmin: isZh ? "管理子管理员" : "Manage Subadmin",
    manageUser: isZh ? "管理用户" : "Manage User",
    logout: isZh ? "退出登录" : "Log out",
    loggingOut: isZh ? "正在退出..." : "Logging out...",
  };

  const pushWithLang = (basePath: string) => {
    const params = new URLSearchParams();
    if (lang === "zh") params.set("lang", "zh");
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const goTab = (t: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", t);
    if (!managedBy || managedBy.toUpperCase() === "ALL") {
      params.delete("managedBy");
    } else {
      params.set("managedBy", managedBy);
    }
    router.push(`/admin?${params.toString()}`);
  };
  const goManageAdmin = () => pushWithLang("/admin/manage-admin");
  const goManageUser = () => pushWithLang("/admin/manage-user");
  const goSuperAdminProfile = () => pushWithLang("/admin/superadmin-profile");

  const onChangeLang = (next: SidebarLang) => {
    const params = new URLSearchParams(sp.toString());
    if (next === "zh") {
      params.set("lang", "zh");
    } else {
      params.delete("lang");
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const onChangeManagedBy = (value: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", tab || "overview");
    if (!value || value.toUpperCase() === "ALL") {
      params.delete("managedBy");
    } else {
      params.set("managedBy", value);
    }
    router.push(`/admin?${params.toString()}`);
  };

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

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const managedByParams = new URLSearchParams();
        if (managedBy && managedBy.toUpperCase() !== "ALL") {
          managedByParams.set("managedBy", managedBy);
        }
        const managedByQuery = managedByParams.toString();
        const withManagedBy = (path: string) => {
          if (!managedByQuery) return path;
          return `${path}${path.includes("?") ? "&" : "?"}${managedByQuery}`;
        };

        const [depRes, wdRes, notifyRes, supportRes] = await Promise.all([
          fetch(withManagedBy("/api/admin/deposit-requests?status=PENDING&limit=1"), {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(withManagedBy("/api/admin/withdraw-requests?status=PENDING&limit=1"), {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(withManagedBy("/api/admin/notify?status=PENDING&limit=1"), {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(withManagedBy("/api/admin/support?mode=badge"), {
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
  }, [managedBy]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setManagersLoading(true);
      try {
        const r = await fetch("/api/admin/managers", {
          cache: "no-store",
          credentials: "include",
        });
        const j = (await r.json().catch(() => ({}))) as ManagersResponse;
        if (!r.ok || !j?.ok) return;
        if (!cancelled) {
          setManagers(Array.isArray(j.managers) ? j.managers : []);
        }
      } finally {
        if (!cancelled) setManagersLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const item = (
    label: string,
    active: boolean,
    onClick: () => void,
    badgeCount?: number,
    glow?: boolean
  ) => (
    <button
      onClick={onClick}
      className={`w-full rounded-xl px-4 py-3 text-left ${
        active ? "bg-white/10" : "bg-white/5 hover:bg-white/10"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span
          className={glow ? "font-semibold text-cyan-200" : undefined}
          style={
            glow
              ? {
                  textShadow:
                    "0 0 6px rgba(34,211,238,0.85), 0 0 14px rgba(59,130,246,0.55), 0 0 24px rgba(217,70,239,0.35)",
                }
              : undefined
          }
        >
          {label}
        </span>
        {typeof badgeCount === "number" && badgeCount > 0 ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-semibold text-white">
            {badgeCount}
          </span>
        ) : null}
      </span>
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-xl font-bold tracking-wide"
          style={{
            color: "#ecfeff",
            textShadow:
              "0 0 6px rgba(34,211,238,0.9), 0 0 14px rgba(59,130,246,0.6), 0 0 24px rgba(217,70,239,0.38)",
          }}
        >
          {text.superadmin}
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onChangeLang("en")}
            className={
              "rounded-md px-2 py-1 font-semibold " +
              (!isZh ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10")
            }
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onChangeLang("zh")}
            className={
              "rounded-md px-2 py-1 font-semibold " +
              (isZh ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10")
            }
          >
            中文
          </button>
        </div>
      </div>
      <label className="mt-1 block">
        <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-white/45">{text.managedBy}</div>
        <select
          value={managedBy}
          onChange={(e) => onChangeManagedBy(e.target.value)}
          disabled={managersLoading}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        >
          <option value="ALL" className="bg-black">
            {text.allUsers}
          </option>
          <option value="UNASSIGNED" className="bg-black">
            {text.unassigned}
          </option>
          {managers.map((m) => (
            <option key={m.id} value={m.id} className="bg-black">
              {m.username || m.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>

      {item(text.overview, tab === "overview", () => goTab("overview"))}
      {item(text.userControl, tab === "users", () => goTab("users"))}
      {item(text.depositPermission, tab === "topups", () => goTab("topups"), pendingDepositCount)}
      {item(text.miningPermission, tab === "mining", () => goTab("mining"))}
      {item(text.tradePermission, tab === "orders", () => goTab("orders"))}
      {item(text.withdrawPermission, tab === "withdraw", () => goTab("withdraw"), pendingWithdrawCount)}
      {item(
        text.mailNotify,
        tab === "notify",
        () => goTab("notify"),
        tab === "notify" ? 0 : pendingNotifyCount
      )}
      {item(
        text.customerSupport,
        tab === "support",
        () => goTab("support"),
        tab === "support" ? 0 : pendingSupportCount
      )}

      <div className="mt-2 border-t border-white/10 pt-3">
        {item(
          text.superAdminProfile,
          pathname === "/admin/superadmin-profile",
          goSuperAdminProfile
        )}
        {item(text.manageSubadmin, pathname === "/admin/manage-admin", goManageAdmin, undefined, true)}
        {item(text.manageUser, pathname === "/admin/manage-user", goManageUser)}
      </div>

      <div className="mt-auto border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={logoutLoading}
          className="w-full rounded-xl border border-rose-400/30 bg-rose-600/90 px-4 py-3 text-left font-semibold text-white disabled:opacity-60"
        >
          {logoutLoading ? text.loggingOut : text.logout}
        </button>
        {logoutErr ? <div className="mt-2 text-xs text-red-300">{logoutErr}</div> : null}
      </div>
    </div>
  );
}
