"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MINING_PLANS, type MiningPlan } from "@/lib/miningMock";

import MiningSummary from "./components/MiningSummary";
import MiningPlanCard from "./components/MiningPlanCard";
import MiningProgress from "./components/MiningProgress";

import { purchaseMining, abortMining, getMiningOrders, type MiningOrder } from "@/lib/miningStore";
import { getUserAuthHeaders } from "@/lib/clientAuth";

const money = (n?: number | null) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const daysBetween = (a: number, b: number) => Math.max(0, Math.floor((b - a) / 86400000));
const DAY_MS = 24 * 60 * 60 * 1000;

function elapsedDaysProrated(startTs: number, nowTs: number, cycleDays?: number) {
  if (!Number.isFinite(startTs) || startTs <= 0) return 0;
  const raw = Math.max(0, (nowTs - startTs) / DAY_MS);
  if (!Number.isFinite(cycleDays || 0) || !cycleDays || cycleDays <= 0) return raw;
  return Math.min(raw, cycleDays);
}

function statusClass(status: MiningOrder["status"]) {
  if (status === "PENDING") return "text-amber-300";
  if (status === "ACTIVE") return "text-emerald-300";
  if (status === "COMPLETED") return "text-sky-300";
  if (status === "ABORTED" || status === "REJECTED") return "text-rose-300";
  return "text-white/80";
}

function statusLabel(status: MiningOrder["status"]) {
  return status === "COMPLETED" ? "SUCCESS" : status;
}

type ToastTone = "info" | "success" | "error";

type ToastState = {
  message: string;
  tone: ToastTone;
};

