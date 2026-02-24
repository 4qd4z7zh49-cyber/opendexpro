"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
type WithdrawStatus = "PENDING" | "CONFIRMED" | "FROZEN";
type FilterStatus = "ALL" | WithdrawStatus;
type Action = "CONFIRM" | "FROZEN";

type WithdrawRequest = {
  id: string;
  userId: string;
  adminId?: string | null;
  username?: string | null;
  email?: string | null;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: WithdrawStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResp = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  requests?: WithdrawRequest[];
};

type ActionResp = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  request?: WithdrawRequest;
};

type WithdrawRequestsPanelProps = {
  readOnly?: boolean;
};

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

function fmtWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function fmtAmount(value: number, asset: Asset) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: asset === "USDT" ? 2 : 8,
  });
}

function statusBadgeClass(status: WithdrawStatus) {
  if (status === "CONFIRMED") return "border-emerald-300/30 bg-emerald-500/10 text-emerald-200";
  if (status === "FROZEN") return "border-rose-300/30 bg-rose-500/10 text-rose-200";
  return "border-amber-300/30 bg-amber-500/10 text-amber-200";
}

export default function WithdrawRequestsPanel({ readOnly = false }: WithdrawRequestsPanelProps) {
  const sp = useSearchParams();
  const managedBy = String(sp.get("managedBy") || "ALL").trim() || "ALL";
  const isZh = sp.get("lang") === "zh";
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [rows, setRows] = useState<WithdrawRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const text = {
    title: isZh ? "提现请求" : "Withdraw Requests",
    refresh: isZh ? "刷新" : "Refresh",
    refreshing: isZh ? "刷新中..." : "Refreshing...",
    pendingInList: isZh ? "当前列表待处理：" : "Pending in current list:",
    readOnlyMode: isZh ? "只读模式：已禁用状态更新。" : "Read only mode: status updates are disabled.",
    loading: isZh ? "加载中..." : "Loading...",
    noRequests: isZh ? "暂无提现请求。" : "No withdraw requests.",
    all: isZh ? "全部" : "All",
    pending: isZh ? "待处理" : "Pending",
    confirmed: isZh ? "已确认" : "Confirmed",
    frozen: isZh ? "已冻结" : "Frozen",
    user: isZh ? "用户" : "USER",
    email: isZh ? "邮箱" : "EMAIL",
    asset: isZh ? "资产" : "ASSET",
    amount: isZh ? "金额" : "AMOUNT",
    address: isZh ? "地址" : "ADDRESS",
    status: isZh ? "状态" : "STATUS",
    time: isZh ? "时间" : "TIME",
    action: isZh ? "操作" : "ACTION",
    view: isZh ? "查看" : "VIEW",
    readOnly: isZh ? "只读" : "Read only",
    confirm: isZh ? "确认" : "Confirm",
    freeze: isZh ? "冻结" : "Frozen",
    updating: isZh ? "处理中..." : "...",
    loadFailed: isZh ? "加载提现请求失败" : "Failed to load withdraw requests",
    updateFailed: isZh ? "更新提现状态失败" : "Failed to update withdraw status",
    confirmedInfo: isZh ? "提现已确认。" : "Withdraw confirmed.",
    frozenInfo: isZh ? "提现已冻结。" : "Withdraw frozen.",
  };
  const statusText = (status: WithdrawStatus) => {
    if (!isZh) return status;
    if (status === "PENDING") return "待处理";
    if (status === "CONFIRMED") return "已确认";
    return "已冻结";
  };

  const load = useCallback(async (status: FilterStatus = filter) => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "300");
      if (status !== "ALL") params.set("status", status);
      if (managedBy.toUpperCase() !== "ALL") params.set("managedBy", managedBy);
      const r = await fetch(`/api/admin/withdraw-requests?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await readJson<ListResp>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || text.loadFailed);
      }

      setRows(Array.isArray(j.requests) ? j.requests : []);
      setPendingCount(Number(j.pendingCount ?? 0));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.loadFailed;
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, [filter, managedBy, text.loadFailed]);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const pendingInView = useMemo(
    () => rows.filter((row) => row.status === "PENDING").length,
    [rows]
  );

  const onAction = async (requestId: string, action: Action) => {
    if (readOnly) return;
    setActionLoadingId(requestId);
    setErr("");
    setInfo("");
    try {
      const apiAction = action === "FROZEN" ? "FREEZE" : "CONFIRM";
      const r = await fetch("/api/admin/withdraw-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: apiAction,
        }),
      });
      const j = await readJson<ActionResp>(r);
      if (!r.ok || !j?.ok || !j.request) {
        throw new Error(j?.error || text.updateFailed);
      }

      setRows((prev) =>
        prev.map((row) => (row.id === requestId ? { ...row, ...j.request } : row))
      );
      setPendingCount(Number(j.pendingCount ?? 0));
      setInfo(action === "CONFIRM" ? text.confirmedInfo : text.frozenInfo);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.updateFailed;
      setErr(message);
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-xl font-semibold">{text.title}</div>
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
            {pendingCount}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterStatus)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          >
            <option value="ALL" className="bg-black">{text.all}</option>
            <option value="PENDING" className="bg-black">{text.pending}</option>
            <option value="CONFIRMED" className="bg-black">{text.confirmed}</option>
            <option value="FROZEN" className="bg-black">{text.frozen}</option>
          </select>
          <button
            type="button"
            onClick={() => void load(filter)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            {loading ? text.refreshing : text.refresh}
          </button>
        </div>
      </div>

      <div className="mb-3 text-xs text-white/60">
        {text.pendingInList} {pendingInView}
      </div>
      {readOnly ? <div className="mb-3 text-xs text-amber-200">{text.readOnlyMode}</div> : null}

      {err ? <div className="mb-3 text-sm text-red-300">{err}</div> : null}
      {info ? <div className="mb-3 text-sm text-emerald-300">{info}</div> : null}

      {loading ? <div className="text-white/60">{text.loading}</div> : null}

      {!loading && rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
          {text.noRequests}
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[1120px]">
            <thead className="bg-white/5 text-left text-white/60">
              <tr>
                <th className="px-3 py-3">{text.user}</th>
                <th className="px-3 py-3">{text.email}</th>
                <th className="px-3 py-3">{text.asset}</th>
                <th className="px-3 py-3 text-right">{text.amount}</th>
                <th className="px-3 py-3">{text.address}</th>
                <th className="px-3 py-3">{text.status}</th>
                <th className="px-3 py-3">{text.time}</th>
                <th className="px-3 py-3 text-right">{readOnly ? text.view : text.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = actionLoadingId === row.id;
                return (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-3 py-3">{row.username ?? "-"}</td>
                    <td className="px-3 py-3">{row.email ?? "-"}</td>
                    <td className="px-3 py-3">{row.asset}</td>
                    <td className="px-3 py-3 text-right">{fmtAmount(row.amount, row.asset)}</td>
                    <td className="px-3 py-3 text-xs text-white/80">{row.walletAddress}</td>
                    <td className="px-3 py-3">
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-xs font-semibold",
                          statusBadgeClass(row.status),
                        ].join(" ")}
                      >
                        {statusText(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-white/70">{fmtWhen(row.createdAt)}</td>
                    <td className="px-3 py-3 text-right">
                      {readOnly ? (
                        <span className="text-xs text-white/45">{text.readOnly}</span>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={busy || row.status === "CONFIRMED"}
                            onClick={() => void onAction(row.id, "CONFIRM")}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {busy ? text.updating : text.confirm}
                          </button>
                          <button
                            type="button"
                            disabled={busy || row.status === "FROZEN"}
                            onClick={() => void onAction(row.id, "FROZEN")}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {busy ? text.updating : text.freeze}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
