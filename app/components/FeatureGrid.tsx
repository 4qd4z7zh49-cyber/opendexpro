"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type Item = {
  title: string;
  href: string;
  icon: (active?: boolean) => ReactNode;
};

const items: Item[] = [
  {
    title: "New\nCurrency",
    href: "/markets",
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M12 3v18M7.5 7.5h6.2a3 3 0 0 1 0 6H7.5m0 0h6.6a3 3 0 0 1 0 6H7.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
      </svg>
    ),
  },
  {
    title: "AI Driven\nMining",
    href: "/mining",
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M7.5 11V8.8a4.5 4.5 0 1 1 9 0V11"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M7.2 11h9.6a2 2 0 0 1 2 2v5.4a2 2 0 0 1-2 2H7.2a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path
          d="M12 15.2v2.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.95"
        />
      </svg>
    ),
  },
  {
    title: "Transfer",
    href: "/wallet",
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M7 7h12M7 7l2.2-2.2M7 7l2.2 2.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path
          d="M17 17H5m12 0-2.2-2.2M17 17l-2.2 2.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
      </svg>
    ),
  },
  {
    title: "Customer\nSupport",
    href: "/support",
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M4.5 12a7.5 7.5 0 0 1 15 0v4.2a2.3 2.3 0 0 1-2.3 2.3H15"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path
          d="M6.3 13.2H5.5A2 2 0 0 1 3.5 11v-1.2a2 2 0 0 1 2-2h.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M17.7 13.2h.8a2 2 0 0 0 2-2v-1.2a2 2 0 0 0-2-2h-.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.95"
        />
      </svg>
    ),
  },
  {
    title: "VIP\nBenefits",
    href: "/vip-announcement",
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M6 18 4.3 8.5l4 2.7L12 5l3.7 6.2 4-2.7L18 18Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path
          d="M8 18h8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.95"
        />
      </svg>
    ),
  },
  {
    title: "Loan",
    href: "/loan",
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M6.5 8.5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path
          d="M8 13h8M12 10.5v5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.95"
        />
      </svg>
    ),
  },
];

export default function FeatureGrid({
  onVipBenefitsClick,
}: {
  onVipBenefitsClick?: () => void;
}) {
  return (
    <section className="featureGridWrap" aria-label="Actions">
      <div className="featureGrid5">
        {items.map((it) => (
          <Link
            key={it.title}
            href={it.href}
            className="featureTile"
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              if (it.href === "/vip-announcement" && onVipBenefitsClick) {
                event.preventDefault();
                onVipBenefitsClick();
              }
            }}
          >
            <span className="featureGlow" aria-hidden="true" />
            <span className="featureIcon">{it.icon()}</span>
            <span className="featureLabel">
              {it.title.split("\n").map((line, idx) => (
                <span key={idx} className="featureLabelLine">
                  {line}
                </span>
              ))}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
