// components/trade/TradeOrders.tsx
'use client';

import { useState } from 'react';
import { Order } from './useTradeAction';

export default function TradeOrders({
  orders,
  pnl,
}: {
  orders: Order[];
  pnl: number;
}) {
  const tabs = ["open", "history"] as const;
  const [tab, setTab] = useState<'open' | 'history'>('open');

  return (
    <div className="rounded-[1.6rem] border border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(239,246,255,0.64))] p-4 shadow-[0_18px_44px_rgba(82,132,198,0.12)] backdrop-blur-2xl">
      <div className="mb-3 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-[linear-gradient(135deg,rgba(96,165,250,0.24),rgba(255,255,255,0.88))] text-sky-800'
                : 'bg-white/70 text-slate-500'
            }`}
          >
            {t === 'open' ? 'Open Orders' : 'History'}
          </button>
        ))}
      </div>

      <div className="mb-2 text-sm text-slate-600">
        PnL:{' '}
        <b className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
          {pnl >= 0 ? '+' : ''}
          {pnl.toFixed(2)}
        </b>
      </div>

      <div className="space-y-2 max-h-40 overflow-auto">
        {orders.map((o) => (
          <div key={o.id} className="flex justify-between rounded-xl bg-white/70 p-2.5 text-xs text-slate-700">
            <span>{o.side}</span>
            <span>${o.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
