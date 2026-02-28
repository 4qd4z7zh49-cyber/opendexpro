"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Tab = {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
};

const tabs: Tab[] = [
  {
    href: "/home",
    label: "Home",
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M4 10.8 12 4l8 6.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 9.8V20h11V9.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/markets",
    label: "Markets",
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M5 19V9" strokeLinecap="round" />
        <path d="M12 19V5" strokeLinecap="round" />
        <path d="M19 19v-7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/trade",
    label: "Trade",
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="m13 3-6 8h4l-1 10 7-10h-4l.5-8Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/mining",
    label: "Mining",
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="m14 4 6 6" strokeLinecap="round" />
        <path d="m10 20 10-10" strokeLinecap="round" />
        <path d="m4 14 6 6" strokeLinecap="round" />
        <path d="M4 14 14 4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M4.5 8.5h15v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
        <path d="M16 13.5h3.5" strokeLinecap="round" />
        <path d="M6.5 8.5V7a2 2 0 0 1 2-2h8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const readTheme = () => {
      const v = document.documentElement.getAttribute("data-ob-theme");
      setTheme(v === "dark" ? "dark" : "light");
    };

    readTheme();
    const obs = new MutationObserver(() => readTheme());
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ob-theme"],
    });

    return () => {
      obs.disconnect();
    };
  }, []);

  return (
    <nav
      className={[
        "fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-2xl",
        theme === "light"
          ? "border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(232,244,255,0.92))] shadow-[0_-12px_40px_rgba(91,145,216,0.16)]"
          : "border-white/10 bg-black/70",
      ].join(" ")}
    >
      <ul className="mx-auto grid h-[72px] max-w-[640px] grid-cols-5 items-center px-2">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href} className="min-w-0">
              <Link
                href={t.href}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition-all duration-300
                  ${
                    active
                      ? theme === "light"
                        ? "bg-[linear-gradient(135deg,rgba(64,145,255,0.18),rgba(255,255,255,0.82))] text-sky-700 shadow-[0_12px_28px_rgba(92,146,220,0.18)] scale-[1.03]"
                        : "text-blue-500 scale-110"
                      : theme === "light"
                        ? "text-slate-600 hover:bg-white/55 hover:text-slate-900"
                        : "text-white/60"
                  }`}
              >
                {t.icon(active)}
                <span className="max-w-full truncate">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
