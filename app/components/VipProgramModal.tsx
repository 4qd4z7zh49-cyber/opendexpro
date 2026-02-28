"use client";

import Link from "next/link";

type Theme = "dark" | "light";

type VipPromoTier = {
  level: number;
  amount: string;
  style: "silver" | "gold" | "emerald";
  featured?: boolean;
};

const VIP_LEVELS: VipPromoTier[] = [
  { level: 1, amount: "$10,000+", style: "silver" },
  { level: 2, amount: "$30,000+", style: "gold" },
  { level: 3, amount: "$80,000+", style: "gold", featured: true },
  { level: 4, amount: "$150,000+", style: "emerald" },
  { level: 5, amount: "$300,000+", style: "gold" },
] as const;

function medalPalette(style: VipPromoTier["style"]) {
  if (style === "silver") {
    return {
      crown: "#f4f7fb",
      shellA: "#f7fbff",
      shellB: "#d0d8e5",
      shellC: "#414c61",
      border: "#e4ebf5",
      text: "#f8fafc",
      laurel: "#dfe7f2",
      ribbonA: "#f8fbff",
      ribbonB: "#bac6d6",
      ribbonText: "#243040",
    };
  }
  if (style === "emerald") {
    return {
      crown: "#f5f1de",
      shellA: "#edf6e8",
      shellB: "#81c784",
      shellC: "#244330",
      border: "#e0e8d0",
      text: "#fcfdf8",
      laurel: "#b0d7ab",
      ribbonA: "#f0eddc",
      ribbonB: "#97c58e",
      ribbonText: "#1d3825",
    };
  }
  return {
    crown: "#fff1bf",
    shellA: "#fff4c8",
    shellB: "#f0b83f",
    shellC: "#4f2407",
    border: "#ffefbf",
    text: "#fff4cf",
    laurel: "#f4ca65",
    ribbonA: "#fff0b4",
    ribbonB: "#d08a19",
    ribbonText: "#4a2607",
  };
}

