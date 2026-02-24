"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* ================= TYPES ================= */

type Coin = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
};

type Category = "crypto" | "commodities" | "stocks";
type SortKey = "mcap" | "change" | "volume";

/* ================= HELPERS ================= */

function fmtUSD(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6,
    maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6,
  });
}

function fmtBig(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}

function toTradingViewSymbol(symbol: string) {
  const s = symbol.toUpperCase();

  // crypto
  if (s === "BTC") return "BITSTAMP:BTCUSD";
  if (s === "ETH") return "BITSTAMP:ETHUSD";
  if (s === "SOL") return "COINBASE:SOLUSD";
  if (s === "XRP") return "COINBASE:XRPUSD";
  if (s === "BNB") return "BINANCE:BNBUSD";
  if (s === "ADA") return "BINANCE:ADAUSD";
  if (s === "DOGE") return "BINANCE:DOGEUSD";

  // commodities (for Trade page)
  if (s === "GOLD") return "TVC:GOLD";
  if (s === "SILVER") return "TVC:SILVER";
  if (s === "PLATINUM") return "TVC:PLATINUM";
  if (s === "USOIL") return "TVC:USOIL";
  if (s === "UKOIL") return "TVC:UKOIL";

  // stocks (for Trade page)
  if (s === "AAPL") return "NASDAQ:AAPL";
  if (s === "TSLA") return "NASDAQ:TSLA";
  if (s === "NVDA") return "NASDAQ:NVDA";
  if (s === "AMD") return "NASDAQ:AMD";
  if (s === "MSFT") return "NASDAQ:MSFT";

  return "";
}

/* ================= TradingView Widget (Market Quotes) ================= */

function TradingViewQuotes({
  kind,
}: {
  kind: "commodities" | "stocks";
}) {
  const id = `tv-market-quotes-${kind}`;

  useEffect(() => {
    const container = document.getElementById(id);
    if (!container) return;

    // reset widget
    container.innerHTML = "";

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js";

    const cfg =
      kind === "commodities"
        ? {
            width: "100%",
            height: 520,
            colorTheme: "dark",
            isTransparent: true,
            locale: "en",
            showSymbolLogo: true,
            symbolsGroups: [
              {
                name: "Commodities",
                originalName: "Commodities",
                symbols: [
                  { name: "TVC:GOLD", displayName: "Gold" },
                  { name: "TVC:SILVER", displayName: "Silver" },
                  { name: "TVC:PLATINUM", displayName: "Platinum" },
                  { name: "TVC:USOIL", displayName: "US Oil" },
                  { name: "TVC:UKOIL", displayName: "UK Oil" },
                ],
              },
            ],
          }
        : {
            width: "100%",
            height: 520,
            colorTheme: "dark",
            isTransparent: true,
            locale: "en",
            showSymbolLogo: true,
            symbolsGroups: [
              {
                name: "US Stocks",
                originalName: "US Stocks",
                symbols: [
                  { name: "NASDAQ:AAPL", displayName: "Apple" },
                  { name: "NASDAQ:TSLA", displayName: "Tesla" },
                  { name: "NASDAQ:NVDA", displayName: "NVIDIA" },
                  { name: "NASDAQ:AMD", displayName: "AMD" },
                  { name: "NASDAQ:MSFT", displayName: "Microsoft" },
                ],
              },
            ],
          };

    script.innerHTML = JSON.stringify(cfg);
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [id, kind]);

  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.03)",
        boxShadow: "0 16px 50px rgba(0,0,0,.55)",
      }}
    >
      <div
        style={{
          padding: "12px 12px",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 15 }}>
          {kind === "commodities" ? "Commodities" : "Stocks"}
        </div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>Live</div>
      </div>

      <div id={id} />
    </div>
  );
}

/* ================= PAGE ================= */

