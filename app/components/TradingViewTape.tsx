"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  theme?: "dark" | "light";
};

const FALLBACK_ITEMS = [
  "BTC 69,200  +1.2%",
  "ETH 2,070  +0.9%",
  "Gold 5,042  +2.4%",
  "Silver 77.45  +2.8%",
  "AAPL 255.7  -2.3%",
] as const;

export default function TradingViewTape({ theme = "dark" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // cleanup + prevent duplicate
    el.innerHTML = "";
    const resetTimer = window.setTimeout(() => {
      setWidgetReady(false);
      setShowFallback(false);
    }, 0);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;

    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: "BITSTAMP:BTCUSD", title: "BTC" },
        { proName: "BITSTAMP:ETHUSD", title: "ETH" },
        { proName: "OANDA:XAUUSD", title: "Gold" },
        { proName: "OANDA:XAGUSD", title: "Silver" },
        { proName: "NASDAQ:AAPL", title: "AAPL" },
      ],
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: theme,
      locale: "en",
    });

    const markReadyIfMounted = () => {
      const hasWidgetNode = Array.from(el.children).some(
        (node) => node.tagName !== "SCRIPT"
      );
      if (hasWidgetNode || el.querySelector("iframe")) {
        setWidgetReady(true);
      }
    };

    const observer = new MutationObserver(() => {
      markReadyIfMounted();
    });
    observer.observe(el, { childList: true, subtree: true });

    script.addEventListener("load", markReadyIfMounted);
    el.appendChild(script);

    const fallbackTimer = window.setTimeout(() => {
      setShowFallback(true);
    }, 2200);

    return () => {
      observer.disconnect();
      script.removeEventListener("load", markReadyIfMounted);
      window.clearTimeout(resetTimer);
      window.clearTimeout(fallbackTimer);
      el.innerHTML = "";
    };
  }, [theme]);

  return (
    <div className="tvTapeWrap">
      <div className="tvTapeInner" ref={containerRef} />
      {showFallback && !widgetReady ? (
        <div className="tvTapeFallback" aria-label="Market ticker fallback">
          <div className="tvTapeTrack">
            {[...FALLBACK_ITEMS, ...FALLBACK_ITEMS].map((item, idx) => (
              <span key={`${item}-${idx}`} className="tvTapePill">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
