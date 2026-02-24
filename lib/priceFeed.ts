export type PriceAsset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
export type PriceUSDT = Record<PriceAsset, number | null>;

export type PriceFeedResult = {
  ok: boolean;
  priceUSDT: PriceUSDT;
  ts: number;
  stale: boolean;
  source: string;
  error?: string;
};

const COINGECKO = "https://api.coingecko.com/api/v3/simple/price";
const BINANCE = "https://api.binance.com/api/v3/ticker/price";

const COIN_ID: Record<Exclude<PriceAsset, "USDT">, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
};

const BINANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"] as const;
const REQUEST_TIMEOUT_MS = 3500;
const PREFER_CACHE_MS = 12_000;
const MAX_STALE_MS = 1000 * 60 * 60; // 1 hour

const EMPTY_PRICE: PriceUSDT = {
  USDT: 1,
  BTC: null,
  ETH: null,
  SOL: null,
  XRP: null,
};

type CacheRow = {
  priceUSDT: PriceUSDT;
  ts: number;
  source: string;
};

declare global {
  var __openbookPriceFeedCache: CacheRow | undefined;
}

function getCache() {
  return globalThis.__openbookPriceFeedCache || null;
}

function setCache(next: CacheRow) {
  globalThis.__openbookPriceFeedCache = next;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJsonWithTimeout(url: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromCoingecko(vs: "usdt" | "usd"): Promise<PriceUSDT | null> {
  const ids = Object.values(COIN_ID).join(",");
  const url = `${COINGECKO}?ids=${encodeURIComponent(ids)}&vs_currencies=${vs}`;
  const json = (await fetchJsonWithTimeout(url)) as Record<string, Record<string, unknown>> | null;
  if (!json) return null;

  const btc = toNumber(json[COIN_ID.BTC]?.[vs]);
  const eth = toNumber(json[COIN_ID.ETH]?.[vs]);
  const sol = toNumber(json[COIN_ID.SOL]?.[vs]);
  const xrp = toNumber(json[COIN_ID.XRP]?.[vs]);
  if (btc == null && eth == null && sol == null && xrp == null) return null;

  return {
    USDT: 1,
    BTC: btc,
    ETH: eth,
    SOL: sol,
    XRP: xrp,
  };
}

async function fromBinance(): Promise<PriceUSDT | null> {
  const symbols = encodeURIComponent(JSON.stringify(BINANCE_SYMBOLS));
  const url = `${BINANCE}?symbols=${symbols}`;
  const json = (await fetchJsonWithTimeout(url)) as Array<{ symbol: string; price: string }> | null;
  if (!Array.isArray(json) || json.length === 0) return null;

  const map = new Map<string, number | null>();
  json.forEach((r) => map.set(String(r.symbol || ""), toNumber(r.price)));

  const btc = map.get("BTCUSDT") ?? null;
  const eth = map.get("ETHUSDT") ?? null;
  const sol = map.get("SOLUSDT") ?? null;
  const xrp = map.get("XRPUSDT") ?? null;
  if (btc == null && eth == null && sol == null && xrp == null) return null;

  return {
    USDT: 1,
    BTC: btc,
    ETH: eth,
    SOL: sol,
    XRP: xrp,
  };
}

export async function getPriceFeed(): Promise<PriceFeedResult> {
  const now = Date.now();
  const cached = getCache();
  if (cached && now - cached.ts <= PREFER_CACHE_MS) {
    return {
      ok: true,
      priceUSDT: cached.priceUSDT,
      ts: cached.ts,
      stale: false,
      source: `${cached.source}:cache`,
    };
  }

  const errors: string[] = [];

  const cgUsdt = await fromCoingecko("usdt");
  if (cgUsdt) {
    const row: CacheRow = { priceUSDT: cgUsdt, ts: now, source: "coingecko-usdt" };
    setCache(row);
    return { ok: true, priceUSDT: row.priceUSDT, ts: row.ts, stale: false, source: row.source };
  }
  errors.push("coingecko-usdt");

  const cgUsd = await fromCoingecko("usd");
  if (cgUsd) {
    const row: CacheRow = { priceUSDT: cgUsd, ts: now, source: "coingecko-usd" };
    setCache(row);
    return { ok: true, priceUSDT: row.priceUSDT, ts: row.ts, stale: false, source: row.source };
  }
  errors.push("coingecko-usd");

  const bn = await fromBinance();
  if (bn) {
    const row: CacheRow = { priceUSDT: bn, ts: now, source: "binance" };
    setCache(row);
    return { ok: true, priceUSDT: row.priceUSDT, ts: row.ts, stale: false, source: row.source };
  }
  errors.push("binance");

  if (cached && now - cached.ts <= MAX_STALE_MS) {
    return {
      ok: true,
      priceUSDT: cached.priceUSDT,
      ts: cached.ts,
      stale: true,
      source: `${cached.source}:stale-cache`,
      error: `Live price fetch failed (${errors.join(", ")}). Using cached price.`,
    };
  }

  return {
    ok: false,
    priceUSDT: EMPTY_PRICE,
    ts: now,
    stale: true,
    source: "empty",
    error: `Live price fetch failed (${errors.join(", ")})`,
  };
}

