import { NextResponse } from "next/server";
import { getPriceFeed } from "@/lib/priceFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
type PriceUSDT = Record<Asset, number | null>;

const EMPTY_PRICE: PriceUSDT = {
  USDT: 1,
  BTC: null,
  ETH: null,
  SOL: null,
  XRP: null,
};

export async function GET() {
  try {
    const feed = await getPriceFeed();
    if (!feed.ok) {
      return NextResponse.json(
        { ok: false, error: feed.error || "price fetch failed", priceUSDT: EMPTY_PRICE, ts: feed.ts },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      priceUSDT: feed.priceUSDT,
      ts: feed.ts,
      stale: feed.stale,
      source: feed.source,
      warning: feed.stale ? feed.error || "Using cached prices" : "",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message, priceUSDT: EMPTY_PRICE, ts: Date.now() },
      { status: 200 }
    );
  }
}
