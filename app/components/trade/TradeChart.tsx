// components/trade/TradeChart.tsx
'use client';

export default function TradeChart({ symbol }: { symbol: string }) {
  const chartSrc =
    'https://s.tradingview.com/embed-widget/advanced-chart/?theme=light#' +
    encodeURIComponent(
      JSON.stringify({
        symbol,
        interval: '15',
        timezone: 'UTC',
        allow_symbol_change: true,
        height: 420,
      })
    );

  const insightSrc =
    'https://s.tradingview.com/embed-widget/technical-analysis/?theme=light#' +
    encodeURIComponent(
      JSON.stringify({
        symbol,
        interval: '15m',
      })
    );

  return (
    <div className="space-y-3">
      <iframe
        src={chartSrc}
        className="h-[420px] w-full rounded-[1.8rem] border border-sky-200/70 bg-white/70 shadow-[0_18px_44px_rgba(82,132,198,0.12)]"
      />
      <iframe
        src={insightSrc}
        className="h-[200px] w-full rounded-[1.8rem] border border-sky-200/70 bg-white/70 shadow-[0_18px_44px_rgba(82,132,198,0.12)]"
      />
    </div>
  );
}
