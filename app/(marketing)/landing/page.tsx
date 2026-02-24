'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const HERO_HEADLINES = [
  'AI powered trading platform crafted for your profit',
  'NEXT-GEN AI trading platform built to boost your profits',
] as const;

export default function HomeLanding() {
  const logoRef = useRef<HTMLImageElement | null>(null);
  const [year, setYear] = useState<string>('');
  const [headlineIndex, setHeadlineIndex] = useState(0);

  useEffect(() => {
    // Avoid SSR/client hydration mismatch by computing time-based values on the client.
    const yearFrame = window.requestAnimationFrame(() => {
      setYear(String(new Date().getFullYear()));
    });

    const onScroll = () => {
      if (!logoRef.current) return;
      const y = window.scrollY;
      const opacity = Math.max(0, 0.08 - y / 900);
      logoRef.current.style.opacity = String(opacity);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(yearFrame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setHeadlineIndex((prev) => (prev + 1) % HERO_HEADLINES.length);
    }, 4200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="lp">
      <style>{`
        :root{color-scheme: dark;}
        body{margin:0;}
        .lp{min-height:100vh; background:#050607; color:#fff;}

        /* top bar */
        .topbar{
          position:sticky; top:0; z-index:50;
          background:rgba(0,0,0,.55);
          backdrop-filter: blur(12px);
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .topbarInner{
          max-width:980px; margin:0 auto;
          padding:12px 14px;
          display:flex; align-items:center; gap:12px;
          flex-wrap: nowrap;
        }
        .brand{display:flex; align-items:center; gap:10px; font-weight:900;}
        .mark{
          width:30px; height:30px; border-radius:10px;
          background:linear-gradient(135deg, rgba(34,211,238,.95), rgba(59,130,246,.95));
          display:flex; align-items:center; justify-content:center;
          color:#031018; font-weight:1000;
        }
        .name{font-size:18px; letter-spacing:.4px; font-weight:1000;}
        .spacer{flex:1;}
        .cta{
          border:0; border-radius:10px;
          padding:10px 14px;
          font-weight:1000; color:#fff;
          background:linear-gradient(135deg, rgba(37,99,235,1), rgba(29,78,216,1));
          box-shadow:0 14px 34px rgba(37,99,235,.24);
          display:flex;
          align-items:center;
          justify-content:center;
          white-space:nowrap;
          font-size:14px;
        }
        .menu{
          width:42px; height:42px; border-radius:10px;
          border:1px solid rgba(255,255,255,.10);
          background:rgba(255,255,255,.04);
          color:#e5e7eb; font-size:18px;
          flex: 0 0 auto;
        }

        /* background */
        .bg{
          position: relative;
          background:
            radial-gradient(900px 420px at 50% 10%, rgba(59,130,246,.20), transparent 60%),
            radial-gradient(900px 420px at 0% 20%, rgba(34,211,238,.14), transparent 55%),
            #050607;
        }

        /* hero background logo (behind content) */
        .heroLogo{
          position: fixed;
          inset: 0;
          margin: auto;
          width: min(520px, 90vw);
          height: auto;
          opacity: .08;
          pointer-events: none;
          z-index: 0;
          filter: drop-shadow(0 24px 80px rgba(0,0,0,.55));
          will-change: opacity, transform;
          transform: translateZ(0) scale(1);
          animation: logoFloat 6s ease-in-out infinite;
        }
        @keyframes logoFloat{
          0%,100% { transform: translateZ(0) translateY(0) scale(1); }
          50%     { transform: translateZ(0) translateY(-6px) scale(1.01); }
        }
        @media (prefers-reduced-motion: reduce){
          .heroLogo{ animation: none; }
          .hTitle,.hSub,.heroGlow,.heroLine,.swipeItem,.hChar,.hFxLayer{ animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; transition: none !important; }
        }

        /* keep all content above the heroLogo */
        .layer{ position: relative; z-index: 1; }

        .container{max-width:1200px; margin:0 auto; padding:22px 14px 28px;}
        .hero{
          padding:72px 2px 28px;
          text-align:center;
          min-height: calc(100vh - 86px);
          display:flex;
          flex-direction:column;
          justify-content:center;
          gap:10px;
          overflow:hidden;
        }

        /* premium hero animation */
        .hero{position:relative;}
        .hTitle{
          opacity:0;
          transform: translateY(10px);
          animation:
            heroIn .85s cubic-bezier(.2,.8,.2,1) forwards,
            titleFloat 6s ease-in-out 1s infinite;
          text-shadow: 0 18px 80px rgba(0,0,0,.65);
          font-size: clamp(40px, 6.6vw, 88px);
          line-height: 1.12;
          letter-spacing: -0.9px;
          margin: 0 auto;
          width: 100%;
          max-width: 23ch;
          padding: 0 10px;
        }
        .hFx{
          display:inline-flex;
          flex-wrap:wrap;
          justify-content:center;
          align-items:baseline;
          row-gap:.14em;
          max-width:100%;
        }
        .hFxWrap{
          display:grid;
          place-items:center;
          width:100%;
        }
        .hFxLayer{
          grid-area: 1 / 1;
          position:relative;
          width:100%;
          display:flex;
          align-items:center;
          justify-content:center;
          transition: opacity .7s ease, transform .7s ease, filter .7s ease, visibility .7s ease;
        }
        .hFxLayer.isActive{
          opacity:1;
          transform: translateY(0);
          filter: blur(0);
          visibility: visible;
        }
        .hFxLayer.isInactive{
          opacity:0;
          transform: translateY(8px);
          filter: blur(2px);
          visibility: hidden;
          pointer-events:none;
        }
        .hWord{
          display:inline-flex;
          white-space:nowrap;
          margin-right:.28em;
        }
        .hWord:last-child{
          margin-right:0;
        }
        .hChar{
          display:inline-block;
          color: rgba(235,243,255,.84);
          text-shadow: 0 0 0 rgba(0,0,0,0);
          animation: letterSweep 3.6s ease-in-out infinite;
          will-change: color, text-shadow, transform;
        }
        .hSub{
          color:#a9b3c2;
          margin:12px auto 0;
          max-width:72ch;
          line-height:1.6;
          font-size: clamp(14px, 2.2vw, 18px);
          opacity:0;
          transform: translateY(8px);
          animation: heroIn .85s cubic-bezier(.2,.8,.2,1) forwards;
          animation-delay: .18s;
          padding: 0 14px;
        }
        .heroGlow{
          position:absolute;
          left:50%; top:-10px;
          transform: translateX(-50%);
          width:min(760px, 92vw);
          height:180px;
          pointer-events:none;
          background: radial-gradient(closest-side, rgba(59,130,246,.28), transparent 70%),
                      radial-gradient(closest-side, rgba(34,211,238,.18), transparent 65%);
          filter: blur(10px);
          opacity:.9;
          animation: glowPulse 3.6s ease-in-out infinite;
        }
        .heroLine{
          width:min(520px, 86vw);
          height:2px;
          margin: 18px auto 0;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,.85), rgba(59,130,246,.85), transparent);
          opacity:.55;
          animation: lineSweep 2.8s ease-in-out infinite;
        }
        @keyframes heroIn{
          from { opacity:0; transform: translateY(10px); filter: blur(4px); }
          to   { opacity:1; transform: translateY(0);   filter: blur(0); }
        }
        @keyframes titleFloat{
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-3px); }
        }
        @keyframes letterSweep{
          0%, 78%, 100% {
            color: rgba(235,243,255,.84);
            text-shadow: 0 0 0 rgba(0,0,0,0);
            transform: translateY(0);
          }
          88% {
            color: #ffffff;
            text-shadow:
              0 0 18px rgba(34,211,238,.55),
              0 0 38px rgba(59,130,246,.40);
            transform: translateY(-1px);
          }
          94% {
            color: #f8fbff;
            text-shadow:
              0 0 10px rgba(34,211,238,.35),
              0 0 26px rgba(59,130,246,.24);
            transform: translateY(0);
          }
        }
        @keyframes glowPulse{
          0%,100% { opacity:.65; transform: translateX(-50%) scale(1); }
          50%     { opacity:1;   transform: translateX(-50%) scale(1.03); }
        }
        @keyframes lineSweep{
          0%,100% { opacity:.35; transform: translateY(0); }
          50%     { opacity:.70; transform: translateY(-1px); }
        }

        /* auto-swipe partner text (no JS) */
        .swipeWrap{
          position:relative;
          width:min(820px, 92vw);
          margin: 14px auto 0;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.04);
          overflow:hidden;
          box-shadow: 0 18px 70px rgba(0,0,0,.55);
        }
        .swipeViewport{
          height: 74px;
          display:flex;
          align-items:center;
          justify-content:center;
          position:relative;
        }
        .swipeItem{
          position:absolute;
          inset:0;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:8px;
          opacity:0;
          transform: translateY(10px);
          animation: swipeFade 10s ease-in-out infinite;
        }
        .swipeItem:nth-child(2){
          animation-delay: 5s;
        }
        .swipeTitle{
          font-weight: 1000;
          letter-spacing: .2px;
          color:#e8edf6;
        }
        .swipeQuote{
          font-size: 13px;
          line-height: 1.45;
          color:#b7c0cf;
          max-width: 70ch;
        }
        .swipeQuote strong{color:#e5e7eb; font-weight:900;}
        @keyframes swipeFade{
          0%   { opacity:0; transform: translateY(10px); filter: blur(2px); }
          10%  { opacity:1; transform: translateY(0);   filter: blur(0); }
          40%  { opacity:1; transform: translateY(0); }
          50%  { opacity:0; transform: translateY(-10px); }
          100% { opacity:0; }
        }
        /* footer */
        .footer{max-width:980px; margin:0 auto; padding:22px 14px 40px; color:#cbd5e1;}
        .fGrid{display:grid; grid-template-columns:1fr; gap:14px;}
        .fTitle{font-weight:1000; color:#fff; margin:0 0 8px;}
        .logos{display:flex; gap:10px; flex-wrap:wrap; align-items:center;}
        .pill{padding:8px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04); font-weight:900;}
        .social{display:flex; gap:10px; align-items:center; flex-wrap:wrap;}
        .socialBtn{width:44px; height:44px; border-radius:999px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04); display:flex; align-items:center; justify-content:center; font-weight:1000;}
        .muted{color:#9aa4b2;}
        details{border:1px solid rgba(255,255,255,.08); border-radius:18px; background:rgba(255,255,255,.03); padding:12px 14px;}
        summary{cursor:pointer; font-weight:1000; color:#fff;}
        .small{font-size:13px; line-height:1.55;}

        @media (min-width: 820px){
          .hero{padding-top:28px;}
          .hTitle{font-size: clamp(56px, 5.4vw, 92px);}
          .fGrid{grid-template-columns:1.2fr .8fr;}
          .ctaBtns{flex-direction:row;}
        }

        /* mobile polish */
        @media (max-width: 520px){
          .topbarInner{padding:10px 12px; gap:10px;}
          .brand{gap:8px;}
          .name{font-size:16px; letter-spacing:.2px;}

          .cta{padding:9px 10px; border-radius:12px; font-size:13px;}
          .menu{width:40px; height:40px; border-radius:12px;}

          .container{padding:16px 12px 24px;}
          .hero{padding:54px 0 22px; min-height: calc(100vh - 74px);}

          .heroGlow{height:140px; top:-6px;}
          .hTitle{font-size: clamp(34px, 9.2vw, 56px); max-width: 18ch; padding: 0 8px;}
          .hSub{font-size:14px; padding: 0 12px;}
          .heroLine{margin-top:14px; width:min(440px, 86vw);}

          .swipeWrap{margin-top:12px; padding:12px 12px; border-radius:16px;}
          .swipeViewport{height:88px;}
          .swipeTitle{font-size:14px;}
          .swipeQuote{font-size:12.5px;}
        }
      `}</style>

      <div className="bg">
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={logoRef}
            className="heroLogo"
            src="/openbook.png"
            alt="OPENBOOKPRO"
          />
        </>
        <div className="layer">
        <div className="topbar">
          <div className="topbarInner">
            <div className="brand">
              <Image
                src="/openbook.png"
                alt="OPENBOOKPRO logo"
                width={34}
                height={34}
                style={{ borderRadius: 8 }}
                priority
              />
              <div className="name">OPENBOOKPRO</div>
            </div>
            <div className="spacer" />
            <Link className="cta" href="/login">
              Sign up / Login
            </Link>
            <button className="menu" type="button" aria-label="menu">
              ☰
            </button>
          </div>
        </div>

        <div className="container">
          <div className="hero">
            <div className="heroGlow" />
            <h1 className="hTitle" aria-label={HERO_HEADLINES[headlineIndex]}>
              <span className="hFxWrap">
                {HERO_HEADLINES.map((headline, phraseIdx) => (
                  <span
                    key={headline}
                    className={`hFxLayer ${phraseIdx === headlineIndex ? 'isActive' : 'isInactive'}`}
                    aria-hidden={phraseIdx !== headlineIndex}
                  >
                    <span className="hFx">
                      {headline.split(' ').map((word, wordIdx) => (
                        <span key={`${phraseIdx}-${wordIdx}-${word}`} className="hWord">
                          {word.split('').map((ch, charIdx) => (
                            <span
                              key={`${phraseIdx}-${wordIdx}-${charIdx}-${ch}`}
                              className="hChar"
                              style={{ animationDelay: `${(wordIdx * 0.12 + charIdx * 0.035).toFixed(3)}s` }}
                            >
                              {ch}
                            </span>
                          ))}
                        </span>
                      ))}
                    </span>
                  </span>
                ))}
              </span>
            </h1>
            <p className="hSub">Trade safely with real market data.</p>
            <div className="heroLine" />

            <div className="swipeWrap" aria-label="partner highlight">
              <div className="swipeViewport">
                <div className="swipeItem">
                  <div className="swipeTitle">A Solana DEX built by Chads</div>
                  <div className="swipeQuote">100% on-chain and non-custodial orderbook</div>
                </div>

                <div className="swipeItem">
                  <div className="swipeTitle">Quote of the day: J.P. Morgan</div>
                  <div className="swipeQuote">
                    “Anyone can be a millionaire, but to become a billionaire you need an astrologer.” <strong>— J.P. Morgan</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="footer">
          <div className="fGrid">
            <div>
              <div className="fTitle">Official partners</div>
              <div className="logos">
                <span className="pill">Newcastle</span>
                <span className="pill">Partner</span>
                <span className="pill">Award</span>
              </div>

              <div style={{ height: 14 }} />
              <div className="fTitle">Follow us on</div>
              <div className="social">
                <div className="socialBtn">in</div>
                <div className="socialBtn">▶</div>
                <div className="socialBtn">X</div>
                <div className="socialBtn">f</div>
                <div className="socialBtn">◎</div>
              </div>

              <div style={{ height: 14 }} />
              <div className="logos">
                <span className="pill">Mastercard</span>
                <span className="pill">VISA</span>
                <span className="pill">Skrill</span>
                <span className="pill">NETELLER</span>
                <span className="pill">UnionPay</span>
              </div>
            </div>

            <div>
              <details open>
                <summary>Risk Warning</summary>
                <div style={{ height: 10 }} />
                <div className="small">
                  Trading digital assets involves a high level of risk and may result in partial or total loss of capital.
                  Prices can be extremely volatile and may move rapidly due to market liquidity, leverage, news flow, and
                  macroeconomic events. You should only trade with funds you can afford to lose and carefully assess whether
                  these products are appropriate for your financial situation and risk tolerance.
                </div>
              </details>

              <div style={{ height: 12 }} />
              <details>
                <summary>General Disclaimer</summary>
                <div style={{ height: 10 }} />
                <div className="small">
                  OPENBOOKPRO provides market information and platform tools for general informational purposes only. Nothing
                  on this website constitutes investment, legal, tax, or accounting advice, and no content should be
                  interpreted as a recommendation, offer, or solicitation to buy or sell any financial instrument. Past
                  performance is not a reliable indicator of future results.
                </div>
              </details>

              <div style={{ height: 16 }} />
              <div className="muted" style={{ textAlign: 'center' }}>
                © {year} OPENBOOKPRO. All rights reserved.
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
