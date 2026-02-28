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
    <div className="mb-4 flex gap-2 rounded-[1.6rem] border border-sky-200/70 bg-white/60 p-1.5 shadow-[0_18px_40px_rgba(82,132,198,0.12)] backdrop-blur-2xl">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`flex-1 rounded-[1.2rem] py-3 font-bold transition-all duration-300 ${
            tab === t.key
              ? 'bg-[linear-gradient(135deg,rgba(96,165,250,0.24),rgba(255,255,255,0.9))] text-sky-800 shadow-[0_10px_24px_rgba(82,132,198,0.14)]'
              : 'text-slate-950 hover:bg-white/65 hover:text-slate-950'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
