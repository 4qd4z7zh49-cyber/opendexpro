import { NextResponse } from "next/server";

export const runtime = "nodejs"; // avoid edge quirks
export const revalidate = 60;    // Next cache hint (ISR-like)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = (searchParams.get("category") || "crypto").toLowerCase();

  // Only crypto list here. Commodities/Stocks = TradingView widgets (client).
  if (category !== "crypto") {
    return NextResponse.json({ data: [] });
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false",
      {
        // Server-side cache to reduce rate-limit + stabilize navigation
        next: { revalidate: 60 },
        headers: { accept: "application/json" },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `CoinGecko failed (${res.status})`, data: [] },
        { status: 200 } // <-- always 200 so UI doesn't hard-fail
      );
    }

    const data = await res.json();
    return NextResponse.json({ data: Array.isArray(data) ? data : [] });
  } catch {
    // return empty but not error (stable UX)
    return NextResponse.json({ error: "Network error", data: [] }, { status: 200 });
  }
}