"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type MiningRow = {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "ABORTED" | "COMPLETED";
  created_at: string;
  activated_at?: string | null;
  note?: string | null;
  username?: string | null;
  email?: string | null;
};

type MiningResp = {
  rows?: MiningRow[];
  error?: string;
};

type MiningApproveResp = {
  ok?: boolean;
  error?: string;
};

const money = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

function statusClass(status: MiningRow["status"]) {
  if (status === "PENDING") return "text-amber-300";
  if (status === "ACTIVE") return "text-emerald-300";
  if (status === "COMPLETED") return "text-sky-300";
  if (status === "ABORTED" || status === "REJECTED") return "text-rose-300";
  return "text-white/80";
}

function statusLabel(status: MiningRow["status"], isZh: boolean) {
  if (isZh) {
    if (status === "PENDING") return "待处理";
    if (status === "ACTIVE") return "进行中";
    if (status === "REJECTED") return "已拒绝";
    if (status === "ABORTED") return "已中止";
    return "成功";
  }
  if (status === "COMPLETED") return "SUCCESS";
  return status;
}

export default function MiningPendingTable() {
  const sp = useSearchParams();
  const isZh = sp.get("lang") === "zh";
  const managedBy = String(sp.get("managedBy") || "ALL").trim() || "ALL";
  const [pendingRows, setPendingRows] = useState<MiningRow[]>([]);
  const [historyRows, setHistoryRows] = useState<MiningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [approvingId, setApprovingId] = useState("");
  const text = {
    title: isZh ? "挖矿审批" : "Mining Pending",
    desc: isZh
      ? "审批用户挖矿购买请求并保留历史记录。"
      : "Approve user mining purchase requests and keep history.",
    refresh: isZh ? "刷新" : "Refresh",
    pendingApproval: isZh ? "待审批" : "Pending Approval",
    history: isZh ? "历史记录" : "History",
    loading: isZh ? "加载中..." : "Loading...",
    noPending: isZh ? "暂无待审批订单。" : "No pending orders.",
    noHistory: isZh ? "暂无历史记录。" : "No history yet.",
    user: isZh ? "用户" : "USER",
    email: isZh ? "邮箱" : "EMAIL",
    plan: isZh ? "方案" : "PLAN",
    amount: isZh ? "金额 (USDT)" : "AMOUNT (USDT)",
    requested: isZh ? "申请时间" : "REQUESTED",
    action: isZh ? "操作" : "ACTION",
    status: isZh ? "状态" : "STATUS",
    activated: isZh ? "激活时间" : "ACTIVATED",
    approve: isZh ? "通过" : "Approve",
    approving: isZh ? "审批中..." : "Approving...",
    loadPendingFailed: isZh ? "加载待审批挖矿订单失败" : "Failed to load pending mining orders",
    loadHistoryFailed: isZh ? "加载挖矿历史失败" : "Failed to load mining history",
    loadMiningFailed: isZh ? "加载挖矿数据失败" : "Failed to load mining data",
    approveFailed: isZh ? "审批失败" : "Approve failed",
    approveInfo: isZh ? "挖矿订单已通过并加入历史记录。" : "Mining order approved. Added to history.",
  };

  const load = useCallback(async () => {
    setErr("");

    try {
      const params = new URLSearchParams();
      if (managedBy.toUpperCase() !== "ALL") {
        params.set("managedBy", managedBy);
      }
      const managedQuery = params.toString();
      const withManagedBy = (path: string) =>
        managedQuery ? `${path}${path.includes("?") ? "&" : "?"}${managedQuery}` : path;

      const [pendingRes, historyRes] = await Promise.all([
        fetch(withManagedBy("/api/admin/mining-pending"), {
          method: "GET",
          cache: "no-store",
        }),
        fetch(withManagedBy("/api/admin/mining-history"), {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      const pendingJson = (await pendingRes.json().catch(() => ({}))) as MiningResp;
      const historyJson = (await historyRes.json().catch(() => ({}))) as MiningResp;

      if (!pendingRes.ok) {
        throw new Error(pendingJson?.error || text.loadPendingFailed);
      }
      if (!historyRes.ok) {
        throw new Error(historyJson?.error || text.loadHistoryFailed);
      }

      setPendingRows(Array.isArray(pendingJson?.rows) ? pendingJson.rows : []);
      setHistoryRows(Array.isArray(historyJson?.rows) ? historyJson.rows : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.loadMiningFailed;
      setPendingRows([]);
      setHistoryRows([]);
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, [managedBy, text.loadHistoryFailed, text.loadMiningFailed, text.loadPendingFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const doApprove = async (miningId: string) => {
    if (!miningId) return;
    setApprovingId(miningId);
    setErr("");
    setInfo("");

    try {
      const r = await fetch("/api/admin/mining-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ miningId }),
      });
      const j = (await r.json().catch(() => ({}))) as MiningApproveResp;
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || text.approveFailed);
      }

      setInfo(text.approveInfo);
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.approveFailed;
      setErr(message);
    } finally {
      setApprovingId("");
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{text.title}</div>
          <div className="mt-1 text-sm text-white/60">
            {text.desc}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          {text.refresh}
        </button>
      </div>

      {info ? <div className="mb-3 text-sm text-emerald-300">{info}</div> : null}
      {err ? <div className="mb-3 text-sm text-red-300">{err}</div> : null}

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="mb-3 text-sm font-semibold text-white">{text.pendingApproval}</div>

        {loading ? (
          <div className="text-white/60">{text.loading}</div>
        ) : pendingRows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {text.noPending}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{text.user}</th>
                  <th className="py-3">{text.email}</th>
                  <th className="py-3">{text.plan}</th>
                  <th className="py-3 text-right">{text.amount}</th>
                  <th className="py-3">{text.requested}</th>
                  <th className="py-3 text-right">{text.action}</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((o) => (
                  <tr key={o.id} className="border-t border-white/10">
                    <td className="py-3">{o.username || o.user_id.slice(0, 8)}</td>
                    <td className="py-3">{o.email || "-"}</td>
                    <td className="py-3">{o.plan_id}</td>
                    <td className="py-3 text-right">{money(Number(o.amount || 0))}</td>
                    <td className="py-3">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void doApprove(o.id)}
                        disabled={approvingId === o.id}
                        className="rounded-xl px-4 py-2 text-xs font-semibold text-black bg-[#F7B500] hover:brightness-110 active:scale-[.99] disabled:opacity-60"
                      >
                        {approvingId === o.id ? text.approving : text.approve}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="mb-3 text-sm font-semibold text-white">{text.history}</div>

        {loading ? (
          <div className="text-white/60">{text.loading}</div>
        ) : historyRows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {text.noHistory}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{text.user}</th>
                  <th className="py-3">{text.email}</th>
                  <th className="py-3">{text.plan}</th>
                  <th className="py-3 text-right">{text.amount}</th>
                  <th className="py-3">{text.status}</th>
                  <th className="py-3">{text.requested}</th>
                  <th className="py-3">{text.activated}</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((o) => (
                  <tr key={o.id} className="border-t border-white/10">
                    <td className="py-3">{o.username || o.user_id.slice(0, 8)}</td>
                    <td className="py-3">{o.email || "-"}</td>
                    <td className="py-3">{o.plan_id}</td>
                    <td className="py-3 text-right">{money(Number(o.amount || 0))}</td>
                    <td className={`py-3 ${statusClass(o.status)}`}>{statusLabel(o.status, isZh)}</td>
                    <td className="py-3">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="py-3">
                      {o.activated_at ? new Date(o.activated_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
