"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getUserAuthHeaders } from "@/lib/clientAuth";

type Theme = "dark" | "light";
type Holdings = Record<string, number>;
type WalletResp = {
  ok?: boolean;
  error?: string;
  holdings?: Holdings;
};
type PriceResp = {
  ok?: boolean;
  error?: string;
  priceUSDT?: Record<string, number | null>;
};

type VipTier = {
  level: number;
  minSpend: number;
  eligibility: string;
  benefits: string[];
};

const VIP_TIERS: VipTier[] = [
  {
    level: 1,
    minSpend: 10_000,
    eligibility: "Users with a cumulative spend of $10,000 or more.",
    benefits: [
      "Access to basic trading tools and resources.",
      "Standard customer support with response time within 24 hours.",
      "Entry-level discounts on transaction fees.",
      "Monthly market insights and trend analysis.",
    ],
  },
  {
    level: 2,
    minSpend: 30_000,
    eligibility: "Users with a cumulative spend of $30,000 or more.",
    benefits: [
      "Priority access to advanced charting and trading tools.",
      "Reduced transaction fees (up to 5% discount).",
      "Dedicated support with response time within 12 hours.",
      "Early access to market reports, webinars, and exclusive investment opportunities.",
      "Enhanced alerts and notifications for potential investment opportunities.",
    ],
  },
  {
    level: 3,
    minSpend: 80_000,
    eligibility: "Users with a cumulative spend of $80,000 or more.",
    benefits: [
      "Full access to premium trading platforms, with advanced features such as automated trading and algorithmic trading support.",
      "Personalized portfolio review and advice from expert financial analysts.",
      "Reduced transaction fees (up to 10% discount).",
      "Dedicated account manager for tailored assistance.",
      "Exclusive invitations to private webinars, networking events, and investor roundtables.",
      "Priority access to high-potential investment opportunities in both traditional and emerging markets.",
    ],
  },
  {
    level: 4,
    minSpend: 150_000,
    eligibility: "Users with a cumulative spend of $150,000 or more.",
    benefits: [
      "Exclusive access to a fully customized trading dashboard with real-time data and analytics.",
      "Further reduced transaction fees (up to 15% discount).",
      "Personal one-on-one sessions with senior financial experts for advanced investment strategies.",
      "Early participation in private investment rounds or IPO offerings.",
      "Access to specialized investment vehicles such as hedge funds or high-net-worth individual (HNWI) products.",
      "Premium risk management tools, helping you minimize potential losses and maximize returns.",
    ],
  },
  {
    level: 5,
    minSpend: 300_000,
    eligibility: "Users with a cumulative spend of $300,000 or more.",
    benefits: [
      "Priority VIP support with a dedicated relationship manager available 24/7.",
      "Maximum discount on transaction fees (up to 20% discount).",
      "Tailored, hands-on guidance for complex trades and large-scale investments.",
      "Full access to exclusive investment products such as private equity, venture capital, and cryptocurrency offerings.",
      "Invitations to elite investor events, conferences, and private dinners with industry leaders.",
      "Custom reports and comprehensive analysis, including market trends and in-depth risk analysis specific to your investment portfolio.",
      "Direct access to trading platforms with institutional-grade features and liquidity.",
    ],
  },
];

