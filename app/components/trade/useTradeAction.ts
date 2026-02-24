"use client";

import { useEffect, useMemo, useState } from "react";
import { getUserAuthHeaders } from "@/lib/clientAuth";

export type Side = "BUY" | "SELL";

export type Order = {
  id: string;
  side: Side;
  qty: number;
  price: number;
  time: string;
};

const ORDERS_KEY = "openbookpro.trade.orders.v1";

type WalletStateResp = {
  ok?: boolean;
  error?: string;
  holdings?: Record<string, number>;
};

type AdjustResp = {
  ok?: boolean;
  error?: string;
  balanceUSDT?: number;
};

async function authHeaders(): Promise<Record<string, string>> {
  return getUserAuthHeaders();
}

function loadOrders(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Order[]) : [];
  } catch {
    return [];
  }
}

function saveOrders(orders: Order[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

async function fetchUsdtBalance() {
  const r = await fetch("/api/wallet/state", {
    cache: "no-store",
    headers: await authHeaders(),
  });
  const j = (await r.json().catch(() => ({}))) as WalletStateResp;
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to load wallet");
  return Number(j?.holdings?.USDT ?? 0);
}

async function adjustUsdt(deltaUSDT: number) {
  const tokenHeaders = await authHeaders();
  const r = await fetch("/api/wallet/adjust", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...tokenHeaders,
    },
    body: JSON.stringify({ deltaUSDT }),
  });
  const j = (await r.json().catch(() => ({}))) as AdjustResp;
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Wallet adjust failed");
  return Number(j.balanceUSDT ?? 0);
}

export function useTradeAction() {
  const [balance, setBalance] = useState(0);
  const [balanceErr, setBalanceErr] = useState("");
  const [orders, setOrders] = useState<Order[]>(() => loadOrders());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const v = await fetchUsdtBalance();
        if (!cancelled) {
          setBalance(v);
          setBalanceErr("");
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load wallet";
        setBalanceErr(message);
      }
    };

    void load();
    const t = window.setInterval(() => {
      void load();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  async function place(side: Side, qty: number, price: number) {
    const q = Number(qty);
    const p = Number(price);
    if (!Number.isFinite(q) || q <= 0) return false;
    if (!Number.isFinite(p) || p <= 0) return false;

    const total = q * p;
    const delta = side === "BUY" ? -total : total;

    try {
      const nextBalance = await adjustUsdt(delta);
      setBalance(nextBalance);
      setBalanceErr("");

      setOrders((o) => [
        {
          id: crypto.randomUUID(),
          side,
          qty: q,
          price: p,
          time: new Date().toISOString(),
        },
        ...o,
      ]);

      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Place order failed";
      setBalanceErr(message);
      return false;
    }
  }

  const pnl = useMemo(() => {
    return orders.reduce(
      (s, o) => s + (o.side === "SELL" ? o.qty * o.price : -o.qty * o.price),
      0
    );
  }, [orders]);

  return { balance, orders, pnl, place, balanceErr };
}
