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
    <div className="bg-black border border-neutral-800 rounded-xl p-3">
      <div className="flex gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full ${
              tab === t ? 'bg-slate-700' : 'bg-neutral-900'
            }`}
          >
            {t === 'open' ? 'Open Orders' : 'History'}
          </button>
        ))}
      </div>

      <div className="text-sm mb-2">
        PnL:{' '}
        <b className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
          {pnl >= 0 ? '+' : ''}
          {pnl.toFixed(2)}
        </b>
      </div>

      <div className="space-y-2 max-h-40 overflow-auto">
        {orders.map((o) => (
          <div
            key={o.id}
            className="p-2 rounded-lg bg-neutral-900 text-xs flex justify-between"
          >
            <span>{o.side}</span>
            <span>${o.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
