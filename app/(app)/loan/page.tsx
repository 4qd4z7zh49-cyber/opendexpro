"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const LOAN_OPTIONS = [
  {
    title: "Flexible Loan",
    detail: "Short-term liquidity with daily interest display and early repayment support.",
  },
  {
    title: "VIP Secured Loan",
    detail: "Higher approval priority for users with stronger balance history and VIP level.",
  },
  {
    title: "Business Review",
    detail: "Manual assessment path for larger requests and longer repayment windows.",
  },
] as const;

export default function LoanPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const isLight = theme === "light";

  useEffect(() => {
    const readTheme = () => {
      const next = document.documentElement.getAttribute("data-ob-theme");
      setTheme(next === "dark" ? "dark" : "light");
    };

    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ob-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={isLight ? "min-h-[calc(100vh-72px)] bg-[#edf5ff] px-4 pt-5 pb-28" : "min-h-[calc(100vh-72px)] bg-[#050816] px-4 pt-5 pb-28"}>
      <div className="mx-auto max-w-[560px] space-y-4">
        <div className={isLight ? "rounded-[28px] border border-sky-200/80 bg-white/85 p-5 shadow-[0_24px_70px_rgba(82,132,198,.14)] backdrop-blur-xl" : "rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_26px_70px_rgba(0,0,0,.45)] backdrop-blur-xl"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={isLight ? "text-[28px] font-extrabold tracking-[-0.03em] text-slate-900" : "text-[28px] font-extrabold tracking-[-0.03em] text-white"}>
                Loan
              </div>
              <div className={isLight ? "mt-1 text-sm text-slate-600" : "mt-1 text-sm text-white/60"}>
                Financing options, review flow, and repayment overview.
              </div>
            </div>
            <Link
              href="/home"
              className={isLight ? "inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700" : "inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"}
            >
              Back Home
            </Link>
          </div>

          <div className={isLight ? "mt-5 rounded-[24px] border border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,.96),rgba(191,219,254,.76),rgba(255,255,255,.88))] p-5 text-slate-900 shadow-[0_20px_50px_rgba(82,132,198,.14)]" : "mt-5 rounded-[24px] border border-sky-300/20 bg-[linear-gradient(135deg,rgba(12,19,34,.84),rgba(37,99,235,.18),rgba(255,255,255,.04))] p-5 text-white"}>
            <div className="text-xs font-black uppercase tracking-[0.26em] text-sky-700/80 dark:text-sky-200/80">
              Lending Desk
            </div>
            <div className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">Structured borrowing options for account growth.</div>
            <div className={isLight ? "mt-2 text-sm text-slate-700" : "mt-2 text-sm text-white/72"}>
              This page can be extended later with application form, approval status, and repayment tracking.
            </div>
          </div>
        </div>

        <div className={isLight ? "rounded-[28px] border border-sky-200/80 bg-white/82 p-4 shadow-[0_18px_50px_rgba(82,132,198,.12)] backdrop-blur-xl" : "rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_18px_50px_rgba(0,0,0,.38)] backdrop-blur-xl"}>
          <div className={isLight ? "mb-3 text-sm font-semibold text-slate-500" : "mb-3 text-sm font-semibold text-white/60"}>
            Available Tracks
          </div>
          <div className="space-y-3">
            {LOAN_OPTIONS.map((item) => (
              <div
                key={item.title}
                className={isLight ? "rounded-[22px] border border-slate-200 bg-slate-50/80 p-4" : "rounded-[22px] border border-white/10 bg-white/5 p-4"}
              >
                <div className={isLight ? "text-lg font-bold text-slate-900" : "text-lg font-bold text-white"}>
                  {item.title}
                </div>
                <div className={isLight ? "mt-2 text-sm text-slate-700" : "mt-2 text-sm text-white/74"}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
