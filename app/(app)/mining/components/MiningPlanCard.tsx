"use client";

import React from "react";
import Image from "next/image";
import type { MiningPlan } from "@/lib/miningMock";
import MiningProgress from "./MiningProgress";
const money = (n?: number | null) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

type Props = {
  plan: MiningPlan;
  onPurchase: (plan: MiningPlan) => void;
  progress?: number; // optional to show a bar under each plan
};

export default function MiningPlanCard({ plan, onPurchase, progress }: Props) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_16px_50px_rgba(0,0,0,.55)] overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-white/60 text-xs">Financial cycle</div>
            <div className="text-white text-sm font-semibold mt-1">{plan.name}</div>
          </div>

          <div className="text-white/90 text-sm font-semibold">
            {plan.cycleDays}Days
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/10 grid place-items-center">
              <Image
                src="/openbook.png"
                alt="Openbook logo"
                width={18}
                height={18}
                className="h-[18px] w-[18px] rounded-sm object-cover"
              />
            </div>
            <div className="text-white/70 text-xs">
              <div>Single limit</div>
              <div className="text-white/90 font-semibold">
{money(plan.min)} - {money(plan.max)}              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onPurchase(plan)}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-black bg-[#F7B500] hover:brightness-110 active:scale-[.98] transition shadow-[0_10px_22px_rgba(247,181,0,.25)]"
          >
            Purchase
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-white/60 text-[11px]">Daily rate of return</div>
            <div className="text-white font-semibold mt-1">{pct(plan.dailyRate)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-white/60 text-[11px]">Abort</div>
            <div className="text-white font-semibold mt-1">{pct(plan.abortFee)}</div>
          </div>
        </div>

        {typeof progress === "number" && (
          <div className="mt-4">
            <MiningProgress value={progress} />
          </div>
        )}
      </div>
    </div>
  );
}
