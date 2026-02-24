// app/(app)/home/page.tsx
"use client";

import { useEffect, useState } from "react";
import HomeBanner from "@components/HomeBanner";
import FeatureGrid from "@components/FeatureGrid";
import HomeNewsSection from "@components/HomeNewsSection";
import TradingViewTape from "@components/TradingViewTape";

type HomeTheme = "dark" | "light";

const THEME_KEY = "opendex.home.theme";

export default function HomePage() {
  const [theme, setTheme] = useState<HomeTheme>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore localStorage write errors
    }
    document.documentElement.setAttribute("data-ob-theme", theme);
  }, [theme]);

  return (
    <div className={`homeWrap ${theme === "light" ? "homeThemeLight" : "homeThemeDark"}`}>
      <HomeBanner
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      />
      <TradingViewTape theme={theme} />
      <FeatureGrid />
      <HomeNewsSection />
      <div className="homeBottomSpace" />
    </div>
  );
}
