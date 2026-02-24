"use client";

import React from "react";

export default function MiningProgress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#F7B500,rgba(247,181,0,.75))] shadow-[0_0_18px_rgba(247,181,0,.35)] transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}