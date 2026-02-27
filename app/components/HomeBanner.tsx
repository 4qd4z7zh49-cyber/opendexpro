"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getUserAuthHeaders } from "@/lib/clientAuth";

type Theme = "dark" | "light";

type Holdings = Record<string, number>;
type WalletResp = {
  ok?: boolean;
  error?: string;
  holdings?: Holdings;
};
type PriceResp = {
  ok?: boolean;
  error?: string;
  priceUSDT?: Record<string, number | null>;
};

type Profile = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  role: string | null;
  created_at: string | null;
  invitation_code: string | null;
};

type ProfileResp = {
  ok?: boolean;
  error?: string;
  profile?: Profile;
};

type NotificationStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "FROZEN";
type NotificationSource = "TRADE" | "MINING" | "DEPOSIT" | "WITHDRAW" | "NOTIFY" | "SUPPORT";

type NotificationItem = {
  id: string;
  sourceId?: string;
  source: NotificationSource;
  status: NotificationStatus;
  title: string;
  detail: string;
  fullText: string;
  createdAt: number;
  rawStatus: string;
};

type NotificationApiResp = {
  ok?: boolean;
  error?: string;
  items?: Array<{
    id?: string;
    source?: string;
    status?: string;
    title?: string;
    detail?: string;
    fullText?: string;
    createdAt?: string;
    rawStatus?: string;
  }>;
};

type TradeNotificationRow = {
  id?: string;
  source?: string;
  status?: string;
  side?: string;
  asset?: string;
  amountUSDT?: number;
  profitUSDT?: number | null;
  createdAt?: number;
  updatedAt?: number;
};

const TRADE_NOTI_KEY_PREFIX = "opendex.trade.notifications.v2";
const NOTI_REFRESH_MS = 7_000;

function fmtMoney(v: number) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function fmtDateTime(v: number) {
  if (!Number.isFinite(v) || v <= 0) return "-";
  return new Date(v).toLocaleString();
}

