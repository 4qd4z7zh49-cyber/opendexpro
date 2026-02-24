// components/trade/TradeChart.tsx
'use client';

export default function TradeChart({ symbol }: { symbol: string }) {
  const chartSrc =
    'https://s.tradingview.com/embed-widget/advanced-chart/?theme=dark#' +
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
    'https://s.tradingview.com/embed-widget/technical-analysis/?theme=dark#' +
    encodeURIComponent(
      JSON.stringify({
        symbol,
        interval: '15m',
      })
    );

  return (
    <div className="space-y-3">
      <iframe src={chartSrc} className="w-full h-[420px] rounded-xl" />
      <iframe src={insightSrc} className="w-full h-[200px] rounded-xl" />
    </div>
  );
}