function fmtMoney(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getVipLevel(balance: number) {
  for (let index = VIP_TIERS.length - 1; index >= 0; index -= 1) {
    if (balance >= VIP_TIERS[index].minSpend) return VIP_TIERS[index].level;
  }
  return 0;
}

export default function VipAnnouncementPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const [holdings, setHoldings] = useState<Holdings>({});
  const [prices, setPrices] = useState<Record<string, number | null>>({ USDT: 1 });
  const [loadingStats, setLoadingStats] = useState(true);
  const isLight = theme === "light";
  const totalBalance = useMemo(() => {
    const entries = Object.entries(holdings);
    if (!entries.length) return 0;
    return entries.reduce((sum, [asset, amount]) => {
      const a = Number(amount || 0);
      const p = asset === "USDT" ? 1 : Number(prices[asset] ?? 0);
      if (!Number.isFinite(a) || !Number.isFinite(p)) return sum;
      return sum + a * p;
    }, 0);
  }, [holdings, prices]);
  const currentLevel = useMemo(() => getVipLevel(totalBalance), [totalBalance]);
  const nextTier = useMemo(() => VIP_TIERS.find((tier) => tier.level === currentLevel + 1) || null, [currentLevel]);
  const currentTierMin = useMemo(() => {
    if (currentLevel <= 0) return 0;
    return VIP_TIERS.find((tier) => tier.level === currentLevel)?.minSpend || 0;
  }, [currentLevel]);
  const progressPercent = useMemo(() => {
    if (!nextTier) return 100;
    const span = Math.max(1, nextTier.minSpend - currentTierMin);
    return Math.max(0, Math.min(100, ((totalBalance - currentTierMin) / span) * 100));
  }, [currentTierMin, nextTier, totalBalance]);
  const progressText = useMemo(() => {
    if (!nextTier) return "Maximum VIP level unlocked.";
    const remaining = Math.max(0, nextTier.minSpend - totalBalance);
    return `${fmtMoney(remaining)} more to reach VIP ${nextTier.level}.`;
  }, [nextTier, totalBalance]);

  useEffect(() => {
    const readTheme = () => {
      const next = document.documentElement.getAttribute("data-ob-theme");
      setTheme(next === "dark" ? "dark" : "light");
    };

    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ob-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      try {
        const headers = await getUserAuthHeaders();
        const [walletRes, priceRes] = await Promise.all([
          fetch("/api/wallet/state", {
            cache: "no-store",
            headers,
          }),
          fetch("/api/prices", { cache: "no-store" }),
        ]);
        const walletJson = (await walletRes.json().catch(() => ({}))) as WalletResp;
        const priceJson = (await priceRes.json().catch(() => ({}))) as PriceResp;
        if (!active) return;
        if (walletRes.ok && walletJson.ok && walletJson.holdings) {
          setHoldings(walletJson.holdings);
        }
        if (priceRes.ok && priceJson.ok && priceJson.priceUSDT) {
          setPrices(priceJson.priceUSDT);
        }
      } finally {
        if (active) setLoadingStats(false);
      }
    };

    void loadStats();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      className={
        isLight
          ? "min-h-[calc(100vh-72px)] bg-[#edf5ff] px-4 pt-5 pb-28"
          : "min-h-[calc(100vh-72px)] bg-[#050816] px-4 pt-5 pb-28"
      }
    >
      <div className="mx-auto max-w-[680px] space-y-4">
        <section
          className={
            isLight
              ? "rounded-[28px] border border-sky-200/80 bg-white/85 p-5 shadow-[0_24px_70px_rgba(82,132,198,.14)] backdrop-blur-xl"
              : "rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_26px_70px_rgba(0,0,0,.45)] backdrop-blur-xl"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={
                  isLight
                    ? "text-[28px] font-extrabold tracking-[-0.03em] text-slate-900"
                    : "text-[28px] font-extrabold tracking-[-0.03em] text-white"
                }
              >
                VIP Benefits
              </div>
              <div className={isLight ? "mt-1 text-sm text-slate-600" : "mt-1 text-sm text-white/60"}>
                VIP level classification for trading and investment.
              </div>
            </div>
            <Link
              href="/home"
              className={
                isLight
                  ? "inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700"
                  : "inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
              }
            >
              Back Home
            </Link>
          </div>

          <div
            className={
              isLight
                ? "mt-5 rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,252,233,.96),rgba(253,230,138,.72),rgba(255,255,255,.86))] p-5 text-slate-900 shadow-[0_20px_50px_rgba(216,170,74,.18)]"
                : "mt-5 rounded-[24px] border border-amber-300/20 bg-[linear-gradient(135deg,rgba(64,45,15,.78),rgba(186,137,38,.26),rgba(255,255,255,.04))] p-5 text-white"
            }
          >
            <div className="text-xs font-black uppercase tracking-[0.26em] text-amber-700/80 dark:text-amber-200/80">
              VIP Program
            </div>
            <p className={isLight ? "mt-3 text-sm leading-7 text-slate-700" : "mt-3 text-sm leading-7 text-white/74"}>
              To provide our valued traders and investors with tailored benefits and exclusive opportunities, we have
              established a VIP level system based on the cumulative spending in USD. As users engage more with the
              platform through investments, trades, and other activities, they can unlock higher VIP levels. Each level
              grants access to exclusive features, personalized services, and enhanced tools to optimize your trading
              experience.
            </p>
          </div>

          <div
            className={
              isLight
                ? "mt-4 rounded-[24px] border border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,.96),rgba(255,255,255,.92))] p-4 shadow-[0_16px_40px_rgba(82,132,198,.1)]"
                : "mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className={isLight ? "text-xs font-black uppercase tracking-[0.22em] text-sky-700/80" : "text-xs font-black uppercase tracking-[0.22em] text-sky-200/80"}>
                  Current VIP Status
                </div>
                <div className={isLight ? "mt-2 text-2xl font-extrabold tracking-[-0.03em] text-slate-900" : "mt-2 text-2xl font-extrabold tracking-[-0.03em] text-white"}>
                  {currentLevel > 0 ? `VIP Level ${currentLevel}` : "No VIP level yet"}
                </div>
                <div className={isLight ? "mt-1 text-sm text-slate-600" : "mt-1 text-sm text-white/64"}>
                  {loadingStats ? "Checking your current balance..." : `Current balance ${fmtMoney(totalBalance)}`}
                </div>
              </div>
              <div
                className={
                  isLight
                    ? "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700"
                    : "rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-200"
                }
              >
                {currentLevel > 0 ? `VIP ${currentLevel}` : "Starter"}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className={isLight ? "text-sm font-semibold text-slate-600" : "text-sm font-semibold text-white/68"}>
                  VIP Progress
                </div>
                <div className={isLight ? "text-xs font-semibold text-slate-500" : "text-xs font-semibold text-white/56"}>
                  {nextTier ? `Next target VIP ${nextTier.level}` : "Top tier complete"}
                </div>
              </div>
              <div className={isLight ? "mt-2 h-3 overflow-hidden rounded-full bg-slate-200" : "mt-2 h-3 overflow-hidden rounded-full bg-white/10"}>
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#fcd34d,#fde68a)] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className={isLight ? "mt-2 text-sm text-slate-600" : "mt-2 text-sm text-white/68"}>{progressText}</div>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {VIP_TIERS.map((tier) => (
              <a
                key={tier.level}
                href={`#vip-level-${tier.level}`}
                className={
                  isLight
                    ? "inline-flex shrink-0 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700"
                    : "inline-flex shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
                }
              >
                VIP {tier.level}
              </a>
            ))}
          </div>
        </section>

        <section
          className={
            isLight
              ? "rounded-[28px] border border-sky-200/80 bg-white/82 p-4 shadow-[0_18px_50px_rgba(82,132,198,.12)] backdrop-blur-xl"
              : "rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_18px_50px_rgba(0,0,0,.38)] backdrop-blur-xl"
          }
        >
          <div className={isLight ? "mb-3 text-sm font-semibold text-slate-500" : "mb-3 text-sm font-semibold text-white/60"}>
            VIP Level Details
          </div>

          <div className="space-y-3">
            {VIP_TIERS.map((tier) => (
              <article
                key={tier.level}
                id={`vip-level-${tier.level}`}
                className={
                  isLight
                    ? "scroll-mt-6 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4"
                    : "scroll-mt-6 rounded-[22px] border border-white/10 bg-white/5 p-4"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={isLight ? "text-xl font-bold text-slate-900" : "text-xl font-bold text-white"}>
                      VIP Level {tier.level}
                    </div>
                    <div className={isLight ? "mt-2 text-sm text-slate-700" : "mt-2 text-sm text-white/76"}>
                      <span className="font-semibold">Eligibility:</span> {tier.eligibility}
                    </div>
                  </div>
                  <div
                    className={
                      isLight
                        ? "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700"
                        : "rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-200"
                    }
                  >
                    VIP {tier.level}
                  </div>
                </div>

                <div className={isLight ? "mt-4 text-sm font-semibold text-slate-500" : "mt-4 text-sm font-semibold text-white/60"}>
                  Benefits:
                </div>
                <ul className="mt-3 space-y-2">
                  {tier.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <span
                        className={
                          isLight
                            ? "mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                            : "mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-300"
                        }
                      />
                      <span className={isLight ? "text-sm leading-6 text-slate-700" : "text-sm leading-6 text-white/76"}>
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className={
            isLight
              ? "rounded-[28px] border border-sky-200/80 bg-white/82 p-5 shadow-[0_18px_50px_rgba(82,132,198,.12)] backdrop-blur-xl"
              : "rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_18px_50px_rgba(0,0,0,.38)] backdrop-blur-xl"
          }
        >
          <div
            className={
              isLight
                ? "rounded-[22px] border border-sky-100 bg-[linear-gradient(135deg,rgba(239,246,255,.96),rgba(255,255,255,.86))] p-4 text-slate-900"
                : "rounded-[22px] border border-white/10 bg-white/5 p-4 text-white"
            }
          >
            <div className={isLight ? "text-sm font-semibold uppercase tracking-[0.22em] text-sky-700/80" : "text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80"}>
              Closing Note
            </div>
            <p className={isLight ? "mt-3 text-sm leading-7 text-slate-700" : "mt-3 text-sm leading-7 text-white/76"}>
              As you progress through these VIP levels, your trading and investing experience will be enhanced with
              additional features that help you optimize strategies, reduce costs, and access higher-value investment
              opportunities. We&apos;re committed to supporting your financial growth every step of the way.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
