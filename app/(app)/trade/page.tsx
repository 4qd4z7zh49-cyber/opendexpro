'use client';

import Link from 'next/link';
import { useState } from 'react';
import TradeTabs from '@components/trade/TradeTabs';
import TradeChart from '@components/trade/TradeChart';
import TradePanel from '@components/trade/TradePanel';

export default function TradePage() {
  const [tab, setTab] = useState<'chart' | 'trade'>('trade');

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-3 px-3 pb-2 pt-4 text-white sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="inline-flex min-h-[2rem] items-center gap-1 text-2xl font-extrabold tracking-[-0.03em] text-slate-950 drop-shadow-[0_10px_24px_rgba(148,163,184,0.18)]">
          <span className="text-slate-900">AI</span>
          <span className="bg-[linear-gradient(135deg,#0f5f9f,#2563eb_58%,#7dd3fc)] bg-clip-text text-transparent drop-shadow-none">
            powered
          </span>
          <span className="text-slate-900">Trade</span>
        </h1>
        <Link
          href="/wallet#exchange"
          className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
        >
          Exchange in Wallet
        </Link>
      </div>

      <TradeTabs tab={tab} setTab={setTab} />

      {tab === 'chart' ? (
        <TradeChart symbol="BITSTAMP:BTCUSD" />
      ) : (
        <TradePanel />
      )}
    </div>
  );
}