export default function MarketsPage() {
  const [category, setCategory] = useState<Category>("crypto");
  const [sortKey, setSortKey] = useState<SortKey>("mcap");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);

  // crypto list uses API; commodities/stocks are widgets
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (category !== "crypto") {
        setCoins([]);
        setErr(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/markets?category=crypto`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch crypto markets");

        const json = (await res.json()) as { data?: Coin[]; error?: string };
        if (json.error) throw new Error(json.error);

        if (!cancelled) setCoins(json.data ?? []);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load markets";
        if (!cancelled) setErr(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 30_000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [category]);

  const view = useMemo(() => {
    if (category !== "crypto") return [];

    const query = q.trim().toLowerCase();
    let list = coins;

    if (query) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.symbol.toLowerCase().includes(query)
      );
    }

    list = [...list].sort((a, b) => {
      const aChange = a.price_change_percentage_24h ?? -9999;
      const bChange = b.price_change_percentage_24h ?? -9999;

      const aMcap = a.market_cap ?? -1;
      const bMcap = b.market_cap ?? -1;

      const aVol = a.total_volume ?? -1;
      const bVol = b.total_volume ?? -1;

      if (sortKey === "change") return bChange - aChange;
      if (sortKey === "volume") return bVol - aVol;
      return bMcap - aMcap;
    });

    return list;
  }, [coins, q, sortKey, category]);

  const sortDisabled = category !== "crypto";

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Markets
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Live market overview</div>
        </div>

        <div style={{ opacity: 0.75, fontSize: 13 }}>
          {category === "crypto" ? (loading ? "Updating…" : "Live") : "Live"}
        </div>
      </div>

      {/* Search + Sort (crypto only) */}
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={category === "crypto" ? "Search BTC, ETH, SOL…" : "Search disabled here"}
          disabled={sortDisabled}
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            height: 48,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(255,255,255,.04)",
            color: "white",
            padding: "0 14px",
            outline: "none",
            opacity: sortDisabled ? 0.6 : 1,
          }}
        />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          disabled={sortDisabled}
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            height: 48,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(255,255,255,.04)",
            color: "white",
            padding: "0 12px",
            outline: "none",
            opacity: sortDisabled ? 0.6 : 1,
          }}
        >
          <option value="mcap">Market Cap</option>
          <option value="change">24h Change</option>
          <option value="volume">Volume</option>
        </select>
      </div>

      {/* Category chips */}
      <div style={{ marginTop: 12, display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
        {(
          [
            ["crypto", "Crypto"],
            ["commodities", "Commodities"],
            ["stocks", "Stocks"],
          ] as const
        ).map(([key, label]) => {
          const active = category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.10)",
                background: active ? "rgba(59,130,246,.22)" : "rgba(255,255,255,.04)",
                color: "white",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {category === "crypto" && err ? (
  <div
    style={{
      marginTop: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,.10)",
      background: "rgba(255,255,255,.04)",
      padding: 12,
      color: "rgba(255,255,255,.80)",
      fontWeight: 800,
      fontSize: 13,
    }}
  >
    Connection is unstable — showing last known prices.
  </div>
) : null}

      {/* Content */}
      {category === "commodities" ? (
        <TradingViewQuotes kind="commodities" />
      ) : category === "stocks" ? (
        <TradingViewQuotes kind="stocks" />
      ) : (
        <div style={{ marginTop: 14 }}>
          {view.map((c) => {
            const up = (c.price_change_percentage_24h ?? 0) >= 0;

            return (
              <Link
                key={c.id}
                href={`/trade?tv=${encodeURIComponent(
                  toTradingViewSymbol(c.symbol)
                )}&name=${encodeURIComponent(c.name)}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  textDecoration: "none",
                  color: "white",
                  padding: "12px 10px",
                  borderBottom: "1px solid rgba(255,255,255,.07)",
                }}
              >
                {c.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.image}
                      alt={c.symbol.toUpperCase()}
                      width={44}
                      height={44}
                      style={{
                        borderRadius: 16,
                        background: "rgba(255,255,255,.06)",
                        border: "1px solid rgba(255,255,255,.08)",
                      }}
                    />
                  </>
                ) : (
                  <div
                    aria-label={c.symbol.toUpperCase()}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,.06)",
                      border: "1px solid rgba(255,255,255,.08)",
                      fontWeight: 900,
                    }}
                  >
                    {c.symbol.toUpperCase().slice(0, 3)}
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 900 }}>{c.symbol.toUpperCase()}</div>
                    <div
                      style={{
                        opacity: 0.72,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.name}
                    </div>
                  </div>

                  <div style={{ opacity: 0.70, fontSize: 12, marginTop: 2 }}>
                    MCap {c.market_cap ? `$${fmtBig(c.market_cap)}` : "—"} · Vol{" "}
                    {c.total_volume ? `$${fmtBig(c.total_volume)}` : "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900 }}>${fmtUSD(c.current_price)}</div>
                  <div
                    style={{
                      marginTop: 4,
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: up ? "rgba(0,200,120,.18)" : "rgba(220,60,60,.18)",
                      border: "1px solid rgba(255,255,255,.08)",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {c.price_change_percentage_24h == null
                      ? "—"
                      : `${up ? "+" : ""}${c.price_change_percentage_24h.toFixed(2)}%`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* spacer for BottomNav */}
      <div style={{ height: 72 }} />
    </div>
  );
}