function VipMedal({ level, amount, style, featured = false }: VipPromoTier) {
  const palette = medalPalette(style);

  return (
    <div
      className={[
        "flex min-w-0 flex-col items-center text-center",
        featured ? "translate-y-[-2px]" : "translate-y-0",
      ].join(" ")}
    >
      <div
        className={[
          "relative drop-shadow-[0_12px_20px_rgba(0,0,0,.3)]",
          featured ? "h-[132px] w-[80px] sm:h-[150px] sm:w-[92px]" : "h-[114px] w-[68px] sm:h-[128px] sm:w-[76px]",
        ].join(" ")}
      >
        <svg viewBox="0 0 116 176" className="h-full w-full" role="img" aria-hidden="true">
          <defs>
            <linearGradient id={`shell-${style}-${level}`} x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor={palette.shellA} />
              <stop offset="46%" stopColor={palette.shellB} />
              <stop offset="100%" stopColor={palette.shellC} />
            </linearGradient>
            <linearGradient id={`ribbon-${style}-${level}`} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor={palette.ribbonA} />
              <stop offset="100%" stopColor={palette.ribbonB} />
            </linearGradient>
          </defs>

          <g opacity="0.98">
            <path
              d="M26 55c-7 13-9 31-7 46 3 22 11 36 22 47"
              fill="none"
              stroke={palette.laurel}
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M90 55c7 13 9 31 7 46-3 22-11 36-22 47"
              fill="none"
              stroke={palette.laurel}
              strokeWidth="9"
              strokeLinecap="round"
            />
            {[0, 1, 2, 3, 4].map((leaf) => (
              <g key={`${style}-${level}-${leaf}`}>
                <ellipse
                  cx={18 + leaf * 5}
                  cy={69 + leaf * 18}
                  rx="7"
                  ry="15"
                  transform={`rotate(${-30 + leaf * 4} ${18 + leaf * 5} ${69 + leaf * 18})`}
                  fill={palette.laurel}
                  stroke={palette.shellC}
                  strokeOpacity="0.28"
                  strokeWidth="1.2"
                />
                <ellipse
                  cx={98 - leaf * 5}
                  cy={69 + leaf * 18}
                  rx="7"
                  ry="15"
                  transform={`rotate(${30 - leaf * 4} ${98 - leaf * 5} ${69 + leaf * 18})`}
                  fill={palette.laurel}
                  stroke={palette.shellC}
                  strokeOpacity="0.28"
                  strokeWidth="1.2"
                />
              </g>
            ))}
          </g>

          <path
            d="M58 16 65 32 80 34 70 45 73 60 58 51 43 60 46 45 36 34 51 32Z"
            fill={palette.crown}
            stroke={palette.ribbonB}
            strokeWidth="2"
          />
          <path
            d="M34 40h48l-4 77-20 26-20-26Z"
            fill={`url(#shell-${style}-${level})`}
            stroke={palette.border}
            strokeWidth="3"
          />
          <path
            d="M41 55h34l-4 54-13 18-13-18Z"
            fill="#0f172a"
            opacity="0.18"
          />
          <circle cx="58" cy="49" r="4.8" fill={palette.crown} opacity="0.94" />
          <path d="M46 58h24" stroke={palette.crown} strokeWidth="2.2" strokeLinecap="round" opacity="0.8" />

          <text x="58" y="92" textAnchor="middle" fontSize="22" fontWeight="800" fill={palette.text}>
            VIP
          </text>
          <text x="58" y="126" textAnchor="middle" fontSize="34" fontWeight="900" fill={palette.text}>
            {level}
          </text>

          <path d="M18 133h80l-10 26H28Z" fill={palette.shellC} opacity="0.2" />
          <path
            d="M14 132h88l-9 28H23Z"
            fill={`url(#ribbon-${style}-${level})`}
            stroke={palette.shellC}
            strokeOpacity="0.42"
            strokeWidth="1.8"
          />
          <text x="58" y="151" textAnchor="middle" fontSize="13" fontWeight="900" fill={palette.ribbonText}>
            VIP {level}
          </text>
        </svg>
      </div>

      <div
        className={[
          "mt-3 text-center font-black tracking-[-0.01em] text-[#fff7dd] drop-shadow-[0_8px_18px_rgba(0,0,0,.5)]",
          featured ? "text-[12px] sm:text-[13px]" : "text-[10px] sm:text-[11px]",
        ].join(" ")}
      >
        {amount}
      </div>
      <div
        className={[
          "mt-1 text-center font-black uppercase tracking-[0.02em] text-[#fffaf2] drop-shadow-[0_8px_18px_rgba(0,0,0,.52)]",
          featured ? "text-[18px] sm:text-[20px]" : "text-[13px] sm:text-[15px]",
        ].join(" ")}
      >
        VIP {level}
      </div>
    </div>
  );
}

