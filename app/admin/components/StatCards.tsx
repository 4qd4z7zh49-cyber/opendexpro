"use client";

import React from "react";

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_16px_50px_rgba(0,0,0,.55)]">
      <div className="text-white/60 text-xs">{title}</div>
      <div className="text-white text-2xl font-bold mt-2">{value}</div>
      {hint && <div className="text-white/40 text-xs mt-1">{hint}</div>}
    </div>
  );
}

export default function StatCards({
  totalUsers,
  totalBalanceUSDT,
  pendingTopups,
  pendingMining,
}: {
  totalUsers: number;
  totalBalanceUSDT: number;
  pendingTopups: number;
  pendingMining: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card title="Total Users" value={String(totalUsers)} />
      <Card title="Total Balance (USDT)" value={totalBalanceUSDT.toLocaleString()} />
      <Card title="Pending Top-ups" value={String(pendingTopups)} hint="Needs admin action" />
      <Card title="Pending Mining" value={String(pendingMining)} hint="Confirm to activate" />
    </div>
  );
}