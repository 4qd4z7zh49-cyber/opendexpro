// app/subadmin/components/SubAdminSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Item = {
  key: "overview" | "topups" | "mining" | "orders" | "withdraw" | "notify" | "support";
  label: string;
};

type SidebarLang = "en" | "zh";
type SidebarTheme = "dark" | "light";

type DepositRequestBadgeResponse = {
  ok?: boolean;
  pendingCount?: number;
};

export default function SubAdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") || "overview").toLowerCase();
  const lang: SidebarLang = sp.get("lang") === "zh" ? "zh" : "en";
  const theme: SidebarTheme = sp.get("theme") === "light" ? "light" : "dark";
  const isZh = lang === "zh";
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutErr, setLogoutErr] = useState("");
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [pendingWithdrawCount, setPendingWithdrawCount] = useState(0);
  const [pendingNotifyCount, setPendingNotifyCount] = useState(0);
  const [pendingSupportCount, setPendingSupportCount] = useState(0);

  const text = {
    subadmin: isZh ? "子管理员" : "Sub-admin",
    dashboard: isZh ? "仪表板" : "Dashboard",
    theme: isZh ? "主题" : "Theme",
    dark: isZh ? "深色" : "Dark",
    light: isZh ? "浅色" : "Light",
    overview: isZh ? "总览" : "Overview",
    depositPermission: isZh ? "充值权限" : "Deposit Permission",
    miningPermission: isZh ? "挖矿权限" : "Mining Permission",
    tradePermission: isZh ? "交易权限" : "Trade Permission",
    withdrawInfo: isZh ? "提现信息" : "Withdraw Info",
    mailNotify: isZh ? "邮件通知" : "Mail Notify",
    customerSupport: isZh ? "客服支持" : "Customer Support",
    loggingOut: isZh ? "正在退出..." : "Logging out...",
    logout: isZh ? "退出登录" : "Log out",
  };

  const items: Item[] = [
    { key: "overview", label: text.overview },
    { key: "topups", label: text.depositPermission },
    { key: "mining", label: text.miningPermission },
    { key: "orders", label: text.tradePermission },
    { key: "withdraw", label: text.withdrawInfo },
    { key: "notify", label: text.mailNotify },
    { key: "support", label: text.customerSupport },
  ];

  const onChangeLang = (next: SidebarLang) => {
    const params = new URLSearchParams(sp.toString());
    if (next === "zh") {
      params.set("lang", "zh");
    } else {
      params.delete("lang");
    }
    if (theme === "light") {
      params.set("theme", "light");
    } else {
      params.delete("theme");
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
    if (lang === "zh") {
      params.set("lang", "zh");
    } else {
      params.delete("lang");
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const hrefForTab = (nextTab: Item["key"]) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", nextTab);
    if (lang === "zh") {
      params.set("lang", "zh");
    } else {
      params.delete("lang");
    }
    if (theme === "light") {
      params.set("theme", "light");
    } else {
      params.delete("theme");
    }
    return `${pathname}?${params.toString()}`;
  };

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
    <div className="flex h-full flex-col text-white/95">
      <div className="px-4 pt-5">
        <div className="admin-brand text-lg font-semibold">{text.subadmin}</div>
        <div className="mt-1 text-sm text-white/60">{text.dashboard}</div>
        <div className="mt-3 inline-flex rounded-lg admin-segmented p-0.5 text-[11px]">
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
        <div className="mt-2">
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
      </div>

      <div className="mt-5 px-2">
        {items.map((it) => {
          const active = tab === it.key;
          const href = hrefForTab(it.key);
          return (
            <Link
              key={it.key}
              href={href}
              className={[
                "admin-nav-item mb-1 flex items-center justify-between rounded-2xl px-3 py-2 text-sm",
                active ? "is-active text-white" : "text-white/70 hover:bg-white/5",
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
          className="w-full rounded-xl border border-rose-400/35 bg-gradient-to-br from-rose-500/85 to-fuchsia-500/70 px-4 py-2 text-left text-sm font-semibold text-white shadow-[0_10px_24px_rgba(190,24,93,0.35)] disabled:opacity-60"
        >
          {logoutLoading ? text.loggingOut : text.logout}
        </button>
        {logoutErr ? <div className="mt-2 text-xs text-red-300">{logoutErr}</div> : null}

        <div className="mt-3 text-xs text-white/40">
          opendex Admin
        </div>
      </div>
    </div>
  );
}
