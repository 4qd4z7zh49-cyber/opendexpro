"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Row = {
  id: string;
  username: string | null;
  role: string | null;
  invitation_code: string | null;
  managed_by: string | null;
  created_at?: string | null;
};

type SubadminResetPasswordResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

type ManagedUserRow = {
  id: string;
  managed_by?: string | null;
  usdt?: number | null;
  balance?: number | null;
  created_at?: string | null;
};

type UsersResponse = {
  users?: ManagedUserRow[];
  error?: string;
};

type ManageAdminSection = "create" | "list" | "performance";

type PerformanceRow = {
  id: string;
  username: string | null;
  invitation_code: string | null;
  managedUsers: number;
  totalUsdt: number;
};

type AdminTransferRow = {
  userId: string;
  amount: number;
  status: string;
  createdAt: string;
};

type AdminTransferResponse = {
  ok?: boolean;
  error?: string;
  requests?: AdminTransferRow[];
};

type FlowPoint = {
  day: string;
  deposit: number;
  withdraw: number;
};

type SubadminDetails = {
  id: string;
  username: string | null;
  invitationCode: string | null;
  managedUsers: number;
  totalUsdt: number;
  deposits: AdminTransferRow[];
  withdraws: AdminTransferRow[];
};

const CHART_RANGE_OPTIONS = [7, 30, 90] as const;
type ChartRangeDays = (typeof CHART_RANGE_OPTIONS)[number];
const DEFAULT_CHART_RANGE: ChartRangeDays = 30;
const MAX_CHART_RANGE = 90;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toDayKey(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dayLabel(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function rowsInLastDays(rows: AdminTransferRow[], days: number) {
  const cutoff = Date.now() - (days - 1) * ONE_DAY_MS;
  return rows.filter((row) => {
    const t = new Date(String(row.createdAt || "")).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function rowsInDateRange(rows: AdminTransferRow[], startDay: string, endDay: string) {
  return rows.filter((row) => {
    const day = toDayKey(String(row.createdAt || ""));
    if (!day) return false;
    return day >= startDay && day <= endDay;
  });
}

function buildFlowSeriesForDateRange(
  deposits: AdminTransferRow[],
  withdraws: AdminTransferRow[],
  startDay: string,
  endDay: string
) {
  const start = new Date(`${startDay}T00:00:00.000Z`);
  const end = new Date(`${endDay}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const days = Math.floor((end.getTime() - start.getTime()) / ONE_DAY_MS) + 1;
  const series: FlowPoint[] = [];
  const indexByDay = new Map<string, number>();

  for (let i = 0; i < days; i += 1) {
    const day = new Date(start.getTime() + i * ONE_DAY_MS).toISOString().slice(0, 10);
    indexByDay.set(day, i);
    series.push({ day, deposit: 0, withdraw: 0 });
  }

  for (const row of deposits) {
    const key = toDayKey(row.createdAt);
    const idx = indexByDay.get(key);
    if (idx === undefined) continue;
    series[idx].deposit += Number(row.amount || 0);
  }

  for (const row of withdraws) {
    const key = toDayKey(row.createdAt);
    const idx = indexByDay.get(key);
    if (idx === undefined) continue;
    series[idx].withdraw += Number(row.amount || 0);
  }

  return series;
}

function buildFlowSeries(deposits: AdminTransferRow[], withdraws: AdminTransferRow[], days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days - 1) * ONE_DAY_MS);
  const series: FlowPoint[] = [];
  const indexByDay = new Map<string, number>();

  for (let i = 0; i < days; i += 1) {
    const day = new Date(start.getTime() + i * ONE_DAY_MS).toISOString().slice(0, 10);
    indexByDay.set(day, i);
    series.push({ day, deposit: 0, withdraw: 0 });
  }

  for (const row of deposits) {
    const key = toDayKey(row.createdAt);
    const idx = indexByDay.get(key);
    if (idx === undefined) continue;
    series[idx].deposit += Number(row.amount || 0);
  }

  for (const row of withdraws) {
    const key = toDayKey(row.createdAt);
    const idx = indexByDay.get(key);
    if (idx === undefined) continue;
    series[idx].withdraw += Number(row.amount || 0);
  }

  return series;
}

function PerformanceLineChart({
  points,
  depositLabel,
  withdrawLabel,
  isLight,
}: {
  points: FlowPoint[];
  depositLabel: string;
  withdrawLabel: string;
  isLight: boolean;
}) {
  const width = 860;
  const height = 280;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 16;
  const padBottom = 28;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const maxY = Math.max(1, ...points.map((p) => Math.max(p.deposit, p.withdraw)));

  const x = (index: number) => {
    if (points.length <= 1) return padLeft;
    return padLeft + (index / (points.length - 1)) * plotWidth;
  };
  const y = (value: number) => padTop + ((maxY - value) / maxY) * plotHeight;

  const linePath = (key: "deposit" | "withdraw") =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point[key])}`)
      .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const chartWrapClass = isLight
    ? "mt-4 rounded-2xl border border-slate-300/70 bg-white/70 p-3"
    : "mt-4 rounded-2xl border border-white/10 bg-black/25 p-3";
  const legendClass = isLight ? "mb-2 flex items-center gap-4 text-xs text-slate-600" : "mb-2 flex items-center gap-4 text-xs text-white/70";
  const gridStroke = isLight ? "rgba(51,65,85,0.22)" : "rgba(255,255,255,0.10)";
  const gridTextFill = isLight ? "rgba(51,65,85,0.78)" : "rgba(255,255,255,0.55)";
  const depositStroke = isLight ? "rgb(14 165 233)" : "rgb(103 232 249)";
  const withdrawStroke = isLight ? "rgb(244 63 94)" : "rgb(253 164 175)";
  const rangeTextClass = isLight
    ? "mt-2 flex items-center justify-between text-[11px] text-slate-600"
    : "mt-2 flex items-center justify-between text-[11px] text-white/55";

  return (
    <div className={chartWrapClass}>
      <div className={legendClass}>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
          {depositLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          {withdrawLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        {ticks.map((tick) => {
          const value = maxY * tick;
          const yy = y(value);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={yy}
                x2={padLeft + plotWidth}
                y2={yy}
                stroke={gridStroke}
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={yy + 4}
                textAnchor="end"
                fontSize="10"
                fill={gridTextFill}
              >
                {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        <path d={linePath("deposit")} fill="none" stroke={depositStroke} strokeWidth="2.5" />
        <path d={linePath("withdraw")} fill="none" stroke={withdrawStroke} strokeWidth="2.5" />
      </svg>
      <div className={rangeTextClass}>
        <span>{dayLabel(points[0]?.day || "")}</span>
        <span>{dayLabel(points[points.length - 1]?.day || "")}</span>
      </div>
    </div>
  );
}

export default function ManageAdminPage() {
  const sp = useSearchParams();
  const isZh = sp.get("lang") === "zh";
  const isLight = sp.get("theme") === "light";
  const [section, setSection] = useState<ManageAdminSection>("create");
  const [rows, setRows] = useState<Row[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [performanceErr, setPerformanceErr] = useState("");
  const [selectedPerformanceId, setSelectedPerformanceId] = useState("");
  const [detailsLoadingId, setDetailsLoadingId] = useState("");
  const [detailsErr, setDetailsErr] = useState("");
  const [detailsBySubadmin, setDetailsBySubadmin] = useState<Record<string, SubadminDetails>>({});
  const [chartRangeDays, setChartRangeDays] = useState<ChartRangeDays>(DEFAULT_CHART_RANGE);
  const [useCustomDateRange, setUseCustomDateRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [customRangeErr, setCustomRangeErr] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [newInvite, setNewInvite] = useState<string | null>(null);
  const [resettingSubadminId, setResettingSubadminId] = useState("");
  const [subadminResetErr, setSubadminResetErr] = useState("");
  const [subadminResetInfo, setSubadminResetInfo] = useState("");
  const text = {
    pageTitle: isZh ? "管理子管理员" : "Manage Subadmin",
    pageDesc: isZh ? "创建子管理员账号并生成邀请码。" : "Create sub-admin accounts + generate invitation codes.",
    createTitle: isZh ? "创建子管理员" : "Create Sub-admin",
    createSection: isZh ? "创建子管理员" : "Create Subadmin",
    listSection: isZh ? "子管理员列表" : "Subadmin List",
    performanceSection: isZh ? "子管理员绩效" : "Subadmin Performance",
    username: isZh ? "用户名" : "Username",
    password: isZh ? "密码" : "Password",
    creating: isZh ? "创建中..." : "Creating...",
    createAndGenerate: isZh ? "创建并生成邀请码" : "Create + Generate code",
    invitation: isZh ? "邀请码" : "Invitation",
    refresh: isZh ? "刷新" : "Refresh",
    listTitle: isZh ? "子管理员列表" : "Sub-admin list",
    performanceTitle: isZh ? "子管理员绩效" : "Sub-admin performance",
    performanceDesc: isZh
      ? "查看每个子管理员管理的用户数量和总 USDT。"
      : "Track managed user counts and total USDT per sub-admin.",
    performanceNoRows: isZh ? "暂无绩效数据。" : "No performance data.",
    subadmin: isZh ? "子管理员" : "SUB-ADMIN",
    users: isZh ? "用户数" : "USERS",
    totalUsdt: isZh ? "总 USDT" : "TOTAL USDT",
    performanceDetails: isZh ? "绩效详情" : "PERFORMANCE DETAILS",
    details: isZh ? "详情" : "Details",
    close: isZh ? "关闭" : "Close",
    detailsFor: isZh ? "绩效详情" : "Performance details",
    customRange: isZh ? "自定义范围" : "Custom range",
    startDate: isZh ? "开始日期" : "Start date",
    endDate: isZh ? "结束日期" : "End date",
    apply: isZh ? "应用" : "Apply",
    reset: isZh ? "重置" : "Reset",
    chooseDateRange: isZh ? "请选择开始与结束日期。" : "Please choose both start and end dates.",
    activeUsers: isZh ? "活跃用户" : "Active users",
    depositTotal: isZh ? "充值总额" : "Deposit total",
    withdrawTotal: isZh ? "提现总额" : "Withdraw total",
    netFlow: isZh ? "净流入" : "Net flow",
    depositRequests: isZh ? "充值笔数" : "Deposit requests",
    withdrawRequests: isZh ? "提现笔数" : "Withdraw requests",
    pendingDeposits: isZh ? "待处理充值" : "Pending deposits",
    pendingWithdraws: isZh ? "待处理提现" : "Pending withdraws",
    depositLabel: isZh ? "充值" : "Deposit",
    withdrawLabel: isZh ? "提现" : "Withdraw",
    totalSubadmins: isZh ? "子管理员总数" : "Total sub-admins",
    totalManagedUsers: isZh ? "管理用户总数" : "Total managed users",
    topPerformer: isZh ? "最佳表现" : "Top performer",
    none: isZh ? "无" : "None",
    usersSuffix: isZh ? "位用户" : "users",
    loading: isZh ? "加载中..." : "Loading...",
    noRows: isZh ? "暂无子管理员。" : "No sub-admins.",
    invite: isZh ? "邀请码" : "INVITE",
    managedBy: isZh ? "管理者" : "MANAGED BY",
    resetPassword: isZh ? "重置密码" : "RESET PASSWORD",
    created: isZh ? "创建时间" : "CREATED",
    resetButton: isZh ? "重置密码" : "Reset Password",
    resetting: isZh ? "重置中..." : "Resetting...",
    loadFailed: isZh ? "加载失败" : "Failed to load",
    genericFailed: isZh ? "操作失败" : "Failed",
    createFailed: isZh ? "创建失败" : "Create failed",
    subadminFallback: isZh ? "子管理员" : "sub-admin",
    promptPassword: (name: string) =>
      isZh ? `为 ${name} 设置新密码（至少 8 位）。` : `Set new password for ${name} (minimum 8 characters).`,
    confirmPassword: (name: string) =>
      isZh ? `确认 ${name} 的新密码。` : `Confirm new password for ${name}.`,
    min8: isZh ? "新密码至少需要 8 个字符。" : "New password must be at least 8 characters.",
    max72: isZh ? "新密码最多 72 个字符。" : "New password must be at most 72 characters.",
    confirmMismatch: isZh ? "确认密码不匹配。" : "Confirm password does not match.",
    resetFailed: isZh ? "重置子管理员密码失败" : "Failed to reset sub-admin password",
    resetDone: (name: string) =>
      isZh ? `${name} 的密码重置已完成。` : `Password reset completed for ${name}.`,
  };

  const detailsButtonClass = isLight
    ? "rounded-lg border border-cyan-500/45 bg-cyan-100 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-200 disabled:opacity-60"
    : "rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-60";
  const modalBackdropClass = isLight
    ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
    : "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4";
  const modalPanelClass = isLight
    ? "max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-sky-300/45 bg-gradient-to-br from-slate-50/95 to-blue-50/95 p-4 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.25)] sm:p-5"
    : "max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-cyan-300/20 bg-neutral-950 p-4 sm:p-5";
  const modalCloseButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs text-slate-700 hover:bg-white"
    : "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10";
  const modalMetricCardClass = isLight
    ? "rounded-xl border border-slate-300/70 bg-white/75 p-3"
    : "rounded-xl border border-white/10 bg-black/25 p-3";
  const modalMetricLabelClass = isLight
    ? "text-xs uppercase tracking-wide text-slate-500"
    : "text-xs uppercase tracking-wide text-white/55";
  const modalTitleClass = isLight ? "text-sm font-medium text-slate-700" : "text-sm font-medium text-white/80";
  const modalRangeGroupClass = isLight
    ? "inline-flex rounded-xl border border-slate-300 bg-white/70 p-1 text-xs"
    : "inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs";
  const modalRangeInactiveClass = isLight ? "text-slate-600 hover:bg-slate-100" : "text-white/70 hover:bg-white/10";
  const modalCalendarInactiveClass = isLight
    ? "border-slate-300 bg-white/80 text-slate-700 hover:bg-white"
    : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10";
  const modalDatePickerClass = isLight
    ? "mt-3 rounded-xl border border-slate-300 bg-white/75 p-3"
    : "mt-3 rounded-xl border border-white/10 bg-black/25 p-3";
  const modalDateLabelClass = isLight ? "mb-1 text-xs text-slate-500" : "mb-1 text-xs text-white/60";
  const modalDateInputClass = isLight
    ? "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
    : "w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none";
  const modalApplyClass = isLight
    ? "rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600"
    : "rounded-lg bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400";
  const modalResetClass = isLight
    ? "rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs text-slate-700 hover:bg-white"
    : "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10";
  const modalSubtleClass = isLight ? "text-slate-600" : "text-white/60";
  const createGenerateButtonClass = isLight
    ? "rounded-xl border border-sky-500/45 bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
    : "rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-60";
  const subadminResetButtonClass = isLight
    ? "rounded-lg border border-amber-500/45 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-60"
    : "rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-60";

  const performanceRows = useMemo<PerformanceRow[]>(() => {
    const byManager = new Map<string, { managedUsers: number; totalUsdt: number }>();

    for (const user of managedUsers) {
      const managerId = String(user.managed_by || "").trim();
      if (!managerId) continue;

      const prev = byManager.get(managerId) ?? { managedUsers: 0, totalUsdt: 0 };
      prev.managedUsers += 1;
      prev.totalUsdt += Number(user.usdt ?? user.balance ?? 0);
      byManager.set(managerId, prev);
    }

    return rows
      .map((row) => {
        const agg = byManager.get(row.id) ?? { managedUsers: 0, totalUsdt: 0 };
        return {
          id: row.id,
          username: row.username,
          invitation_code: row.invitation_code,
          managedUsers: agg.managedUsers,
          totalUsdt: agg.totalUsdt,
        };
      })
      .sort((a, b) => {
        if (b.managedUsers !== a.managedUsers) return b.managedUsers - a.managedUsers;
        return b.totalUsdt - a.totalUsdt;
      });
  }, [managedUsers, rows]);

  const totalManagedUsers = useMemo(
    () => performanceRows.reduce((sum, row) => sum + row.managedUsers, 0),
    [performanceRows]
  );

  const topPerformer = performanceRows[0] ?? null;
  const selectedPerformanceRow = useMemo(
    () => performanceRows.find((row) => row.id === selectedPerformanceId) ?? null,
    [performanceRows, selectedPerformanceId]
  );
  const selectedDetails = selectedPerformanceId ? detailsBySubadmin[selectedPerformanceId] ?? null : null;
  const normalizedCustomRange = useMemo(() => {
    if (!customStartDate || !customEndDate) return null;
    if (customStartDate <= customEndDate) return { start: customStartDate, end: customEndDate };
    return { start: customEndDate, end: customStartDate };
  }, [customStartDate, customEndDate]);
  const rangeDeposits = useMemo(() => {
    if (!selectedDetails) return [];
    if (useCustomDateRange && normalizedCustomRange) {
      return rowsInDateRange(selectedDetails.deposits, normalizedCustomRange.start, normalizedCustomRange.end);
    }
    return rowsInLastDays(selectedDetails.deposits, chartRangeDays);
  }, [selectedDetails, useCustomDateRange, normalizedCustomRange, chartRangeDays]);
  const rangeWithdraws = useMemo(() => {
    if (!selectedDetails) return [];
    if (useCustomDateRange && normalizedCustomRange) {
      return rowsInDateRange(selectedDetails.withdraws, normalizedCustomRange.start, normalizedCustomRange.end);
    }
    return rowsInLastDays(selectedDetails.withdraws, chartRangeDays);
  }, [selectedDetails, useCustomDateRange, normalizedCustomRange, chartRangeDays]);
  const selectedChartPoints = useMemo(
    () => {
      if (!selectedDetails) return [];
      if (useCustomDateRange && normalizedCustomRange) {
        return buildFlowSeriesForDateRange(
          rangeDeposits,
          rangeWithdraws,
          normalizedCustomRange.start,
          normalizedCustomRange.end
        );
      }
      return buildFlowSeries(rangeDeposits, rangeWithdraws, chartRangeDays);
    },
    [
      selectedDetails,
      useCustomDateRange,
      normalizedCustomRange,
      rangeDeposits,
      rangeWithdraws,
      chartRangeDays,
    ]
  );
  const selectedRangeMetrics = useMemo(() => {
    if (!selectedDetails) return null;
    const activeUsers = new Set<string>();

    for (const row of rangeDeposits) {
      const userId = String(row.userId || "").trim();
      if (userId) activeUsers.add(userId);
    }
    for (const row of rangeWithdraws) {
      const userId = String(row.userId || "").trim();
      if (userId) activeUsers.add(userId);
    }

    const depositTotal = rangeDeposits.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const withdrawTotal = rangeWithdraws.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const pendingDepositCount = rangeDeposits.filter(
      (row) => String(row.status || "").trim().toUpperCase() === "PENDING"
    ).length;
    const pendingWithdrawCount = rangeWithdraws.filter(
      (row) => String(row.status || "").trim().toUpperCase() === "PENDING"
    ).length;

    return {
      activeUsers: activeUsers.size,
      depositTotal,
      withdrawTotal,
      netFlow: depositTotal - withdrawTotal,
      depositCount: rangeDeposits.length,
      withdrawCount: rangeWithdraws.length,
      pendingDepositCount,
      pendingWithdrawCount,
    };
  }, [selectedDetails, rangeDeposits, rangeWithdraws]);
  const metricPeriodLabel = useMemo(() => {
    if (useCustomDateRange && normalizedCustomRange) {
      return isZh
        ? `${normalizedCustomRange.start} 至 ${normalizedCustomRange.end}`
        : `${normalizedCustomRange.start} to ${normalizedCustomRange.end}`;
    }
    return isZh ? `近 ${chartRangeDays} 天` : `${chartRangeDays}d`;
  }, [useCustomDateRange, normalizedCustomRange, isZh, chartRangeDays]);

  async function openPerformanceDetails(row: PerformanceRow) {
    const endDefault = new Date().toISOString().slice(0, 10);
    const startDefault = new Date(
      Date.now() - (DEFAULT_CHART_RANGE - 1) * ONE_DAY_MS
    )
      .toISOString()
      .slice(0, 10);
    setSelectedPerformanceId(row.id);
    setDetailsErr("");
    setCustomRangeErr("");
    setChartRangeDays(DEFAULT_CHART_RANGE);
    setUseCustomDateRange(false);
    setDatePickerOpen(false);
    setCustomStartDate(startDefault);
    setCustomEndDate(endDefault);

    if (detailsBySubadmin[row.id]) return;

    setDetailsLoadingId(row.id);
    try {
      const from = new Date(Date.now() - (MAX_CHART_RANGE - 1) * ONE_DAY_MS).toISOString();
      const query = new URLSearchParams({
        status: "ALL",
        limit: "2000",
        managedBy: row.id,
        from,
      }).toString();

      const [depRes, wdRes] = await Promise.all([
        fetch(`/api/admin/deposit-requests?${query}`, { cache: "no-store" }),
        fetch(`/api/admin/withdraw-requests?${query}`, { cache: "no-store" }),
      ]);

      const depJson = (await depRes.json().catch(() => ({}))) as AdminTransferResponse;
      const wdJson = (await wdRes.json().catch(() => ({}))) as AdminTransferResponse;
      if (!depRes.ok) throw new Error(depJson?.error || text.loadFailed);
      if (!wdRes.ok) throw new Error(wdJson?.error || text.loadFailed);

      const deposits = Array.isArray(depJson.requests) ? depJson.requests : [];
      const withdraws = Array.isArray(wdJson.requests) ? wdJson.requests : [];

      const detail: SubadminDetails = {
        id: row.id,
        username: row.username,
        invitationCode: row.invitation_code,
        managedUsers: row.managedUsers,
        totalUsdt: row.totalUsdt,
        deposits,
        withdraws,
      };

      setDetailsBySubadmin((prev) => ({ ...prev, [row.id]: detail }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.loadFailed;
      setDetailsErr(message);
    } finally {
      setDetailsLoadingId("");
    }
  }

  function closePerformanceModal() {
    setSelectedPerformanceId("");
    setDetailsErr("");
    setCustomRangeErr("");
    setDatePickerOpen(false);
  }

  function applyCustomDateRange() {
    if (!customStartDate || !customEndDate) {
      setCustomRangeErr(text.chooseDateRange);
      return;
    }
    setCustomRangeErr("");
    setUseCustomDateRange(true);
    setDatePickerOpen(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setPerformanceErr("");
    try {
      const [subadminRes, usersRes] = await Promise.all([
        fetch("/api/admin/subadmins"),
        fetch("/api/admin/users"),
      ]);

      const subadminJson = await subadminRes.json().catch(() => ({}));
      const usersJson = (await usersRes.json().catch(() => ({}))) as UsersResponse;

      if (!subadminRes.ok) throw new Error(subadminJson?.error || text.loadFailed);
      setRows(Array.isArray(subadminJson?.subadmins) ? subadminJson.subadmins : []);

      if (!usersRes.ok) {
        setManagedUsers([]);
        setPerformanceErr(usersJson?.error || text.loadFailed);
      } else {
        setManagedUsers(Array.isArray(usersJson?.users) ? usersJson.users : []);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.genericFailed;
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, [text.genericFailed, text.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    setErr("");
    setNewInvite(null);
    try {
      const r = await fetch("/api/admin/subadmins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || text.createFailed);

      setNewInvite(j?.subadmin?.invitation_code ?? null);
      setUsername("");
      setPassword("");
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.createFailed;
      setErr(message);
    } finally {
      setCreating(false);
    }
  }

  async function resetSubadminPassword(row: Row) {
    const name = String(row.username || text.subadminFallback);
    const input = window.prompt(text.promptPassword(name), "");
    if (input === null) return;

    const newPassword = String(input);
    if (newPassword.length < 8) {
      setSubadminResetErr(text.min8);
      setSubadminResetInfo("");
      return;
    }
    if (newPassword.length > 72) {
      setSubadminResetErr(text.max72);
      setSubadminResetInfo("");
      return;
    }

    const confirmPassword = window.prompt(text.confirmPassword(name), "");
    if (confirmPassword === null) return;
    if (confirmPassword !== newPassword) {
      setSubadminResetErr(text.confirmMismatch);
      setSubadminResetInfo("");
      return;
    }

    setResettingSubadminId(row.id);
    setSubadminResetErr("");
    setSubadminResetInfo("");

    try {
      const res = await fetch("/api/admin/subadmins/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subadminId: row.id,
          newPassword,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as SubadminResetPasswordResponse;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || text.resetFailed);
      }

      setSubadminResetInfo(text.resetDone(name));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.resetFailed;
      setSubadminResetErr(message);
    } finally {
      setResettingSubadminId("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="admin-page-title text-2xl font-semibold">
          {text.pageTitle}
        </div>
        <p className="mt-2 text-white/60">{text.pageDesc}</p>
        <div className="mt-4 inline-flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setSection("create")}
            className={
              "rounded-xl px-3 py-2 text-sm font-medium " +
              (section === "create" ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            {text.createSection}
          </button>
          <button
            type="button"
            onClick={() => setSection("list")}
            className={
              "rounded-xl px-3 py-2 text-sm font-medium " +
              (section === "list" ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            {text.listSection}
          </button>
          <button
            type="button"
            onClick={() => setSection("performance")}
            className={
              "rounded-xl px-3 py-2 text-sm font-medium " +
              (section === "performance" ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10")
            }
          >
            {text.performanceSection}
          </button>
        </div>
      </div>

      {section === "create" ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-semibold">{text.createTitle}</div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            placeholder={text.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            placeholder={text.password}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={create}
            disabled={creating || username.trim().length < 3 || password.length < 4}
            className={createGenerateButtonClass}
          >
            {creating ? text.creating : text.createAndGenerate}
          </button>

          {newInvite ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
              <span className="text-white/60">{text.invitation}:</span>{" "}
              <span className="font-semibold">{newInvite}</span>
            </div>
          ) : null}

          <button
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          >
            {text.refresh}
          </button>
        </div>

        {err ? <div className="mt-3 text-red-400">{err}</div> : null}
        </div>
      ) : null}

      {section === "list" ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 text-lg font-semibold">{text.listTitle}</div>

        {loading ? <div className="text-white/60">{text.loading}</div> : null}
        {!loading && rows.length === 0 ? <div className="text-white/60">{text.noRows}</div> : null}

        {!loading && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{text.username.toUpperCase()}</th>
                  <th className="py-3">{text.invite}</th>
                  <th className="py-3">{text.managedBy}</th>
                  <th className="py-3 text-center">{text.resetPassword}</th>
                  <th className="py-3 text-right">{text.created}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const busy = resettingSubadminId === r.id;
                  return (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="py-3">{r.username ?? "-"}</td>
                      <td className="py-3 font-mono">{r.invitation_code ?? "-"}</td>
                      <td className="py-3 font-mono text-white/70">
                        {r.managed_by ? r.managed_by.slice(0, 12) + "…" : "-"}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resetSubadminPassword(r)}
                          className={subadminResetButtonClass}
                        >
                          {busy ? text.resetting : text.resetButton}
                        </button>
                      </td>
                      <td className="py-3 text-right text-white/70">
                        {(r.created_at || "").toString().slice(0, 10) || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {subadminResetErr ? <div className="mt-3 text-red-400">{subadminResetErr}</div> : null}
        {subadminResetInfo ? <div className="mt-3 text-emerald-300">{subadminResetInfo}</div> : null}
        </div>
      ) : null}

      {section === "performance" ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-lg font-semibold">{text.performanceTitle}</div>
          <p className="mt-1 text-sm text-white/60">{text.performanceDesc}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="text-xs uppercase tracking-wide text-white/55">{text.totalSubadmins}</div>
              <div className="mt-1 text-2xl font-semibold">{rows.length.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="text-xs uppercase tracking-wide text-white/55">{text.totalManagedUsers}</div>
              <div className="mt-1 text-2xl font-semibold">{totalManagedUsers.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="text-xs uppercase tracking-wide text-white/55">{text.topPerformer}</div>
              <div className="mt-1 text-base font-semibold">
                {topPerformer?.username || text.none}
                {topPerformer ? ` (${topPerformer.managedUsers.toLocaleString()} ${text.usersSuffix})` : ""}
              </div>
            </div>
          </div>

          {loading ? <div className="mt-4 text-white/60">{text.loading}</div> : null}
          {performanceErr ? <div className="mt-4 text-red-400">{performanceErr}</div> : null}

          {!loading && !performanceErr && performanceRows.length === 0 ? (
            <div className="mt-4 text-white/60">{text.performanceNoRows}</div>
          ) : null}

          {!loading && !performanceErr && performanceRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead>
                  <tr className="text-left text-white/60">
                    <th className="py-3">{text.subadmin}</th>
                    <th className="py-3">{text.invite}</th>
                    <th className="py-3 text-right">{text.users}</th>
                    <th className="py-3 text-right">{text.totalUsdt}</th>
                    <th className="py-3 text-right">{text.performanceDetails}</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="py-3">{row.username ?? "-"}</td>
                      <td className="py-3 font-mono">{row.invitation_code ?? "-"}</td>
                      <td className="py-3 text-right">{row.managedUsers.toLocaleString()}</td>
                      <td className="py-3 text-right">
                        {row.totalUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void openPerformanceDetails(row)}
                          disabled={detailsLoadingId === row.id}
                          className={detailsButtonClass}
                        >
                          {detailsLoadingId === row.id
                            ? text.loading
                            : text.details}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

        </div>
      ) : null}

      {selectedPerformanceId ? (
        <div
          className={modalBackdropClass}
          onClick={closePerformanceModal}
        >
          <div
            className={modalPanelClass}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">
                {text.detailsFor}: {selectedPerformanceRow?.username || "-"}
              </div>
              <button
                type="button"
                onClick={closePerformanceModal}
                className={modalCloseButtonClass}
              >
                {text.close}
              </button>
            </div>

            {selectedPerformanceRow ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className={modalMetricCardClass}>
                  <div className={modalMetricLabelClass}>{text.invite}</div>
                  <div className="mt-1 font-mono text-base">{selectedPerformanceRow.invitation_code || "-"}</div>
                </div>
                <div className={modalMetricCardClass}>
                  <div className={modalMetricLabelClass}>{text.users}</div>
                  <div className="mt-1 text-xl font-semibold">
                    {selectedPerformanceRow.managedUsers.toLocaleString()}
                  </div>
                </div>
                <div className={modalMetricCardClass}>
                  <div className={modalMetricLabelClass}>{text.totalUsdt}</div>
                  <div className="mt-1 text-xl font-semibold">
                    {selectedPerformanceRow.totalUsdt.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {detailsLoadingId === selectedPerformanceId ? (
              <div className={`mt-3 ${modalSubtleClass}`}>{text.loading}</div>
            ) : null}
            {detailsErr && detailsLoadingId !== selectedPerformanceId ? (
              <div className="mt-3 text-red-400">{detailsErr}</div>
            ) : null}

            {selectedDetails ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh ? `${metricPeriodLabel}${text.activeUsers}` : `${text.activeUsers} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {(selectedRangeMetrics?.activeUsers ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh ? `${metricPeriodLabel}${text.depositTotal}` : `${text.depositTotal} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {(selectedRangeMetrics?.depositTotal ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh ? `${metricPeriodLabel}${text.withdrawTotal}` : `${text.withdrawTotal} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {(selectedRangeMetrics?.withdrawTotal ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh ? `${metricPeriodLabel}${text.netFlow}` : `${text.netFlow} (${metricPeriodLabel})`}
                    </div>
                    <div
                      className={
                        "mt-1 text-2xl font-semibold " +
                        ((selectedRangeMetrics?.netFlow ?? 0) >= 0
                          ? isLight
                            ? "text-emerald-600"
                            : "text-emerald-300"
                          : isLight
                            ? "text-rose-600"
                            : "text-rose-300")
                      }
                    >
                      {(selectedRangeMetrics?.netFlow ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh
                        ? `${metricPeriodLabel}${text.depositRequests}`
                        : `${text.depositRequests} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {(selectedRangeMetrics?.depositCount ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh
                        ? `${metricPeriodLabel}${text.withdrawRequests}`
                        : `${text.withdrawRequests} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {(selectedRangeMetrics?.withdrawCount ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh
                        ? `${metricPeriodLabel}${text.pendingDeposits}`
                        : `${text.pendingDeposits} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {(selectedRangeMetrics?.pendingDepositCount ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className={modalMetricCardClass}>
                    <div className={modalMetricLabelClass}>
                      {isZh
                        ? `${metricPeriodLabel}${text.pendingWithdraws}`
                        : `${text.pendingWithdraws} (${metricPeriodLabel})`}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {(selectedRangeMetrics?.pendingWithdrawCount ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className={modalTitleClass}>
                    {isZh
                      ? `充值/提现趋势 (${metricPeriodLabel})`
                      : `Deposit/Withdraw trend (${metricPeriodLabel})`}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={modalRangeGroupClass}>
                      {CHART_RANGE_OPTIONS.map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            setChartRangeDays(days);
                            setUseCustomDateRange(false);
                            setCustomRangeErr("");
                          }}
                          className={
                            "rounded-lg px-2.5 py-1 " +
                            (!useCustomDateRange && chartRangeDays === days
                              ? isLight
                                ? "bg-cyan-500 text-white"
                                : "bg-white/20 text-white"
                              : modalRangeInactiveClass)
                          }
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDatePickerOpen((prev) => !prev)}
                      className={
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg border " +
                        (useCustomDateRange || datePickerOpen
                          ? isLight
                            ? "border-cyan-500/50 bg-cyan-100 text-cyan-700"
                            : "border-cyan-300/50 bg-cyan-400/10 text-cyan-200"
                          : modalCalendarInactiveClass)
                      }
                      title={text.customRange}
                      aria-label={text.customRange}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                        <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm13 9H4v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7ZM5 6a1 1 0 0 0-1 1v2h16V7a1 1 0 0 0-1-1H5Z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {datePickerOpen ? (
                  <div className={modalDatePickerClass}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <div className={modalDateLabelClass}>{text.startDate}</div>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className={modalDateInputClass}
                        />
                      </label>
                      <label className="block">
                        <div className={modalDateLabelClass}>{text.endDate}</div>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className={modalDateInputClass}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={applyCustomDateRange}
                        className={modalApplyClass}
                      >
                        {text.apply}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomDateRange(false);
                          setCustomRangeErr("");
                          setDatePickerOpen(false);
                        }}
                        className={modalResetClass}
                      >
                        {text.reset}
                      </button>
                    </div>
                    {customRangeErr ? <div className="mt-2 text-xs text-red-400">{customRangeErr}</div> : null}
                  </div>
                ) : null}

                <PerformanceLineChart
                  points={selectedChartPoints}
                  depositLabel={text.depositLabel}
                  withdrawLabel={text.withdrawLabel}
                  isLight={isLight}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
