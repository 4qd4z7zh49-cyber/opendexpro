"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

export default function MiningPage() {
  const [orders, setOrders] = useState<MiningOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersErr, setOrdersErr] = useState("");
  const [miningRestricted, setMiningRestricted] = useState(false);
  const [activeModal, setActiveModal] = useState<MiningPlan | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [walletUSDT, setWalletUSDT] = useState(0);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

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
      setToast("Your account is restricted.");
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

  const doPurchase = async () => {
    if (!activeModal) return;
    const n = Number(String(amount).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setToast("Please enter a valid amount.");
      return;
    }
    if (n < activeModal.min || n > activeModal.max) {
      setToast(`Amount must be between ${money(activeModal.min)} and ${money(activeModal.max)}.`);
      return;
    }

    try {
      await purchaseMining(activeModal, n);
      await reloadOrders();
      await reloadWalletUSDT();
      setActiveModal(null);
      setToast("Purchase request submitted. Waiting for admin approval.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Purchase failed";
      setToast(message);
    }
  };

  const abortOrder = async (orderId: string) => {
    if (miningRestricted) {
      setToast("Your account is restricted.");
      return;
    }
    try {
      await abortMining(orderId);
      await reloadOrders();
      await reloadWalletUSDT();
      setToast("Order aborted ✅");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Abort failed";
      setToast(message);
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

        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Purchase request will stay <b>PENDING</b> until mining server approves it.
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

      {/* Purchase modal */}
      {activeModal && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-t-3xl border border-white/10 bg-[#0b0b0d] p-5 shadow-[0_-18px_70px_rgba(0,0,0,.75)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-white font-semibold">{activeModal.name}</div>
                <div className="text-white/60 text-xs mt-1">
                  {activeModal.cycleDays}Days · Daily {((activeModal.dailyRate * 100).toFixed(2))}%
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/90 hover:bg-white/[0.07] transition"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="text-white/60 text-xs">Enter amount</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                placeholder={`${money(activeModal.min)} - ${money(activeModal.max)}`}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white placeholder:text-white/30 outline-none focus:border-white/20"
              />
              <div className="text-white/50 text-xs mt-2">
                Single limit: {money(activeModal.min)} - {money(activeModal.max)}
              </div>
            </div>

            <button
              onClick={doPurchase}
              className="mt-5 w-full rounded-2xl py-4 font-semibold text-black bg-[#F7B500] hover:brightness-110 active:scale-[.99] transition shadow-[0_12px_26px_rgba(247,181,0,.25)]"
            >
              Confirm Purchase
            </button>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] shadow-[0_24px_80px_rgba(0,0,0,.7)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-white">Orders History</div>
                <div className="text-xs text-white/60">Mining session records</div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/90 hover:bg-white/[0.07]"
              >
                Close
              </button>
            </div>

            <div className="max-h-[62vh] overflow-auto p-4">
              {ordersLoading ? (
                <div className="text-sm text-white/60">Loading orders...</div>
              ) : ordersErr ? (
                <div className="text-sm text-red-300">{ordersErr}</div>
              ) : orders.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/60">
                  No orders yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((o) => (
                    <div key={`history-${o.id}`} className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-white">{o.planName}</div>
                        <div className={`text-xs font-semibold ${statusClass(o.status)}`}>
                          {statusLabel(o.status)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        Amount: <span className="text-white/80">{money(o.principalUSDT)} USDT</span>
                      </div>
                      <div className="mt-1 text-xs text-white/50">
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

      {/* tiny toast */}
      {!!toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[80]">
          <div className="rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-white/90 text-sm shadow-[0_18px_55px_rgba(0,0,0,.6)]">
            {toast}
            <button
              className="ml-3 text-white/60 hover:text-white/90"
              onClick={() => setToast("")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
