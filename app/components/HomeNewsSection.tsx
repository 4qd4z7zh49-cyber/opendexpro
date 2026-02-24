"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
};

type NewsApiResp = {
  ok?: boolean;
  error?: string;
  crypto?: NewsItem[];
  business?: NewsItem[];
  updatedAt?: string;
};

function fmtTime(iso: string) {
  const ts = Date.parse(String(iso || ""));
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NewsCard({
  title,
  items,
  loading,
}: {
  title: string;
  items: NewsItem[];
  loading: boolean;
}) {
  return (
    <article className="homeNewsCard">
      <div className="homeNewsHeader">
        <h3 className="homeNewsTitle">{title}</h3>
        <span className="homeNewsBadge">Live</span>
      </div>

      {loading ? (
        <div className="homeNewsState">Loading news...</div>
      ) : items.length === 0 ? (
        <div className="homeNewsState">No articles right now.</div>
      ) : (
        <ul className="homeNewsList">
          {items.map((item) => (
            <li key={item.id} className="homeNewsItem">
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer noopener"
                className="homeNewsLink"
              >
                <span className="homeNewsItemTitle">{item.title}</span>
                <span className="homeNewsMeta">
                  <span>{item.source}</span>
                  {item.publishedAt ? <span>•</span> : null}
                  {item.publishedAt ? <span>{fmtTime(item.publishedAt)}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function HomeNewsSection() {
  const [crypto, setCrypto] = useState<NewsItem[]>([]);
  const [business, setBusiness] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/news", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as NewsApiResp;
      setCrypto(Array.isArray(j.crypto) ? j.crypto : []);
      setBusiness(Array.isArray(j.business) ? j.business : []);
      setUpdatedAt(String(j.updatedAt || ""));
      setError(!j?.ok && j?.error ? String(j.error) : "");
    } catch {
      setError("Failed to load latest news.");
      setCrypto([]);
      setBusiness([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const updatedLabel = useMemo(() => {
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts)) return "";
    return `Updated ${new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [updatedAt]);

  return (
    <section className="homeNewsWrap" aria-label="Latest market news">
      <div className="homeNewsTop">
        <h2 className="homeNewsHeading">Market News</h2>
        {updatedLabel ? <span className="homeNewsUpdated">{updatedLabel}</span> : null}
      </div>

      {error ? <p className="homeNewsError">{error}</p> : null}

      <div className="homeNewsGrid">
        <NewsCard title="Crypto News" items={crypto} loading={loading} />
        <NewsCard title="Business News" items={business} loading={loading} />
      </div>
    </section>
  );
}