export default function MiningPage() {
  const [orders, setOrders] = useState<MiningOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersErr, setOrdersErr] = useState("");
  const [miningRestricted, setMiningRestricted] = useState(false);
  const [activeModal, setActiveModal] = useState<MiningPlan | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [walletUSDT, setWalletUSDT] = useState(0);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [portalReady, setPortalReady] = useState(false);

  // summary (live/prorated logic)
  const summary = useMemo(() => {
    const active = orders.filter((o) => o.status === "ACTIVE");
    const earningOrders = orders.filter((o) => o.status === "ACTIVE" || o.status === "COMPLETED");

    const fundsInCustody = active.reduce((s, o) => s + o.principalUSDT, 0);

    const estEarningsToday = active.reduce((s, o) => {
      return s + o.principalUSDT * o.dailyRate;
    }, 0);

    // cumulative income grows in real time for ACTIVE orders.
    // COMPLETED orders keep full-cycle income.
    const cumulativeIncome = earningOrders.reduce((s, o) => {
      const startTs = o.startedAt ?? o.createdAt;
      const progressedDays =
        o.status === "COMPLETED"
          ? Number(o.cycleDays) || elapsedDaysProrated(startTs, nowTs, o.cycleDays)
          : elapsedDaysProrated(startTs, nowTs, o.cycleDays);
      return s + o.principalUSDT * o.dailyRate * progressedDays;
    }, 0);

    return {
      fundsInCustody,
      totalOrders: orders.length,
      estEarningsToday,
      cumulativeIncome,
    };
  }, [nowTs, orders]);

  const openPurchase = (plan: MiningPlan) => {
    if (miningRestricted) {
      setToast({ message: "Your account is restricted.", tone: "error" });
      return;
    }
    setAmount("");
    setActiveModal(plan);
  };

  const reloadOrders = useCallback(async (showLoading = false) => {
    if (showLoading) setOrdersLoading(true);
    setOrdersErr("");

    try {
      const rows = await getMiningOrders();
      setOrders(rows);
      setMiningRestricted(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load mining orders";
      setOrdersErr(message);
      if (message.toLowerCase().includes("restricted")) {
        setMiningRestricted(true);
      }
    } finally {
      if (showLoading) setOrdersLoading(false);
    }
  }, []);

  async function reloadWalletUSDT() {
    try {
      const headers = await getUserAuthHeaders();
      const r = await fetch("/api/wallet/state", {
        cache: "no-store",
        headers,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) return;
      setWalletUSDT(Number(j?.holdings?.USDT ?? 0));
    } catch {
      // no-op for MVP
    }
  }

  useEffect(() => {
    const run = () => {
      void reloadWalletUSDT();
    };
    const kick = window.setTimeout(run, 0);
    const t = window.setInterval(() => {
      run();
    }, 5_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const run = () => {
      void reloadOrders(false);
    };
    void reloadOrders(true);
    const t = window.setInterval(run, 5_000);
    return () => {
      window.clearInterval(t);
    };
  }, [reloadOrders]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const doPurchase = async () => {
    if (!activeModal) return;
    const n = Number(String(amount).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setToast({ message: "Please enter a valid amount.", tone: "error" });
      return;
    }
    if (n < activeModal.min || n > activeModal.max) {
      setToast({
        message: `Amount must be between ${money(activeModal.min)} and ${money(activeModal.max)}.`,
        tone: "error",
      });
      return;
    }

    try {
      await purchaseMining(activeModal, n);
      await reloadOrders();
      await reloadWalletUSDT();
      setActiveModal(null);
      setToast({
        message: "Purchase request submitted. Waiting for admin approval.",
        tone: "success",
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Purchase failed";
      setToast({ message, tone: "error" });
    }
  };

  const abortOrder = async (orderId: string) => {
    if (miningRestricted) {
      setToast({ message: "Your account is restricted.", tone: "error" });
      return;
    }
    try {
      await abortMining(orderId);
      await reloadOrders();
      await reloadWalletUSDT();
      setToast({ message: "Order aborted.", tone: "success" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Abort failed";
      setToast({ message, tone: "error" });
    }
  };

  const planProgress = (planId: string) => {
    // show max progress among active orders of that plan (nice UI)
    const act = orders.filter((o) => o.planId === planId && o.status === "ACTIVE");
    if (!act.length) return undefined;

    const plan = MINING_PLANS.find((p) => p.id === planId);
    if (!plan) return undefined;

    const best = act
      .map((o) => {
        const passed = daysBetween(o.startedAt ?? o.createdAt, nowTs);
        return Math.round((passed / plan.cycleDays) * 100);
      })
      .reduce((a, b) => Math.max(a, b), 0);

    return Math.max(0, Math.min(100, best));
  };

  const toastClassName =
    toast?.tone === "success"
      ? "border-emerald-300/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(209,250,229,0.94))] text-emerald-950 shadow-[0_24px_70px_rgba(16,185,129,0.24)]"
      : toast?.tone === "error"
        ? "border-rose-300/70 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,228,230,0.94))] text-rose-950 shadow-[0_24px_70px_rgba(244,63,94,0.22)]"
        : "border-sky-300/70 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(219,234,254,0.94))] text-sky-950 shadow-[0_24px_70px_rgba(59,130,246,0.2)]";

  const overlays =
    portalReady && typeof document !== "undefined"
      ? createPortal(
          <>
            {activeModal && (
              <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 px-4 pb-[calc(88px+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
                <div className="w-full max-w-[520px] max-h-[min(80dvh,720px)] overflow-y-auto rounded-3xl border border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))] p-5 shadow-[0_28px_90px_rgba(82,132,198,0.24)] backdrop-blur-2xl">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-slate-950 font-semibold">{activeModal.name}</div>
                      <div className="text-slate-500 text-xs mt-1">
                        {activeModal.cycleDays}Days · Daily {((activeModal.dailyRate * 100).toFixed(2))}%
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveModal(null)}
                      className="rounded-xl border border-sky-200/80 bg-white/75 px-3 py-2 text-xs font-medium text-slate-700 shadow-[0_12px_26px_rgba(82,132,198,0.12)] transition hover:bg-white"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4">
                    <label className="text-slate-500 text-xs">Enter amount</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="numeric"
                      placeholder={`${money(activeModal.min)} - ${money(activeModal.max)}`}
                      className="mt-2 w-full rounded-2xl border border-sky-200/80 bg-white/80 px-4 py-4 text-slate-950 placeholder:text-slate-400 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_30px_rgba(82,132,198,0.1)] focus:border-sky-300"
                    />
                    <div className="text-slate-500 text-xs mt-2">
                      Single limit: {money(activeModal.min)} - {money(activeModal.max)}
                    </div>
                  </div>

                  <button
                    onClick={doPurchase}
                    className="mt-5 w-full rounded-2xl bg-[linear-gradient(135deg,#60a5fa,#2563eb)] py-4 font-semibold text-white transition shadow-[0_16px_36px_rgba(37,99,235,0.28)] hover:brightness-105 active:scale-[.99]"
                  >
                    Confirm Purchase
                  </button>
                </div>
              </div>
            )}

            {historyOpen && (
              <div className="fixed inset-0 z-[130] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
                <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))] shadow-[0_24px_80px_rgba(82,132,198,0.24)] backdrop-blur-2xl">
                  <div className="flex items-center justify-between border-b border-sky-200/70 px-5 py-4">
                    <div>
                      <div className="text-lg font-semibold text-slate-950">Orders History</div>
                      <div className="text-xs text-slate-500">Mining session records</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(false)}
                      className="rounded-xl border border-sky-200/80 bg-white/75 px-3 py-2 text-xs font-medium text-slate-700 shadow-[0_12px_26px_rgba(82,132,198,0.12)] hover:bg-white"
                    >
                      Close
                    </button>
                  </div>

                  <div className="max-h-[62vh] overflow-auto p-4">
                    {ordersLoading ? (
                      <div className="text-sm text-slate-500">Loading orders...</div>
                    ) : ordersErr ? (
                      <div className="text-sm text-red-300">{ordersErr}</div>
                    ) : orders.length === 0 ? (
                      <div className="rounded-xl border border-sky-200/70 bg-white/75 p-3 text-sm text-slate-500 shadow-[0_12px_28px_rgba(82,132,198,0.1)]">
                        No orders yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orders.map((o) => (
                          <div
                            key={`history-${o.id}`}
                            className="rounded-xl border border-sky-200/70 bg-white/75 p-3 shadow-[0_12px_28px_rgba(82,132,198,0.1)]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm text-slate-900">{o.planName}</div>
                              <div className={`text-xs font-semibold ${statusClass(o.status)}`}>
                                {statusLabel(o.status)}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Amount: <span className="text-slate-700">{money(o.principalUSDT)} USDT</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              Created: {o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {toast && (
              <div className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-[140] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2">
                <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${toastClassName}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">{toast.message}</div>
                    <button
                      className="shrink-0 text-current/60 transition hover:text-current"
                      onClick={() => setToast(null)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body
        )
      : null;

  return (
    <div className="min-h-[calc(100vh-72px)] px-4 pt-5 pb-28 bg-black">
      <div className="max-w-[520px] mx-auto space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-white text-3xl font-bold">AI-Driven Mining</div>
            <div className="text-white/60 text-sm mt-1">Financial cycle plans</div>
          </div>
          <div className="text-right">
            <div className="text-white/50 text-xs">Wallet USDT</div>
            <div className="text-white font-semibold">{money(walletUSDT)}</div>
          </div>
        </header>

        <div className="rounded-2xl border border-amber-300/55 bg-[linear-gradient(135deg,rgba(255,244,214,0.96),rgba(255,236,184,0.9))] px-4 py-3 text-sm font-medium text-[#7a4300] shadow-[0_12px_28px_rgba(217,119,6,0.08)]">
          Purchase request will stay <b className="text-[#4a2500]">PENDING</b> until mining server approves it.
        </div>
        {miningRestricted ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
            Your account is restricted.
          </div>
        ) : null}

        <MiningSummary
          fundsInCustody={summary.fundsInCustody}
          totalOrders={summary.totalOrders}
          estEarningsToday={summary.estEarningsToday}
          cumulativeIncome={summary.cumulativeIncome}
          onOpenOrders={() => setHistoryOpen(true)}
        />

        <div className="space-y-3">
          {MINING_PLANS.map((p) => (
            <MiningPlanCard
              key={p.id}
              plan={p}
              progress={planProgress(p.id)}
              onPurchase={openPurchase}
            />
          ))}
        </div>

        {/* Orders list (simple MVP) */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_16px_50px_rgba(0,0,0,.55)] overflow-hidden">
          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-white font-semibold">Your Orders</div>
              <div className="text-white/50 text-xs">Synced with server</div>
            </div>

            {ordersErr ? <div className="mt-3 text-sm text-red-300">{ordersErr}</div> : null}
            {ordersLoading ? (
              <div className="text-white/60 text-sm mt-4">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-white/60 text-sm mt-4">
                No orders yet. Tap <span className="text-white/80">Purchase</span> on a plan.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {orders.map((o) => {
                  const plan = MINING_PLANS.find((p) => p.id === o.planId);
                  const canTrack = Boolean(
                    plan &&
                      o.startedAt != null &&
                      (o.status === "ACTIVE" || o.status === "COMPLETED")
                  );
                  const passed =
                    canTrack && plan && o.startedAt != null ? daysBetween(o.startedAt, nowTs) : 0;
                  const pct =
                    o.status === "COMPLETED"
                      ? 100
                      : canTrack && plan
                        ? Math.round((passed / plan.cycleDays) * 100)
                        : 0;

                  return (
                    <div
                      key={o.id}
                      className="rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-white font-semibold">
                            {plan?.name ?? "Plan"}
                          </div>
                          <div className="text-white/60 text-xs mt-1">
                            Amount: <span className="text-white/80">{money(o.principalUSDT)}</span>
                            {" · "}
                            Status: <span className={statusClass(o.status)}>{statusLabel(o.status)}</span>
                          </div>
                          <div className="text-white/50 text-xs mt-1">
                            Created: {o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}
                          </div>
                        </div>

                        {o.status === "ACTIVE" && (
                          <button
                            onClick={() => abortOrder(o.id)}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/90 hover:bg-white/[0.07] active:scale-[.98] transition"
                          >
                            Abort
                          </button>
                        )}
                      </div>

                      {o.status === "PENDING" ? (
                        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                          Pending approval from admin/subadmin.
                        </div>
                      ) : null}

                      {o.status === "REJECTED" ? (
                        <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">
                          Rejected by admin.
                        </div>
                      ) : null}

                      {o.status === "ABORTED" ? (
                        <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">
                          Order aborted.
                        </div>
                      ) : null}

                      {o.status === "COMPLETED" ? (
                        <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-200">
                          Mining completed successfully.
                        </div>
                      ) : null}

                      {plan && canTrack ? (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-white/60 mb-2">
                            <span>Progress</span>
                            <span>
                              {Math.min(plan.cycleDays, passed)}/{plan.cycleDays} days
                            </span>
                          </div>
                          <MiningProgress value={pct} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      {overlays}
    </div>
  );
}
