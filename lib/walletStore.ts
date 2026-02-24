// lib/walletStore.ts
"use client";

export type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";

export type WalletState = {
  base: "USDT";
  balances: Record<Asset, number>;
  updatedAt: number;
};

const STORAGE_KEY = "openbookpro.wallet.v1";

const DEFAULT_STATE: WalletState = {
  base: "USDT",
  balances: {
    USDT: 10_000, // default starting balance (MVP)
    BTC: 0,
    ETH: 0,
    SOL: 0,
    XRP: 0,
  },
  updatedAt: Date.now(),
};

function safeNumber(n: unknown) {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function loadWallet(): WalletState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as WalletState;

    // normalize
    const balances = { ...DEFAULT_STATE.balances, ...(parsed.balances ?? {}) };
    (Object.keys(balances) as Asset[]).forEach((k) => (balances[k] = safeNumber(balances[k])));

    return {
      base: "USDT",
      balances,
      updatedAt: safeNumber(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveWallet(next: WalletState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function setBalance(asset: Asset, amount: number) {
  const s = loadWallet();
  const next: WalletState = {
    ...s,
    balances: { ...s.balances, [asset]: Math.max(0, safeNumber(amount)) },
    updatedAt: Date.now(),
  };
  saveWallet(next);
  return next;
}

export function addBalance(asset: Asset, delta: number) {
  const s = loadWallet();
  const next: WalletState = {
    ...s,
    balances: { ...s.balances, [asset]: Math.max(0, safeNumber(s.balances[asset]) + safeNumber(delta)) },
    updatedAt: Date.now(),
  };
  saveWallet(next);
  return next;
}

/**
 * Exchange rule:
 * - User enters amount in FROM asset.
 * - Convert using USDT price feed:
 *   priceUSDT[BTC]=..., priceUSDT[ETH]=...
 * - USDT itself price = 1
 */
export function exchange(from: Asset, to: Asset, amountFrom: number, priceUSDT: Record<Asset, number>) {
  const amt = Math.max(0, safeNumber(amountFrom));
  const s = loadWallet();

  const fromBal = safeNumber(s.balances[from]);
  if (amt <= 0) throw new Error("Amount must be > 0");
  if (amt > fromBal) throw new Error("Insufficient balance");

  const pFrom = safeNumber(priceUSDT[from] ?? (from === "USDT" ? 1 : 0));
  const pTo = safeNumber(priceUSDT[to] ?? (to === "USDT" ? 1 : 0));
  if (pFrom <= 0 || pTo <= 0) throw new Error("Price unavailable");

  // value in USDT then convert to target asset
  const valueUSDT = from === "USDT" ? amt : amt * pFrom;
  const amountTo = to === "USDT" ? valueUSDT : valueUSDT / pTo;

  const next: WalletState = {
    ...s,
    balances: {
      ...s.balances,
      [from]: Math.max(0, fromBal - amt),
      [to]: safeNumber(s.balances[to]) + amountTo,
    },
    updatedAt: Date.now(),
  };

  saveWallet(next);
  return { state: next, amountTo };
}

export function spendUSDT(amountUSDT: number) {
  const amt = Math.max(0, safeNumber(amountUSDT));
  const s = loadWallet();
  if (amt > s.balances.USDT) throw new Error("Insufficient USDT");
  return setBalance("USDT", s.balances.USDT - amt);
}

export function creditUSDT(amountUSDT: number) {
  return addBalance("USDT", Math.max(0, safeNumber(amountUSDT)));
}