import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 300;

type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
};

type ParsedRssItem = {
  title: string;
  link: string;
  pubDate: string;
};

const FEED_URLS = {
  crypto:
    "https://news.google.com/rss/search?q=cryptocurrency+OR+bitcoin+OR+ethereum&hl=en-US&gl=US&ceid=US:en",
  business:
    "https://news.google.com/rss/search?q=business+OR+economy+OR+markets&hl=en-US&gl=US&ceid=US:en",
} as const;

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m?.[1] ? decodeXml(m[1].trim()) : "";
}

function parseRss(xml: string, limit = 8): ParsedRssItem[] {
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  return itemMatches
    .slice(0, limit)
    .map((block) => ({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
    }))
    .filter((item) => item.title && item.link);
}

function normalizeItem(item: ParsedRssItem, index: number, kind: "crypto" | "business"): NewsItem {
  const titleRaw = String(item.title || "").replace(/\s+/g, " ").trim();
  const splitAt = titleRaw.lastIndexOf(" - ");

  const title = splitAt > 0 ? titleRaw.slice(0, splitAt).trim() : titleRaw;
  const source = splitAt > 0 ? titleRaw.slice(splitAt + 3).trim() : kind === "crypto" ? "Crypto" : "Business";

  const ts = Date.parse(String(item.pubDate || ""));
  const publishedAt = Number.isFinite(ts) ? new Date(ts).toISOString() : "";

  return {
    id: `${kind}-${index}-${title.slice(0, 24).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    link: item.link,
    source,
    publishedAt,
  };
}

async function readFeed(url: string) {
  const res = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "Mozilla/5.0 opendex/1.0",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Feed request failed (${res.status})`);
  }

  return res.text();
}

export async function GET() {
  try {
    const [cryptoXml, businessXml] = await Promise.all([
      readFeed(FEED_URLS.crypto),
      readFeed(FEED_URLS.business),
    ]);

    const crypto = parseRss(cryptoXml, 8).map((item, index) => normalizeItem(item, index, "crypto"));
    const business = parseRss(businessXml, 8).map((item, index) =>
      normalizeItem(item, index, "business")
    );

    return NextResponse.json({
      ok: true,
      crypto,
      business,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch news";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        crypto: [],
        business: [],
        updatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
