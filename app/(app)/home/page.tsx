// app/(app)/home/page.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import HomeBanner from "@components/HomeBanner";
import FeatureGrid from "@components/FeatureGrid";
import HomeNewsSection from "@components/HomeNewsSection";
import TradingViewTape from "@components/TradingViewTape";
import VipProgramModal from "@components/VipProgramModal";

type HomeTheme = "dark" | "light";

const THEME_KEY = "opendex.home.theme.v2";

export default function HomePage() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<HomeTheme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "light";
    } catch {
      return "light";
    }
  });
  const [vipPromoOpen, setVipPromoOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore localStorage write errors
    }
    document.documentElement.setAttribute("data-ob-theme", theme);
  }, [theme]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setVipPromoOpen(false);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return (
    <div className={`homeWrap ${theme === "light" ? "homeThemeLight" : "homeThemeDark"}`}>
      <VipProgramModal open={vipPromoOpen} theme={theme} onClose={() => setVipPromoOpen(false)} />
      <HomeBanner
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      />
      <TradingViewTape theme={theme} />
      <FeatureGrid onVipBenefitsClick={() => setVipPromoOpen(true)} />
      <HomeNewsSection />
      <div className="homeBottomSpace" />
    </div>
  );
}