export default function VipProgramModal({
  open,
  theme,
  onClose,
}: {
  open: boolean;
  theme: Theme;
  onClose: () => void;
}) {
  if (!open) return null;

  const isLight = theme === "light";

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-3 py-4">
      <button
        type="button"
        aria-label="Close VIP benefits"
        onClick={onClose}
        className="absolute inset-0 bg-black/68 backdrop-blur-[3px]"
      />

      <div
        className={[
          "relative w-full max-w-[420px] overflow-hidden rounded-[24px] border px-5 pt-10 pb-8 shadow-[0_36px_110px_rgba(0,0,0,.58)]",
          isLight
            ? "border-amber-200/40 bg-[radial-gradient(circle_at_50%_38%,rgba(255,210,106,.38),transparent_20%),radial-gradient(circle_at_18%_14%,rgba(255,189,77,.16),transparent_14%),radial-gradient(circle_at_82%_26%,rgba(255,214,102,.18),transparent_14%),linear-gradient(180deg,#101c34,#171a2d_44%,#171222)] text-white"
            : "border-amber-300/20 bg-[radial-gradient(circle_at_50%_38%,rgba(255,210,106,.26),transparent_20%),radial-gradient(circle_at_18%_14%,rgba(255,189,77,.14),transparent_14%),radial-gradient(circle_at_82%_26%,rgba(255,214,102,.16),transparent_14%),linear-gradient(180deg,#0f1830,#121728_44%,#140f1f)] text-white",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close VIP program popup"
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/18 bg-black/24 text-white/88 backdrop-blur-sm transition-colors hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="pointer-events-none absolute inset-0 opacity-90">
          <div className="absolute left-2 top-14 h-3 w-3 rounded-full bg-amber-200 shadow-[0_0_24px_rgba(251,191,36,.95)]" />
          <div className="absolute left-10 top-24 h-1.5 w-1.5 rounded-full bg-amber-100 shadow-[0_0_12px_rgba(251,191,36,.92)]" />
          <div className="absolute right-5 top-16 h-2.5 w-2.5 rounded-full bg-amber-100 shadow-[0_0_18px_rgba(251,191,36,.92)]" />
          <div className="absolute right-14 top-36 h-1.5 w-1.5 rounded-full bg-amber-100 shadow-[0_0_12px_rgba(251,191,36,.92)]" />
          <div className="absolute left-16 top-[46%] h-2 w-2 rounded-full bg-amber-100/90 shadow-[0_0_16px_rgba(251,191,36,.92)]" />
          <div className="absolute right-12 top-[58%] h-1.5 w-1.5 rounded-full bg-amber-100 shadow-[0_0_12px_rgba(251,191,36,.92)]" />
          <div className="absolute left-6 bottom-28 h-2 w-2 rounded-full bg-amber-100 shadow-[0_0_18px_rgba(251,191,36,.92)]" />
          <div className="absolute right-8 bottom-20 h-2.5 w-2.5 rounded-full bg-amber-100 shadow-[0_0_20px_rgba(251,191,36,.92)]" />
          <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,.08),transparent_22%),radial-gradient(circle_at_50%_50%,rgba(255,214,102,.16),transparent_32%),radial-gradient(circle_at_50%_72%,rgba(6,10,24,.46),transparent_38%)]" />
        </div>

        <div className="relative z-10">
          <div className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-[#fff1c5] drop-shadow-[0_6px_16px_rgba(0,0,0,.42)] sm:text-[13px]">
            Announcing Our Exclusive
          </div>
          <div className="mt-3 text-center text-[44px] font-black uppercase leading-[0.9] tracking-[-0.05em] text-transparent bg-[linear-gradient(180deg,#fff9e2,#f6cb59_48%,#d48d1d)] bg-clip-text drop-shadow-[0_12px_28px_rgba(245,158,11,.28)] sm:text-[64px]">
            VIP Program
          </div>

          <div className="mt-8 flex items-end justify-center gap-1.5 sm:gap-2">
            {VIP_LEVELS.map((tier) => (
              <VipMedal key={`vip-promo-${tier.level}`} {...tier} />
            ))}
          </div>

          <div className="mx-auto mt-8 max-w-[300px] text-center text-[18px] font-semibold leading-[1.4] tracking-[-0.02em] text-[#fffaf2] drop-shadow-[0_10px_22px_rgba(0,0,0,.5)] sm:max-w-[340px] sm:text-[24px]">
            Unlock Premium Benefits
            <br />
            &amp; Exclusive Rewards
          </div>

          <div className="mx-auto mt-6 max-w-[320px] text-center text-[21px] font-semibold leading-[1.36] tracking-[-0.02em] text-[#fff7e9] drop-shadow-[0_10px_22px_rgba(0,0,0,.56)] sm:max-w-[360px] sm:text-[30px]">
            Elevate Your Investments
            <br />
            to VIP Status!
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              href="/vip-announcement"
              onClick={onClose}
              className="inline-flex min-w-[206px] items-center justify-center rounded-full border border-amber-100/80 bg-[linear-gradient(180deg,#fbe39a,#efc043_54%,#d18a1a)] px-7 py-3.5 text-[19px] font-black tracking-[-0.02em] text-[#2b1403] shadow-[0_20px_40px_rgba(245,158,11,.34)] ring-2 ring-amber-100/30"
            >
              Join Now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
