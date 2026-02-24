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
  { href: "/home", label: "Home", icon: () => <span>🏠</span> },
  { href: "/markets", label: "Markets", icon: () => <span>📊</span> },
  { href: "/trade", label: "Trade", icon: () => <span>⚡</span> },
  { href: "/mining", label: "Mining", icon: () => <span>⛏️</span> },
  { href: "/wallet", label: "Wallet", icon: () => <span>💼</span> },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const readTheme = () => {
      const v = document.documentElement.getAttribute("data-ob-theme");
      setTheme(v === "light" ? "light" : "dark");
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
        "fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t",
        theme === "light" ? "bg-white/90 border-slate-300/70" : "bg-black/70 border-white/10",
      ].join(" ")}
    >
      <ul className="grid h-16 grid-cols-5 items-center">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href} className="min-w-0">
              <Link
                href={t.href}
                className={`flex min-w-0 flex-col items-center gap-1 px-1 text-xs transition-all
                  ${
                    active
                      ? "text-blue-500 scale-110"
                      : theme === "light"
                        ? "text-slate-600"
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
