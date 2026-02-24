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
        <h1 className="trade-light-sweep relative inline-block min-h-[2rem] text-2xl font-bold">
          AI powered Trade
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

      <style jsx>{`
        .trade-light-sweep {
          color: rgba(255, 255, 255, 0.95);
          background-image:
            linear-gradient(
              110deg,
              rgba(255, 255, 255, 0.92) 0%,
              rgba(255, 255, 255, 0.92) 35%,
              rgba(186, 230, 253, 0.95) 50%,
              rgba(255, 255, 255, 0.92) 65%,
              rgba(255, 255, 255, 0.92) 100%
            );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: tradeSweep 3.2s linear infinite;
        }

        @keyframes tradeSweep {
          0% {
            background-position: 120% 50%;
          }
          100% {
            background-position: -120% 50%;
          }
        }
      `}</style>
    </div>
  );
}