function toTs(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const ts = Date.parse(String(v || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeNotificationStatus(v: unknown): NotificationStatus {
  const s = String(v || "").toUpperCase();
  if (s === "CONFIRMED" || s === "ACTIVE" || s === "COMPLETED") return "CONFIRMED";
  if (s === "FROZEN" || s === "FREEZE") return "FROZEN";
  if (s === "REJECTED" || s === "ABORTED") return "REJECTED";
  return "PENDING";
}

function normalizeNotificationSource(v: unknown): NotificationSource {
  const s = String(v || "").toUpperCase();
  if (
    s === "TRADE" ||
    s === "MINING" ||
    s === "DEPOSIT" ||
    s === "WITHDRAW" ||
    s === "NOTIFY" ||
    s === "SUPPORT"
  ) {
    return s as NotificationSource;
  }
  return "DEPOSIT";
}

function fmtAmount(v: unknown, maxDigits = 2) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

function tradeNotiKeyForUser(userId: string | null | undefined) {
  const id = String(userId || "").trim();
  if (!id) return "";
  return `${TRADE_NOTI_KEY_PREFIX}.${id}`;
}

function loadTradeNotificationsLocal(userId: string | null | undefined): NotificationItem[] {
  const storageKey = tradeNotiKeyForUser(userId);
  if (!storageKey) return [];
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: unknown, index: number) => {
      const row = (item as TradeNotificationRow) || {};
      const status = normalizeNotificationStatus(row.status);
      const side = String(row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
      const asset = String(row.asset || "BTC").toUpperCase();
      const amountText = fmtAmount(row.amountUSDT, 2);
      const profit = Number(row.profitUSDT);

      let detail = `${side} ${asset} · ${amountText} USDT`;
      if (status === "PENDING") {
        detail = `${detail} is pending.`;
      } else if (Number.isFinite(profit)) {
        detail = `${detail} settled (${profit >= 0 ? "+" : ""}${fmtAmount(profit, 2)} USDT).`;
      } else {
        detail = `${detail} settled.`;
      }

      return {
        id: `trade-${String(row.id || `legacy-${index}`)}`,
        sourceId: String(row.id || `legacy-${index}`),
        source: "TRADE" as const,
        status,
        title: `Trade ${status === "PENDING" ? "Pending" : "Confirmed"}`,
        detail,
        fullText: detail,
        createdAt: toTs(row.updatedAt ?? row.createdAt),
        rawStatus: String(row.status || ""),
      };
    });
  } catch {
    return [];
  }
}

function statusBadgeClass(status: NotificationStatus, theme: Theme) {
  if (status === "CONFIRMED") {
    return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  }
  if (status === "FROZEN") {
    return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  }
  if (status === "REJECTED") {
    return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  }
  return theme === "light"
    ? "border-amber-400/50 bg-amber-500/20 text-amber-700"
    : "border-amber-400/40 bg-amber-500/15 text-amber-200";
}

function sourceLabel(source: NotificationSource) {
  if (source === "DEPOSIT") return "Deposit";
  if (source === "MINING") return "Mining";
  if (source === "WITHDRAW") return "Withdraw";
  if (source === "NOTIFY") return "Notify";
  if (source === "SUPPORT") return "Support";
  return "Trade";
}

function notificationStatusLabel(item: NotificationItem) {
  if (item.source === "SUPPORT" || item.source === "NOTIFY") {
    return item.status === "PENDING" ? "UNREAD" : "READ";
  }
  return item.status;
}

export default function HomeBanner({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holdings>({});
  const [prices, setPrices] = useState<Record<string, number | null>>({ USDT: 1 });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutErr, setLogoutErr] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationErr, setNotificationErr] = useState("");
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [notificationReadLoading, setNotificationReadLoading] = useState(false);

  const authHeaders = useCallback(async () => {
    return getUserAuthHeaders();
  }, []);

  const refreshWallet = useCallback(async () => {
    const headers = await authHeaders();
    const r = await fetch("/api/wallet/state", {
      cache: "no-store",
      headers,
    });
    const j = (await r.json().catch(() => ({}))) as WalletResp;
    if (!r.ok || !j?.ok || !j.holdings) return;
    setHoldings(j.holdings);
  }, [authHeaders]);

  const refreshPrices = useCallback(async () => {
    const r = await fetch("/api/prices", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as PriceResp;
    if (!j?.ok || !j.priceUSDT) return;
    setPrices(j.priceUSDT);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const r = await fetch("/api/profile", {
        cache: "no-store",
        headers,
      });
      const j = (await r.json().catch(() => ({}))) as ProfileResp;
      if (!r.ok || !j?.ok || !j.profile) {
        throw new Error(j?.error || "Failed to load profile");
      }
      setProfile(j.profile);
      setProfileErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load profile";
      setProfileErr(message);
    }
  }, [authHeaders]);

  const refreshNotifications = useCallback(async () => {
    try {
      const localTradeItems = loadTradeNotificationsLocal(profile?.id);
      const headers = await authHeaders();
      const r = await fetch("/api/notifications", {
        cache: "no-store",
        headers,
      });
      const j = (await r.json().catch(() => ({}))) as NotificationApiResp;
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || "Failed to load notifications");
      }

      const remoteItems: NotificationItem[] = Array.isArray(j.items)
        ? j.items.map((item, index) => {
            const source = normalizeNotificationSource(item.source);
            const status = normalizeNotificationStatus(item.status);
            const title = String(item.title || `${sourceLabel(source)} ${status}`);
            const detail = String(item.detail || "");
            const fullText = String(item.fullText || detail || title);
            const createdAt = toTs(item.createdAt);
            const sourceId = String(item.id || index);
            return {
              id: `${source.toLowerCase()}-${sourceId}`,
              sourceId,
              source,
              status,
              title,
              detail,
              fullText,
              createdAt,
              rawStatus: String(item.rawStatus || item.status || ""),
            };
          })
        : [];

      const map = new Map<string, NotificationItem>();
      [...localTradeItems, ...remoteItems].forEach((item) => {
        const key = `${item.source}:${item.id}`;
        const prev = map.get(key);
        if (!prev || item.createdAt >= prev.createdAt) {
          map.set(key, item);
        }
      });

      const next = Array.from(map.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 80);

      setNotifications(next);
      setNotificationErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load notifications";
      setNotificationErr(message);
      setNotifications(loadTradeNotificationsLocal(profile?.id));
    } finally {
      setNotificationLoading(false);
    }
  }, [authHeaders, profile?.id]);

  const toggleNotifications = useCallback(() => {
    setNotificationOpen((prev) => {
      const next = !prev;
      if (next) {
        void refreshNotifications();
      }
      return next;
    });
  }, [refreshNotifications]);

  const markNotificationRead = useCallback(
    async (notificationId: string, source: NotificationSource = "NOTIFY") => {
      const id = String(notificationId || "").trim();
      if (!id) return;
      setNotificationReadLoading(true);
      try {
        const headers = await authHeaders();
        headers["Content-Type"] = "application/json";
        const r = await fetch("/api/notifications/read", {
          method: "POST",
          headers,
          body: JSON.stringify({
            source,
            sourceId: id,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || "Failed to mark notification as read");
        }
        await refreshNotifications();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to mark notification as read";
        setNotificationErr(message);
      } finally {
        setNotificationReadLoading(false);
      }
    },
    [authHeaders, refreshNotifications]
  );

  const openNotificationDetail = useCallback(
    async (item: NotificationItem) => {
      setSelectedNotification(item);
      setNotificationOpen(false);
      if (
        (item.source === "NOTIFY" || item.source === "SUPPORT") &&
        item.status === "PENDING" &&
        item.sourceId
      ) {
        await markNotificationRead(item.sourceId, item.source);
        setNotifications((prev) =>
          prev.map((row) =>
            row.source === item.source && row.sourceId === item.sourceId
              ? { ...row, status: "CONFIRMED" }
              : row
          )
        );
        setSelectedNotification((prev) =>
          prev && prev.source === item.source && prev.sourceId === item.sourceId
            ? { ...prev, status: "CONFIRMED" }
            : prev
        );
      }
    },
    [markNotificationRead]
  );

  const handleLogout = useCallback(async () => {
    try {
      setLogoutLoading(true);
      setLogoutErr("");
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setProfileOpen(false);
      router.replace("/login");
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to log out";
      setLogoutErr(message);
    } finally {
      setLogoutLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const run = () => {
      void refreshWallet();
      void refreshPrices();
    };
    const kick = window.setTimeout(run, 0);
    const t = window.setInterval(() => {
      run();
    }, 5_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, [refreshPrices, refreshWallet]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const run = () => {
      void refreshNotifications();
    };
    const kick = window.setTimeout(run, 0);
    const t = window.setInterval(() => {
      run();
    }, NOTI_REFRESH_MS);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, [refreshNotifications]);

  const totalBalance = useMemo(() => {
    const entries = Object.entries(holdings);
    if (!entries.length) return 0;
    return entries.reduce((sum, [asset, amount]) => {
      const a = Number(amount || 0);
      const p = asset === "USDT" ? 1 : Number(prices[asset] ?? 0);
      if (!Number.isFinite(a) || !Number.isFinite(p)) return sum;
      return sum + a * p;
    }, 0);
  }, [holdings, prices]);

  const profileName = profile?.username || "User";
  const profileCountry = profile?.country || "Global";
  const profileRole = profile?.role || "user";
  const pendingNotificationCount = useMemo(
    () => notifications.filter((item) => item.status === "PENDING").length,
    [notifications]
  );

  return (
    <>
      <section className="hbCard">
        <div className="hbTopBar">
          <button
            type="button"
            className="hbIconBtn"
            aria-label="Profile"
            onClick={() => router.push("/settings")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 21a8 8 0 0 0-16 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="hbIconBtn"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>

            <div className="relative">
              <button
                className="hbIconBtn hbBell"
                aria-label="Notifications"
                aria-expanded={notificationOpen}
                aria-haspopup="dialog"
                type="button"
                onClick={toggleNotifications}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M15 17H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path
                    d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {pendingNotificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_rgba(0,0,0,.45)]">
                    {pendingNotificationCount > 99 ? "99+" : pendingNotificationCount}
                  </span>
                ) : notifications.length > 0 ? (
                  <span className="hbDot" />
                ) : null}
              </button>
            </div>
          </div>
        </div>

        <div className="hbText">
          <div className="hbSmall">Welcome back</div>
          <div className="hbTitleWrap">
            <div className="hbTitle hbTitleMain">opendex</div>
            <div className="hbBrandSub">AI-POWERED FINANCIAL EXPERIENCE</div>
          </div>

          <div
            className={[
              "mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl px-3 py-1.5 text-xs",
              theme === "light"
                ? "border border-slate-300 bg-white/80 text-slate-700"
                : "border border-white/10 bg-black/20 text-white/80",
            ].join(" ")}
          >
            <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white/90"}>
              {profileName}
            </span>
            <span>•</span>
            <span>{profileCountry}</span>
            <span>•</span>
            <span className="uppercase">{profileRole}</span>
          </div>

          <div className="hbBalanceRow">
            <div className="hbBalanceLabel">Total Balance</div>
            <div className="hbBalanceValue">{fmtMoney(totalBalance)}</div>
          </div>

          <div className="hbActions">
            <Link href="/deposit" className="hbAction hbPrimary">
              Deposit
            </Link>
            <Link href="/withdraw" className="hbAction hbGhost">
              Withdraw
            </Link>
            <button className="hbAction hbGhost" type="button">
              Trade
            </button>
          </div>
        </div>
      </section>

      {notificationOpen ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setNotificationOpen(false)}
            className="fixed inset-0 z-[9998] bg-black/55 backdrop-blur-[2px]"
          />
          <div
            className={[
              "fixed left-3 right-3 top-24 z-[9999] max-h-[72vh] overflow-hidden rounded-2xl border p-3 shadow-[0_28px_80px_rgba(0,0,0,.75)]",
              "sm:left-auto sm:right-6 sm:w-[min(92vw,400px)]",
              theme === "light"
                ? "border-slate-300 bg-white text-slate-900"
                : "border-white/15 bg-[#111217] text-white",
            ].join(" ")}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Notifications</div>
              <button
                type="button"
                onClick={() => {
                  void refreshNotifications();
                }}
                className={[
                  "rounded-lg border px-2 py-1 text-[11px]",
                  theme === "light"
                    ? "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-white/15 bg-[#1b1d24] text-white/80",
                ].join(" ")}
              >
                Refresh
              </button>
            </div>

            {notificationErr ? (
              <div className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">
                {notificationErr}
              </div>
            ) : null}

            {notificationLoading ? (
              <div className={theme === "light" ? "text-xs text-slate-500" : "text-xs text-white/60"}>
                Loading notifications...
              </div>
            ) : null}

            {!notificationLoading && notifications.length === 0 ? (
              <div
                className={[
                  "rounded-lg border px-3 py-2 text-xs",
                  theme === "light"
                    ? "border-slate-300 bg-slate-50 text-slate-500"
                    : "border-white/15 bg-[#151720] text-white/70",
                ].join(" ")}
              >
                No notifications yet.
              </div>
            ) : null}

            {!notificationLoading && notifications.length > 0 ? (
              <div className="max-h-[calc(72vh-128px)] space-y-2 overflow-auto pr-1">
                {notifications.map((item) => (
                  <button
                    type="button"
                    key={`${item.source}-${item.id}`}
                    onClick={() => void openNotificationDetail(item)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      theme === "light"
                        ? "border-slate-300 bg-slate-50 hover:bg-slate-100"
                        : "border-white/15 bg-[#13151c] hover:bg-[#1a1d26]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={theme === "light" ? "text-[11px] text-slate-500" : "text-[11px] text-white/60"}>
                        {sourceLabel(item.source)}
                      </span>
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          statusBadgeClass(item.status, theme),
                        ].join(" ")}
                      >
                        {notificationStatusLabel(item)}
                      </span>
                    </div>
                    <div
                      className={
                        theme === "light"
                          ? "mt-1 line-clamp-2 break-words text-sm font-semibold text-slate-900"
                          : "mt-1 line-clamp-2 break-words text-sm font-semibold text-white"
                      }
                    >
                      {item.title}
                    </div>
                    <div
                      className={
                        theme === "light"
                          ? "mt-1 line-clamp-3 break-words text-xs text-slate-600"
                          : "mt-1 line-clamp-3 break-words text-xs text-white/70"
                      }
                    >
                      {item.detail}
                    </div>
                    <div className={theme === "light" ? "mt-1 text-[11px] text-slate-500" : "mt-1 text-[11px] text-white/50"}>
                      {fmtDateTime(item.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {profileOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className={[
              "w-full max-w-md rounded-3xl border p-5 shadow-[0_20px_70px_rgba(0,0,0,.5)]",
              theme === "light"
                ? "border-slate-300 bg-white text-slate-900"
                : "border-white/10 bg-[#0b0b0d] text-white",
            ].join(" ")}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Profile</div>
                <div className={theme === "light" ? "text-xs text-slate-500" : "text-xs text-white/60"}>
                  Account overview
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className={[
                  "rounded-xl px-3 py-2 text-xs",
                  theme === "light"
                    ? "border border-slate-300 bg-slate-100 text-slate-700"
                    : "border border-white/10 bg-white/[0.04] text-white/90",
                ].join(" ")}
              >
                Close
              </button>
            </div>

            {profileErr ? (
              <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {profileErr}
              </div>
            ) : null}
            {logoutErr ? (
              <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {logoutErr}
              </div>
            ) : null}

            <div className={theme === "light" ? "space-y-2 text-sm text-slate-700" : "space-y-2 text-sm text-white/80"}>
              <div>
                Username: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{profile?.username || "-"}</span>
              </div>
              <div>
                Email: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{profile?.email || "-"}</span>
              </div>
              <div>
                Phone: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{profile?.phone || "-"}</span>
              </div>
              <div>
                Country: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{profile?.country || "-"}</span>
              </div>
              <div>
                Role: <span className={theme === "light" ? "font-semibold uppercase text-slate-900" : "font-semibold uppercase text-white"}>{profile?.role || "user"}</span>
              </div>
              <div>
                Member since: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{fmtDate(profile?.created_at)}</span>
              </div>
              <div>
                Invitation code: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{profile?.invitation_code || "-"}</span>
              </div>
              <div className="break-all">
                User ID: <span className={theme === "light" ? "font-semibold text-slate-900" : "font-semibold text-white"}>{profile?.id || "-"}</span>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <Link
                href="/settings"
                className={[
                  "inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                  theme === "light"
                    ? "bg-slate-900 text-white"
                    : "bg-blue-600 text-white",
                ].join(" ")}
              >
                Open Settings
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={logoutLoading}
                className={[
                  "inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  theme === "light"
                    ? "border border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
                    : "border border-rose-400/30 bg-rose-600/90 text-white hover:bg-rose-500",
                ].join(" ")}
              >
                {logoutLoading ? "Logging out..." : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedNotification ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className={[
              "w-full max-w-md rounded-3xl border p-5 shadow-[0_20px_70px_rgba(0,0,0,.5)]",
              theme === "light"
                ? "border-slate-300 bg-white text-slate-900"
                : "border-white/10 bg-[#0b0b0d] text-white",
            ].join(" ")}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{selectedNotification.title}</div>
                <div className={theme === "light" ? "text-xs text-slate-500" : "text-xs text-white/60"}>
                  {sourceLabel(selectedNotification.source)} ·{" "}
                  {notificationStatusLabel(selectedNotification)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className={[
                  "rounded-xl px-3 py-2 text-xs",
                  theme === "light"
                    ? "border border-slate-300 bg-slate-100 text-slate-700"
                    : "border border-white/10 bg-white/[0.04] text-white/90",
                ].join(" ")}
              >
                Close
              </button>
            </div>

            <div className={theme === "light" ? "text-xs text-slate-500" : "text-xs text-white/60"}>
              {fmtDateTime(selectedNotification.createdAt)}
            </div>

            <div
              className={[
                "mt-3 whitespace-pre-wrap rounded-xl border p-3 text-sm leading-relaxed",
                theme === "light"
                  ? "border-slate-300 bg-slate-50 text-slate-800"
                  : "border-white/15 bg-[#161923] text-white/90",
              ].join(" ")}
            >
              {selectedNotification.fullText || selectedNotification.detail}
            </div>

            {notificationReadLoading &&
            (selectedNotification.source === "NOTIFY" || selectedNotification.source === "SUPPORT") ? (
              <div className={theme === "light" ? "mt-3 text-xs text-slate-500" : "mt-3 text-xs text-white/60"}>
                Marking as read...
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
