"use client";

import React from "react";

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
      <span className="text-white/50 text-sm">⌕</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        className="w-[180px] md:w-[260px] bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
      />
      {!!value && (
        <button
          onClick={() => onChange("")}
          className="text-white/40 hover:text-white/80 text-xs"
        >
          ✕
        </button>
      )}
    </div>
  );
}