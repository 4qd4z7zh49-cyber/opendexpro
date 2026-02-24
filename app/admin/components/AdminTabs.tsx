"use client";

import React from "react";

export type AdminTabKey = "USERS" | "TOPUPS" | "MINING" | "ORDERS";

export default function AdminTabs({
  value,
  onChange,
}: {
  value: AdminTabKey;
  onChange: (v: AdminTabKey) => void;
}) {
  const tabs: { key: AdminTabKey; label: string }[] = [
    { key: "USERS", label: "Users" },
    { key: "TOPUPS", label: "Top-ups" },
    { key: "MINING", label: "Mining" },
    { key: "ORDERS", label: "Orders" },
  ];

  return (
    <div className="flex gap-2 rounded-3xl border border-white/10 bg-white/[0.02] p-2">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[.99] ${
              active
                ? "bg-[#2b3b52] text-white shadow-[0_10px_30px_rgba(0,0,0,.35)]"
                : "text-white/70 hover:bg-white/[0.04]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}