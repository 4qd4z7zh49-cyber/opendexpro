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

export default function HomePage() {
  const pathname = usePathname();
  const [vipPromoOpen, setVipPromoOpen] = useState(false);
  const theme: HomeTheme = "light";

  useEffect(() => {
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
      <HomeBanner theme={theme} />
      <TradingViewTape theme={theme} />
      <FeatureGrid onVipBenefitsClick={() => setVipPromoOpen(true)} />
      <HomeNewsSection />
      <div className="homeBottomSpace" />
    </div>
  );
}
