// components/trade/TradeTabs.tsx
'use client';

export default function TradeTabs({
  tab,
  setTab,
}: {
  tab: 'chart' | 'trade';
  setTab: (v: 'chart' | 'trade') => void;
}) {
  const tabs: Array<{ key: 'trade' | 'chart'; label: string }> = [
    { key: 'trade', label: 'AI powered Trade' },
    { key: 'chart', label: 'Chart' },
  ];

  return (
    <div className="flex gap-2 mb-3">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`flex-1 py-3 rounded-full font-bold ${
            tab === t.key
              ? 'bg-slate-700 text-white'
              : 'bg-black border border-neutral-800 text-gray-400'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
