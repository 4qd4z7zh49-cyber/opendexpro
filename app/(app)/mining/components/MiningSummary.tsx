"use client";

import React from "react";

type Props = {
  fundsInCustody: number;
  totalOrders: number;
  estEarningsToday: number;
  cumulativeIncome: number;
  onOpenOrders?: () => void;
};

const money = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function MiningSummary({
  fundsInCustody,
  totalOrders,
  estEarningsToday,
  cumulativeIncome,
  onOpenOrders,
}: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_18px_55px_rgba(0,0,0,.55)] overflow-hidden">
      <div className="relative p-5">
        <div className="absolute inset-0 bg-[radial-gradient(900px_300px_at_20%_0%,rgba(40,120,255,.35),transparent_55%)] pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="text-white/60 text-sm">Funds in custody</div>
            <div className="text-white text-2xl font-semibold mt-1">
              {money(fundsInCustody)}
            </div>
            <div className="text-white/60 text-xs mt-2">
              Total order <span className="text-white/80">{totalOrders}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenOrders}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white/90 text-sm hover:bg-white/[0.07] active:scale-[.98] transition"
          >
            Orders
          </button>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="text-white/60 text-xs">Estimated Earnings Today</div>
            <div className="text-white text-lg font-semibold mt-1">
              {money(estEarningsToday)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="text-white/60 text-xs">Cumulative income</div>
            <div className="text-white text-lg font-semibold mt-1">
              {money(cumulativeIncome)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
