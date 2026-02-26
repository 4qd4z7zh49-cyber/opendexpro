"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

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
type SidebarTheme = "dark" | "light";

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const spKey = sp.toString();
  const tab = (sp.get("tab") || "overview").toLowerCase();
  const isDashboardPage = pathname === "/admin";
  const managedBy = String(sp.get("managedBy") || "ALL").trim() || "ALL";
  const lang: SidebarLang = sp.get("lang") === "zh" ? "zh" : "en";
  const theme: SidebarTheme = sp.get("theme") === "light" ? "light" : "dark";
  const isZh = lang === "zh";
  const isPermissionTab =
    isDashboardPage && (tab === "topups" || tab === "mining" || tab === "orders" || tab === "withdraw");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutErr, setLogoutErr] = useState("");
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [pendingWithdrawCount, setPendingWithdrawCount] = useState(0);
  const [pendingNotifyCount, setPendingNotifyCount] = useState(0);
  const [pendingSupportCount, setPendingSupportCount] = useState(0);
  const [permissionsOpen, setPermissionsOpen] = useState(isPermissionTab);
  const [permissionsFocused, setPermissionsFocused] = useState(false);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const isPermissionsActive = isPermissionTab || permissionsFocused;
  const text = {
    superadmin: isZh ? "超级管理员" : "Superadmin",
    managedBy: isZh ? "管理者" : "Managed By",
    allUsers: isZh ? "全部用户" : "All users",
    unassigned: isZh ? "未分配" : "Unassigned",
    overview: isZh ? "总览" : "Overview",
    userControl: isZh ? "用户控制" : "User Control",
    permissions: isZh ? "权限" : "Permissions",
    depositPermission: isZh ? "充值权限" : "Deposit Permission",
    miningPermission: isZh ? "挖矿权限" : "Mining Permission",
    tradePermission: isZh ? "交易权限" : "Trade Permission",
    withdrawPermission: isZh ? "提现权限" : "Withdraw Permission",
    mailNotify: isZh ? "邮件通知" : "Mail Notify",
    customerSupport: isZh ? "客服支持" : "Customer Support",
    superAdminProfile: isZh ? "超级管理员资料" : "Super Admin Profile",
    manageSubadmin: isZh ? "管理子管理员" : "Manage Subadmin",
    manageUser: isZh ? "管理用户" : "Manage User",
    theme: isZh ? "主题" : "Theme",
    dark: isZh ? "深色" : "Dark",
    light: isZh ? "浅色" : "Light",
    logout: isZh ? "退出登录" : "Log out",
    loggingOut: isZh ? "正在退出..." : "Logging out...",
  };

  const pushWithPrefs = (basePath: string) => {
    const params = new URLSearchParams();
    if (lang === "zh") params.set("lang", "zh");
    if (theme === "light") params.set("theme", "light");
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const goTab = (t: string) => {
    const isPermissionTarget =
      t === "topups" || t === "mining" || t === "orders" || t === "withdraw";
    setPermissionsFocused(isPermissionTarget);

    const params = new URLSearchParams(sp.toString());
    params.set("tab", t);
    if (!managedBy || managedBy.toUpperCase() === "ALL") {
      params.delete("managedBy");
    } else {
      params.set("managedBy", managedBy);
    }
    router.push(`/admin?${params.toString()}`);
  };
  const goManageAdmin = () => pushWithPrefs("/admin/manage-admin");
  const goManageUser = () => pushWithPrefs("/admin/manage-user");
  const goSuperAdminProfile = () => pushWithPrefs("/admin/superadmin-profile");

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

  const onChangeTheme = (next: SidebarTheme) => {
    const params = new URLSearchParams(sp.toString());
    if (next === "light") {
      params.set("theme", "light");
    } else {
      params.delete("theme");
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
    if (isPermissionTab) {
      setPermissionsOpen(true);
    }
  }, [isPermissionTab]);

  useEffect(() => {
    if (!isDashboardPage) {
      setPermissionsFocused(false);
      return;
    }
    if (isPermissionTab) {
      setPermissionsFocused(false);
    }
  }, [isDashboardPage, isPermissionTab, spKey]);

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
    glow?: boolean,
    suffix?: ReactNode
  ) => (
    <button
      onClick={onClick}
      className={`admin-nav-item w-full rounded-xl px-4 py-2.5 text-left ${
        active ? "is-active" : ""
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span
          className={glow ? "admin-glow-label font-semibold" : undefined}
        >
          {label}
        </span>
        <span className="flex items-center gap-2">
          {typeof badgeCount === "number" && badgeCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-semibold text-white">
              {badgeCount}
            </span>
          ) : null}
          {suffix}
        </span>
      </span>
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-2.5 text-white/95">
      <div className="flex items-center justify-between gap-2">
        <div
          className="admin-brand text-xl font-bold tracking-wide"
        >
          {text.superadmin}
        </div>
        <div className="admin-segmented inline-flex rounded-lg p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onChangeLang("en")}
            className={
              "rounded-md px-2 py-1 font-semibold " +
              (!isZh ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onChangeLang("zh")}
            className={
              "rounded-md px-2 py-1 font-semibold " +
              (isZh ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            中文
          </button>
        </div>
      </div>
      <div className="mt-0.5">
        <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-white/45">{text.theme}</div>
        <div className="admin-segmented inline-flex w-full rounded-xl p-1 text-xs">
          <button
            type="button"
            onClick={() => onChangeTheme("dark")}
            className={
              "flex-1 rounded-lg px-2 py-1.5 font-semibold " +
              (theme === "dark" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            {text.dark}
          </button>
          <button
            type="button"
            onClick={() => onChangeTheme("light")}
            className={
              "flex-1 rounded-lg px-2 py-1.5 font-semibold " +
              (theme === "light" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            {text.light}
          </button>
        </div>
      </div>
      <label className="mt-0.5 block">
        <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-white/45">{text.managedBy}</div>
        <div className="relative">
          <select
            value={managedBy}
            onChange={(e) => onChangeManagedBy(e.target.value)}
            disabled={managersLoading}
            className="admin-control admin-select w-full rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option value="ALL">
              {text.allUsers}
            </option>
            <option value="UNASSIGNED">
              {text.unassigned}
            </option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.username || m.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <span className="admin-select-chevron" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]">
              <path d="M6.75 9.25 12 14.75l5.25-5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </label>

      {item(text.overview, isDashboardPage && tab === "overview" && !permissionsFocused, () => goTab("overview"))}
      {item(text.userControl, isDashboardPage && tab === "users" && !permissionsFocused, () => goTab("users"))}
      {item(
        text.permissions,
        isPermissionsActive,
        () =>
          setPermissionsOpen((prev) => {
            const next = !prev;
            setPermissionsFocused(next);
            return next;
          }),
        isPermissionsActive ? 0 : pendingDepositCount + pendingWithdrawCount,
        false,
        <span className={`admin-nav-chevron ${permissionsOpen ? "is-open" : ""}`} aria-hidden>
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]">
            <path d="M6.75 9.25 12 14.75l5.25-5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      {permissionsOpen ? (
        <div className="space-y-2 pl-2.5">
          {item(
            text.depositPermission,
            isDashboardPage && tab === "topups",
            () => goTab("topups"),
            pendingDepositCount
          )}
          {item(text.miningPermission, isDashboardPage && tab === "mining", () => goTab("mining"))}
          {item(text.tradePermission, isDashboardPage && tab === "orders", () => goTab("orders"))}
          {item(
            text.withdrawPermission,
            isDashboardPage && tab === "withdraw",
            () => goTab("withdraw"),
            pendingWithdrawCount
          )}
        </div>
      ) : null}
      {item(
        text.mailNotify,
        isDashboardPage && tab === "notify" && !permissionsFocused,
        () => goTab("notify"),
        isDashboardPage && tab === "notify" ? 0 : pendingNotifyCount
      )}
      {item(
        text.customerSupport,
        isDashboardPage && tab === "support" && !permissionsFocused,
        () => goTab("support"),
        isDashboardPage && tab === "support" ? 0 : pendingSupportCount
      )}

      <div className="mt-1.5 space-y-2 border-t border-white/10 pt-2.5">
        {item(
          text.superAdminProfile,
          pathname === "/admin/superadmin-profile",
          goSuperAdminProfile
        )}
        {item(text.manageSubadmin, pathname === "/admin/manage-admin", goManageAdmin)}
        {item(text.manageUser, pathname === "/admin/manage-user", goManageUser)}
      </div>

      <div className="mt-auto border-t border-white/10 pt-2.5">
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={logoutLoading}
          className="w-full rounded-xl border border-rose-400/35 bg-gradient-to-br from-rose-500/85 to-fuchsia-500/70 px-4 py-2.5 text-left font-semibold text-white shadow-[0_10px_24px_rgba(190,24,93,0.35)] disabled:opacity-60"
        >
          {logoutLoading ? text.loggingOut : text.logout}
        </button>
        {logoutErr ? <div className="mt-2 text-xs text-red-300">{logoutErr}</div> : null}
      </div>
    </div>
  );
}
