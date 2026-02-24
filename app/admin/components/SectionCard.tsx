"use client";

import React from "react";

export default function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_16px_50px_rgba(0,0,0,.55)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
        <div className="text-white font-semibold">{title}</div>
        {right}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </section>
  );
}