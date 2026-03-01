"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getUserAccessToken,
  getUserAuthHeaders,
  isUnauthorizedMessage,
} from "@/lib/clientAuth";
import { supabase } from "@/lib/supabaseClient";

type Side = "BUY" | "SELL";
type TradeAsset = "BTC" | "ETH" | "GOLD" | "XRP" | "SOL";
type TradePermissionMode = "BUY_ALL_WIN" | "SELL_ALL_WIN" | "RANDOM_WIN_LOSS" | "ALL_LOSS";

type TradePermissionResponse = {
  ok?: boolean;
  error?: string;
  permissionMode?: TradePermissionMode;
  buyEnabled?: boolean;
  sellEnabled?: boolean;
  restricted?: boolean;
};

type WalletStateResponse = {
  ok?: boolean;
  error?: string;
  holdings?: Record<string, number>;
};

type AdjustResponse = {
  ok?: boolean;
  error?: string;
  balanceUSDT?: number;
};

type SessionPhase = "IDLE" | "ANALYZING" | "RUNNING" | "CLAIMABLE";

type QuantityTier = {
  id: string;
  min: number;
  max: number;
  pct: number; // 0.3 = 30%
};

type TradeSession = {
  id: string;
  side: Side;
  asset: TradeAsset;
  amountUSDT: number;
  tierId: string;
  tierLabel: string;
  tierPct: number;
  permissionEnabled: boolean;
  targetProfitUSDT: number;
  currentProfitUSDT: number;
  createdAt: number;
  runStartedAt: number;
  endAt: number;
  remainingSec: number;
  points: number[];
  profitPoints: number[];
};

type HistoryRecord = {
  id: string;
  side: Side;
  asset?: TradeAsset;
  amountUSDT: number;
  profitUSDT: number;
  createdAt: number;
  claimedAt: number;
};

const HISTORY_KEY_PREFIX = "opendex.trade.history.v3";
const TRADE_NOTI_KEY_PREFIX = "opendex.trade.notifications.v2";
const TRADE_SESSION_KEY_PREFIX = "opendex.trade.session.v1";

type TradeNotificationStatus = "PENDING" | "CONFIRMED";

type TradeNotification = {
  id: string;
  source: "TRADE";
  status: TradeNotificationStatus;
  side: Side;
  asset: TradeAsset;
  amountUSDT: number;
  profitUSDT: number | null;
  createdAt: number;
  updatedAt: number;
};

type TradeResultModalState = {
  id: string;
  side: Side;
  asset: TradeAsset;
  amountUSDT: number;
  resultUSDT: number;
  revealResult: boolean;
  stageIndex: number;
  claimed: boolean;
  settlementDone: boolean;
  settlementError: string;
};

type PersistedTradeSession = {
  phase: SessionPhase;
  session: TradeSession | null;
  savedAt: number;
};

const ANALYSIS_TEXTS = [
  "Using AI for complicated trading...",
  "Collecting information across markets...",
  "Projecting trend and timing the move...",
];
const RESULT_STAGE_TEXTS_PROFIT = [
  "Congratulations..",
  "Collecting your profit...",
  "Please wait to transfer money to your account",
];
const RESULT_STAGE_TEXTS_LOSS = [
  "Sorry...",
  "Settling your session result...",
  "Please wait while the loss is applied to your wallet",
];
const RESULT_REVEAL_DELAY_MS = 2400;
const QUANTITY_TIERS: QuantityTier[] = [
  { id: "q1", min: 300, max: 30_000, pct: 0.3 },
  { id: "q2", min: 30_000, max: 80_000, pct: 0.4 },
  { id: "q3", min: 80_000, max: 150_000, pct: 0.6 },
  { id: "q4", min: 150_000, max: 300_000, pct: 0.8 },
  { id: "q5", min: 300_000, max: 9_999_999, pct: 1.0 },
];
const TRADE_ASSETS: TradeAsset[] = ["BTC", "ETH", "GOLD", "XRP", "SOL"];

function normalizeAsset(v: unknown): TradeAsset {
  const str = String(v || "").toUpperCase();
  if ((TRADE_ASSETS as readonly string[]).includes(str)) return str as TradeAsset;
  return "BTC";
}

function formatMoney(v: number) {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function tradeHistoryKeyForUser(userId: string | null | undefined) {
  const id = String(userId || "").trim();
  if (!id) return "";
  return `${HISTORY_KEY_PREFIX}.${id}`;
}

function loadHistory(storageKey: string): HistoryRecord[] {
  if (!storageKey) return [];
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r: unknown) => {
      const row = (r as HistoryRecord) || {};
      return {
        ...row,
        asset: normalizeAsset(row.asset),
      };
    }) as HistoryRecord[];
  } catch {
    return [];
  }
}

function saveHistory(storageKey: string, next: HistoryRecord[]) {
  if (!storageKey) return;
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function appendHistoryRecord(storageKey: string, next: HistoryRecord) {
  if (!storageKey) return;
  const rows = loadHistory(storageKey);
  const deduped = [next, ...rows.filter((row) => row.id !== next.id)].slice(0, 200);
  saveHistory(storageKey, deduped);
}

function tradeNotiKeyForUser(userId: string | null | undefined) {
  const id = String(userId || "").trim();
  if (!id) return "";
  return `${TRADE_NOTI_KEY_PREFIX}.${id}`;
}

function tradeSessionKeyForUser(userId: string | null | undefined) {
  const id = String(userId || "").trim();
  if (!id) return "";
  return `${TRADE_SESSION_KEY_PREFIX}.${id}`;
}

function loadTradeNotifications(storageKey: string): TradeNotification[] {
  if (!storageKey) return [];
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: unknown) => {
      const row = (item as Partial<TradeNotification>) || {};
      const status = String(row.status || "").toUpperCase() === "CONFIRMED" ? "CONFIRMED" : "PENDING";
      return {
        id: String(row.id || crypto.randomUUID()),
        source: "TRADE",
        status,
        side: row.side === "SELL" ? "SELL" : "BUY",
        asset: normalizeAsset(row.asset),
        amountUSDT: Number(row.amountUSDT ?? 0),
        profitUSDT:
          typeof row.profitUSDT === "number" && Number.isFinite(row.profitUSDT)
            ? Number(row.profitUSDT)
            : null,
        createdAt: Number(row.createdAt ?? Date.now()),
        updatedAt: Number(row.updatedAt ?? row.createdAt ?? Date.now()),
      } satisfies TradeNotification;
    });
  } catch {
    return [];
  }
}

function upsertTradeNotification(storageKey: string, next: TradeNotification) {
  if (!storageKey) return;
  if (typeof window === "undefined") return;
  const rows = loadTradeNotifications(storageKey);
  const idx = rows.findIndex((x) => x.id === next.id);
  if (idx >= 0) rows[idx] = next;
  else rows.unshift(next);
  localStorage.setItem(storageKey, JSON.stringify(rows.slice(0, 300)));
}

function normalizeTradeSession(v: unknown): TradeSession | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Partial<TradeSession>;
  const side: Side = row.side === "SELL" ? "SELL" : "BUY";
  const asset = normalizeAsset(row.asset);
  const amountUSDT = Number(row.amountUSDT ?? 0);
  const tierPct = Number(row.tierPct ?? 0);
  const runStartedAt = Number(row.runStartedAt ?? 0);
  const endAt = Number(row.endAt ?? 0);
  const createdAt = Number(row.createdAt ?? 0);

  if (
    !Number.isFinite(amountUSDT) ||
    amountUSDT <= 0 ||
    !Number.isFinite(tierPct) ||
    tierPct <= 0 ||
    !Number.isFinite(runStartedAt) ||
    runStartedAt <= 0 ||
    !Number.isFinite(endAt) ||
    endAt <= runStartedAt
  ) {
    return null;
  }

  const points = Array.isArray(row.points)
    ? row.points.map((p) => Number(p)).filter((p) => Number.isFinite(p)).slice(-80)
    : [];
  const profitPoints = Array.isArray(row.profitPoints)
    ? row.profitPoints.map((p) => Number(p)).filter((p) => Number.isFinite(p)).slice(-80)
    : [];

  return {
    id: String(row.id || crypto.randomUUID()),
    side,
    asset,
    amountUSDT,
    tierId: String(row.tierId || "q1"),
    tierLabel: String(row.tierLabel || ""),
    tierPct,
    permissionEnabled: Boolean(row.permissionEnabled),
    targetProfitUSDT: Number(row.targetProfitUSDT ?? 0),
    currentProfitUSDT: Number(row.currentProfitUSDT ?? 0),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
    runStartedAt,
    endAt,
    remainingSec: Math.max(0, Number(row.remainingSec ?? 0)),
    points: points.length > 1 ? points : [100, side === "BUY" ? 100.7 : 99.3],
    profitPoints:
      profitPoints.length > 1
        ? profitPoints
        : [0, Number.isFinite(Number(row.currentProfitUSDT ?? 0)) ? Number(row.currentProfitUSDT ?? 0) : 0],
  };
}

function loadPersistedTradeSession(storageKey: string): PersistedTradeSession | null {
  if (!storageKey) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTradeSession>;
    const phase = String(parsed.phase || "").toUpperCase();
    const session = normalizeTradeSession(parsed.session);
    if (!session) return null;
    if (phase !== "ANALYZING" && phase !== "RUNNING" && phase !== "CLAIMABLE") return null;
    return {
      phase: phase as SessionPhase,
      session,
      savedAt: Number(parsed.savedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function savePersistedTradeSession(storageKey: string, payload: PersistedTradeSession | null) {
  if (!storageKey) return;
  if (typeof window === "undefined") return;
  if (!payload || !payload.session) {
    localStorage.removeItem(storageKey);
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function modeFromLegacyBuySell(buyEnabled: boolean, sellEnabled: boolean): TradePermissionMode {
  if (buyEnabled && !sellEnabled) return "BUY_ALL_WIN";
  if (!buyEnabled && sellEnabled) return "SELL_ALL_WIN";
  if (buyEnabled && sellEnabled) return "RANDOM_WIN_LOSS";
  return "ALL_LOSS";
}

function normalizePermissionMode(v: unknown): TradePermissionMode {
  const raw = String(v || "").trim().toUpperCase();
  if (raw === "BUY_ALL_WIN" || raw === "SELL_ALL_WIN" || raw === "RANDOM_WIN_LOSS" || raw === "ALL_LOSS") {
    return raw as TradePermissionMode;
  }
  return "ALL_LOSS";
}

function resolveSessionWinMode(mode: TradePermissionMode, side: Side) {
  if (mode === "BUY_ALL_WIN") return side === "BUY";
  if (mode === "SELL_ALL_WIN") return side === "SELL";
  if (mode === "RANDOM_WIN_LOSS") {
    // Losses are more common than wins.
    return Math.random() < 0.28;
  }
  return false;
}

function buildTargetPct({
  tierPct,
  shouldWin,
}: {
  tierPct: number;
  shouldWin: boolean;
}) {
  if (shouldWin) {
    // Profit mode: keep result close to selected tier %
    return tierPct * randomBetween(0.97, 1.03);
  }
  // Loss mode: always negative and slightly varied for natural behavior
  return -tierPct * randomBetween(0.9, 1.06);
}

async function authHeaders(): Promise<Record<string, string>> {
  return getUserAuthHeaders();
}

async function fetchWalletUSDT() {
  const res = await fetch("/api/wallet/state", {
    cache: "no-store",
    headers: await authHeaders(),
  });
  const json = (await res.json().catch(() => ({}))) as WalletStateResponse;
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load wallet");
  return Number(json.holdings?.USDT ?? 0);
}

async function fetchTradePermission() {
  const res = await fetch("/api/trade/permission", {
    cache: "no-store",
    headers: await authHeaders(),
  });
  const json = (await res.json().catch(() => ({}))) as TradePermissionResponse;
  if (res.status === 403 && json?.restricted) {
    return {
      permissionMode: "ALL_LOSS" as TradePermissionMode,
      restricted: true,
    };
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to load trade permission");
  }
  const mode = normalizePermissionMode(
    json.permissionMode ??
      modeFromLegacyBuySell(Boolean(json.buyEnabled ?? false), Boolean(json.sellEnabled ?? false))
  );
  return {
    permissionMode: mode,
    restricted: Boolean(json.restricted ?? false),
  };
}

async function adjustWalletUSDT(deltaUSDT: number) {
  const tokenHeaders = await authHeaders();
  const res = await fetch("/api/wallet/adjust", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...tokenHeaders,
    },
    body: JSON.stringify({ deltaUSDT }),
  });

  const json = (await res.json().catch(() => ({}))) as AdjustResponse;
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to update wallet");
  }
  return Number(json.balanceUSDT ?? 0);
}

async function recordTradeOrder({
  id,
  side,
  asset,
  amountUSDT,
  profitUSDT,
  createdAt,
}: {
  id: string;
  side: Side;
  asset: TradeAsset;
  amountUSDT: number;
  profitUSDT: number;
  createdAt: number;
}) {
  try {
    const tokenHeaders = await authHeaders();
    await fetch("/api/trade/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...tokenHeaders,
      },
      body: JSON.stringify({
        id,
        side,
        asset,
        amountUSDT,
        profitUSDT,
        createdAt,
      }),
    });
  } catch {
    // Best-effort: trade UX should not fail if history logging fails.
  }
}

function MiniLineChart({
  points,
  profitPoints,
  side,
}: {
  points: number[];
  profitPoints: number[];
  side: Side;
}) {
  const width = 360;
  const height = 140;
  const safe = points.length > 1 ? points : [100, 100.2];
  const safeProfits =
    profitPoints.length === safe.length
      ? profitPoints
      : safe.map((_, index) => {
          const ratio = safe.length <= 1 ? 0 : index / (safe.length - 1);
          const end = Number(profitPoints[profitPoints.length - 1] ?? 0);
          return round2(end * ratio);
        });
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = Math.max(0.001, max - min);
  const coords = safe.map((v, i) => {
    const x = (i / (safe.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return { x, y, profit: Number(safeProfits[i] ?? 0) };
  });
  const path = coords
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const last = coords[coords.length - 1];

  const stroke = side === "BUY" ? "#34d399" : "#f87171";
  const fillId = `sessionLineFill-${side.toLowerCase()}`;
  const glowId = `sessionLineGlow-${side.toLowerCase()}`;
  const labelStep = Math.max(1, Math.floor((coords.length - 1) / 4));
  const labelCoords = coords.filter((_, index) => index % labelStep === 0 || index === coords.length - 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[180px] w-full rounded-xl border border-white/5 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,.06),transparent_40%),radial-gradient(circle_at_85%_85%,rgba(37,99,235,.10),transparent_35%),#070809]"
    >
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.04" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Array.from({ length: 6 }).map((_, i) => {
        const y = (height / 5) * i;
        return (
          <line
            key={`h-${i}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke="rgba(148,163,184,.22)"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        );
      })}
      {Array.from({ length: 7 }).map((_, i) => {
        const x = (width / 6) * i;
        return (
          <line
            key={`v-${i}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="rgba(148,163,184,.16)"
            strokeDasharray="4 7"
            strokeWidth="1"
          />
        );
      })}

      <path d={areaPath} fill={`url(#${fillId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="6" strokeOpacity="0.22" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.6" filter={`url(#${glowId})`} />

      {labelCoords.map((point, index) => {
        const label = `${point.profit >= 0 ? "+" : ""}${formatMoney(point.profit)}`;
        const labelWidth = Math.max(64, 20 + label.length * 7);
        const labelHeight = 22;
        const x = Math.min(width - labelWidth - 4, Math.max(4, point.x - labelWidth / 2));
        const y = point.y > 28 ? point.y - 28 : point.y + 10;
        const lowOpacity = Math.max(0.18, 0.28 + index * 0.08);
        const highOpacity = Math.min(0.92, lowOpacity + 0.32);

        return (
          <g key={`label-${index}`} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
            <rect
              width={labelWidth}
              height={labelHeight}
              rx="11"
              fill="rgba(15,23,42,0.74)"
              stroke={point.profit >= 0 ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.42)"}
              strokeWidth="1"
            >
              <animate
                attributeName="opacity"
                values={`${lowOpacity};${highOpacity};${lowOpacity}`}
                dur="2.4s"
                begin={`${index * 0.18}s`}
                repeatCount="indefinite"
              />
            </rect>
            <text
              x={labelWidth / 2}
              y="14"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill={point.profit >= 0 ? "#6ee7b7" : "#fda4af"}
              letterSpacing="0.02em"
            >
              {label}
              <animate
                attributeName="opacity"
                values={`${Math.min(1, lowOpacity + 0.1)};1;${Math.min(1, lowOpacity + 0.1)}`}
                dur="2.4s"
                begin={`${index * 0.18}s`}
                repeatCount="indefinite"
              />
            </text>
            <circle cx={labelWidth / 2} cy={labelHeight + 4} r="2.2" fill={stroke} opacity="0.85" />
          </g>
        );
      })}

      {coords
        .filter((_, index) => index % labelStep === 0 || index === coords.length - 1)
        .map((point, index) => (
          <circle
            key={`anchor-${index}`}
            cx={point.x}
            cy={point.y}
            r="2.8"
            fill="#ffffff"
            stroke={stroke}
            strokeWidth="1.8"
            opacity="0.9"
          />
        ))}

      <circle cx={last.x} cy={last.y} r="8" fill={stroke} opacity="0.18" className="animate-pulse" />
      <circle cx={last.x} cy={last.y} r="4.2" fill={stroke} stroke="rgba(255,255,255,.8)" strokeWidth="1.1" />
    </svg>
  );
}

export default function TradePanel() {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const mountedRef = useRef(false);
  const [balance, setBalance] = useState(0);
  const [balanceErr, setBalanceErr] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<TradeAsset>("BTC");
  const [permissionMode, setPermissionMode] = useState<TradePermissionMode>("ALL_LOSS");
  const [tradeRestricted, setTradeRestricted] = useState(false);
  const [permissionErr, setPermissionErr] = useState("");
  const [amount, setAmount] = useState("300");
  const [tierId, setTierId] = useState(QUANTITY_TIERS[0].id);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("IDLE");
  const [session, setSession] = useState<TradeSession | null>(null);
  const [analysisIdx, setAnalysisIdx] = useState(0);
  const [analysisVisible, setAnalysisVisible] = useState(true);
  const [actionErr, setActionErr] = useState("");
  const [startLoading, setStartLoading] = useState<Side | "">("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [resultModal, setResultModal] = useState<TradeResultModalState | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [sessionRestored, setSessionRestored] = useState(false);
  const sessionRef = useRef<TradeSession | null>(null);
  const sessionCardRef = useRef<HTMLDivElement | null>(null);
  const pendingSessionScrollRef = useRef(false);
  const autoSettledLossSessionIdRef = useRef("");
  const lastHistoryStorageKeyRef = useRef("");
  const tradeHistoryStorageKey = useMemo(() => tradeHistoryKeyForUser(currentUserId), [currentUserId]);
  const tradeNotiStorageKey = useMemo(() => tradeNotiKeyForUser(currentUserId), [currentUserId]);
  const tradeSessionStorageKey = useMemo(() => tradeSessionKeyForUser(currentUserId), [currentUserId]);
  const resultModalId = resultModal?.id ?? "";
  const resultModalRevealResult = Boolean(resultModal?.revealResult);
  const runningSessionId = session?.id ?? "";
  const resultModalIsProfit = useMemo(
    () => (resultModal ? resultModal.resultUSDT >= 0 : false),
    [resultModal]
  );
  const resultStageTexts = resultModalIsProfit ? RESULT_STAGE_TEXTS_PROFIT : RESULT_STAGE_TEXTS_LOSS;

  const sessionBusy = sessionPhase === "ANALYZING" || sessionPhase === "RUNNING";
  const selectedTier = useMemo(
    () => QUANTITY_TIERS.find((t) => t.id === tierId) ?? QUANTITY_TIERS[0],
    [tierId]
  );

  const openResultModalForSession = useCallback((row: TradeSession) => {
    const finalResult = round2(row.currentProfitUSDT);
    setResultModal((prev) => {
      if (prev && prev.id === row.id) return prev;
      return {
        id: row.id,
        side: row.side,
        asset: row.asset,
        amountUSDT: row.amountUSDT,
        resultUSDT: finalResult,
        revealResult: false,
        stageIndex: 0,
        claimed: false,
        settlementDone: finalResult < 0 ? false : true,
        settlementError: "",
      };
    });
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const [wallet, perm] = await Promise.all([fetchWalletUSDT(), fetchTradePermission()]);
      setBalance(wallet);
      setPermissionMode(perm.permissionMode);
      setTradeRestricted(Boolean(perm.restricted));
      setBalanceErr("");
      setPermissionErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load trade state";
      if (isUnauthorizedMessage(message) && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/login?next=/trade");
      }
      if (message.toLowerCase().includes("wallet")) setBalanceErr(message);
      else setPermissionErr(message);
    }
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const run = () => {
      void loadStatus();
    };
    const kick = window.setTimeout(run, 0);
    const t = window.setInterval(() => {
      run();
    }, 6_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, [loadStatus]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getUserAccessToken();
        if (!token || cancelled) return;
        const { data } = await supabase.auth.getUser(token);
        const uid = String(data.user?.id || "");
        if (!cancelled && uid) setCurrentUserId(uid);
      } catch {
        // ignore; local trade notifications are optional
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tradeHistoryStorageKey) {
      setHistory([]);
      setHistoryLoaded(false);
      lastHistoryStorageKeyRef.current = "";
      return;
    }
    setHistory(loadHistory(tradeHistoryStorageKey));
    setHistoryLoaded(true);
    lastHistoryStorageKeyRef.current = "";
  }, [tradeHistoryStorageKey]);

  useEffect(() => {
    if (!historyLoaded) return;
    if (!tradeHistoryStorageKey) return;
    if (lastHistoryStorageKeyRef.current !== tradeHistoryStorageKey) {
      lastHistoryStorageKeyRef.current = tradeHistoryStorageKey;
      return;
    }
    saveHistory(tradeHistoryStorageKey, history);
  }, [history, historyLoaded, tradeHistoryStorageKey]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!tradeSessionStorageKey) {
      setSessionRestored(false);
      return;
    }

    // Current in-memory session takes priority (e.g. started before user id resolved)
    if (sessionRef.current) {
      setSessionRestored(true);
      return;
    }

    const persisted = loadPersistedTradeSession(tradeSessionStorageKey);
    if (!persisted?.session) {
      setSessionRestored(true);
      return;
    }

    const restored = persisted.session;
    const now = Date.now();
    let nextPhase: SessionPhase = "ANALYZING";

    if (now >= restored.endAt) {
      nextPhase = "CLAIMABLE";
      restored.currentProfitUSDT = round2(restored.targetProfitUSDT);
      restored.remainingSec = 0;
    } else if (now >= restored.runStartedAt) {
      nextPhase = "RUNNING";
      restored.remainingSec = Math.max(0, Math.ceil((restored.endAt - now) / 1000));
    } else {
      nextPhase = "ANALYZING";
      restored.remainingSec = Math.max(0, Math.ceil((restored.endAt - restored.runStartedAt) / 1000));
    }

    sessionRef.current = restored;
    setSession(restored);
    setSessionPhase(nextPhase);
    setSessionRestored(true);
  }, [tradeSessionStorageKey]);

  useEffect(() => {
    if (!sessionRestored) return;
    savePersistedTradeSession(
      tradeSessionStorageKey,
      session && sessionPhase !== "IDLE"
        ? {
            phase: sessionPhase,
            session,
            savedAt: Date.now(),
          }
        : null
    );
  }, [session, sessionPhase, sessionRestored, tradeSessionStorageKey]);

  useEffect(() => {
    if (sessionPhase !== "CLAIMABLE" || !session) return;
    openResultModalForSession(session);
  }, [openResultModalForSession, session, sessionPhase]);

  useEffect(() => {
    if (!resultModalId || resultModalRevealResult) return;

    const modalId = resultModalId;

    const rotate = window.setInterval(() => {
      setResultModal((prev) =>
        prev && prev.id === modalId
          ? {
              ...prev,
              stageIndex: Math.min(prev.stageIndex + 1, resultStageTexts.length - 1),
            }
          : prev
      );
    }, 900);

    // Show loader briefly, then reveal final profit/loss.
    const reveal = window.setTimeout(() => {
      window.clearInterval(rotate);
      setResultModal((prev) =>
        prev && prev.id === modalId
          ? {
              ...prev,
              revealResult: true,
              stageIndex: resultStageTexts.length - 1,
            }
          : prev
      );
    }, RESULT_REVEAL_DELAY_MS);

    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(reveal);
    };
  }, [resultModalId, resultModalRevealResult, resultStageTexts]);

  useEffect(() => {
    if (sessionPhase !== "ANALYZING") return;

    setAnalysisIdx(0);
    setAnalysisVisible(true);
    let fadeTimer = 0;

    const rotate = window.setInterval(() => {
      setAnalysisVisible(false);
      fadeTimer = window.setTimeout(() => {
        setAnalysisIdx((idx) => (idx + 1) % ANALYSIS_TEXTS.length);
        setAnalysisVisible(true);
      }, 220);
    }, 1600);

    const goRun = window.setTimeout(() => {
      setSessionPhase("RUNNING");
    }, 5_000);

    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(goRun);
      if (fadeTimer) window.clearTimeout(fadeTimer);
    };
  }, [sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== "RUNNING") return;

    const tick = () => {
      const current = sessionRef.current;
      if (!current) return;

      const now = Date.now();
      const durationMs = Math.max(1, current.endAt - current.runStartedAt);
      const elapsedMs = Math.max(0, now - current.runStartedAt);
      const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));

      const drift = current.targetProfitUSDT * progress;
      const wave = Math.sin(progress * Math.PI * 12) * current.amountUSDT * 0.0022;
      const noise = (Math.random() - 0.5) * current.amountUSDT * 0.0012;

      let nextProfit = round2(drift + wave + noise);
      if (current.permissionEnabled) {
        nextProfit = Math.max(0, nextProfit);
      } else {
        nextProfit = Math.min(0, nextProfit);
      }

      const direction =
        current.permissionEnabled
          ? current.side === "BUY"
            ? 1
            : -1
          : current.side === "BUY"
            ? -1
            : 1;
      const baseTrend = 100 + progress * direction * 20;
      const chartWave = Math.sin(progress * Math.PI * 10) * 2.1;
      const chartNoise = (Math.random() - 0.5) * 1.3;
      const point = Number((baseTrend + chartWave + chartNoise).toFixed(4));

      const done = progress >= 1;
      const remainingSec = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
      const nextPoints = [...current.points.slice(-79), point];
      const nextProfitPoints = [
        ...current.profitPoints.slice(-79),
        done ? round2(current.targetProfitUSDT) : nextProfit,
      ];
      const updated: TradeSession = {
        ...current,
        currentProfitUSDT: done ? round2(current.targetProfitUSDT) : nextProfit,
        remainingSec,
        points: nextPoints,
        profitPoints: nextProfitPoints,
      };

      sessionRef.current = updated;
      setSession(updated);

      if (done) {
        setSessionPhase("CLAIMABLE");
      }
    };

    const kick = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, [sessionPhase]);

  useEffect(() => {
    if (!runningSessionId || sessionPhase !== "RUNNING") return;
    if (!pendingSessionScrollRef.current) return;

    pendingSessionScrollRef.current = false;
    const node = sessionCardRef.current;
    if (!node) return;

    const rafId = window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [runningSessionId, sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== "CLAIMABLE" || !session) return;

    const delta = round2(session.currentProfitUSDT);
    if (delta >= 0) return;
    if (autoSettledLossSessionIdRef.current === session.id) return;
    autoSettledLossSessionIdRef.current = session.id;

    const run = async () => {
      if (mountedRef.current) {
        setClaimLoading(true);
        setActionErr("");
      }
      try {
        let nextBalance = balance;
        if (Math.abs(delta) >= 0.01) {
          nextBalance = await adjustWalletUSDT(delta);
        }

        const item: HistoryRecord = {
          id: session.id,
          side: session.side,
          asset: session.asset,
          amountUSDT: session.amountUSDT,
          profitUSDT: delta,
          createdAt: session.createdAt,
          claimedAt: Date.now(),
        };
        appendHistoryRecord(tradeHistoryStorageKey, item);
        upsertTradeNotification(tradeNotiStorageKey, {
          id: session.id,
          source: "TRADE",
          status: "CONFIRMED",
          side: session.side,
          asset: session.asset,
          amountUSDT: session.amountUSDT,
          profitUSDT: delta,
          createdAt: session.createdAt,
          updatedAt: Date.now(),
        });
        await recordTradeOrder({
          id: session.id,
          side: session.side,
          asset: session.asset,
          amountUSDT: session.amountUSDT,
          profitUSDT: delta,
          createdAt: session.createdAt,
        });
        sessionRef.current = null;
        savePersistedTradeSession(tradeSessionStorageKey, null);

        if (mountedRef.current) {
          setBalance(nextBalance);
          setHistory((prev) => [item, ...prev.filter((row) => row.id !== item.id)].slice(0, 200));
          setResultModal((prev) =>
            prev && prev.id === session.id
              ? { ...prev, settlementDone: true, settlementError: "" }
              : prev
          );
          setSession(null);
          setSessionPhase("IDLE");
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Auto settlement failed";
        if (mountedRef.current && isUnauthorizedMessage(message) && !redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login?next=/trade");
          return;
        }
        if (mountedRef.current) {
          setActionErr(message);
          setResultModal((prev) =>
            prev && prev.id === session.id
              ? { ...prev, settlementDone: false, settlementError: message }
              : prev
          );
        }
      } finally {
        if (mountedRef.current) {
          setClaimLoading(false);
        }
        autoSettledLossSessionIdRef.current = "";
      }
    };

    void run();
  }, [balance, router, session, sessionPhase, tradeHistoryStorageKey, tradeNotiStorageKey, tradeSessionStorageKey]);

  const startSession = async (side: Side) => {
    setActionErr("");
    setResultModal(null);
    if (sessionBusy || sessionPhase === "CLAIMABLE") {
      setActionErr("Current session is still active. Claim or wait first.");
      return;
    }

    const amountUSDT = Number(amount);
    if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
      setActionErr("Enter valid amount (USDT).");
      return;
    }
    if (amountUSDT < selectedTier.min || amountUSDT > selectedTier.max) {
      setActionErr(
        `Amount must be within ${selectedTier.min.toLocaleString()} - ${selectedTier.max.toLocaleString()} USDT`
      );
      return;
    }
    if (amountUSDT > balance) {
      setActionErr("Insufficient wallet balance.");
      return;
    }

    let latestPermissionMode = permissionMode;
    let latestRestricted = tradeRestricted;
    setStartLoading(side);
    try {
      const fresh = await fetchTradePermission();
      latestPermissionMode = fresh.permissionMode;
      latestRestricted = Boolean(fresh.restricted);
      setPermissionMode(latestPermissionMode);
      setTradeRestricted(latestRestricted);
      setPermissionErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load trade permission";
      if (isUnauthorizedMessage(message) && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/login?next=/trade");
        return;
      }
      setPermissionErr(message);
      setActionErr(message);
      return;
    } finally {
      setStartLoading("");
    }

    if (latestRestricted) {
      setActionErr("Your account is restricted.");
      return;
    }

    const now = Date.now();
    const runStartedAt = now + 5_000;
    const endAt = runStartedAt + 40_000;

    const permissionEnabled = resolveSessionWinMode(latestPermissionMode, side);
    const targetPct = buildTargetPct({
      tierPct: selectedTier.pct,
      shouldWin: permissionEnabled,
    });

    const newSession: TradeSession = {
      id: crypto.randomUUID(),
      side,
      asset: selectedAsset,
      amountUSDT,
      tierId: selectedTier.id,
      tierLabel: `${selectedTier.min.toLocaleString()} - ${selectedTier.max.toLocaleString()}`,
      tierPct: selectedTier.pct,
      permissionEnabled,
      targetProfitUSDT: round2(amountUSDT * targetPct),
      currentProfitUSDT: 0,
      createdAt: now,
      runStartedAt,
      endAt,
      remainingSec: 40,
      points: [100, side === "BUY" ? 100.7 : 99.3],
      profitPoints: [0, 0],
    };

    upsertTradeNotification(tradeNotiStorageKey, {
      id: newSession.id,
      source: "TRADE",
      status: "PENDING",
      side: newSession.side,
      asset: newSession.asset,
      amountUSDT: newSession.amountUSDT,
      profitUSDT: null,
      createdAt: newSession.createdAt,
      updatedAt: Date.now(),
    });

    setSession(newSession);
    sessionRef.current = newSession;
    pendingSessionScrollRef.current = true;
    setSessionPhase("ANALYZING");
  };

  const claimProfit = async () => {
    const current = sessionRef.current;
    if (!current || sessionPhase !== "CLAIMABLE") return;

    setClaimLoading(true);
    setActionErr("");

    try {
      const delta = round2(current.currentProfitUSDT);
      let nextBalance = balance;

      if (Math.abs(delta) >= 0.01) {
        nextBalance = await adjustWalletUSDT(delta);
      }

      setBalance(nextBalance);

      const item: HistoryRecord = {
        id: current.id,
        side: current.side,
        asset: current.asset,
        amountUSDT: current.amountUSDT,
        profitUSDT: delta,
        createdAt: current.createdAt,
        claimedAt: Date.now(),
      };
      setHistory((prev) => [item, ...prev].slice(0, 200));
      upsertTradeNotification(tradeNotiStorageKey, {
        id: current.id,
        source: "TRADE",
        status: "CONFIRMED",
        side: current.side,
        asset: current.asset,
        amountUSDT: current.amountUSDT,
        profitUSDT: delta,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      });
      await recordTradeOrder({
        id: current.id,
        side: current.side,
        asset: current.asset,
        amountUSDT: current.amountUSDT,
        profitUSDT: delta,
        createdAt: current.createdAt,
      });
      setResultModal((prev) =>
        prev && prev.id === current.id
          ? {
              ...prev,
              claimed: true,
              settlementDone: true,
              settlementError: "",
              revealResult: true,
            }
          : prev
      );

      setSession(null);
      sessionRef.current = null;
      setSessionPhase("IDLE");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Claim failed";
      if (isUnauthorizedMessage(message) && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/login?next=/trade");
        return;
      }
      setActionErr(message);
      setResultModal((prev) =>
        prev && prev.id === current.id
          ? {
              ...prev,
              settlementDone: false,
              settlementError: message,
            }
          : prev
      );
    } finally {
      setClaimLoading(false);
    }
  };

  const sessionLocked =
    tradeRestricted || sessionBusy || sessionPhase === "CLAIMABLE" || Boolean(startLoading);

  const summary = useMemo(() => {
    if (!session) return null;

    return {
      side: session.side,
      asset: session.asset,
      amountUSDT: session.amountUSDT,
      currentProfitUSDT: session.currentProfitUSDT,
      remainingSec: session.remainingSec,
      tierLabel: session.tierLabel,
      tierPct: session.tierPct,
      profitClass: session.currentProfitUSDT >= 0 ? "text-emerald-300" : "text-rose-300",
    };
  }, [session]);

  const onTierChange = (nextTierId: string) => {
    const next = QUANTITY_TIERS.find((t) => t.id === nextTierId);
    if (!next) return;
    setTierId(next.id);

    const currentAmount = Number(amount);
    if (!Number.isFinite(currentAmount) || currentAmount < next.min || currentAmount > next.max) {
      setAmount(String(next.min));
    }
  };

  const closeResultModal = () => {
    if (!resultModal) return;
    if (resultModal.resultUSDT > 0 && !resultModal.claimed) {
      setActionErr("Please claim profit before closing.");
      return;
    }
    if (resultModal.resultUSDT < 0 && !resultModal.settlementDone) {
      setActionErr("Please wait while loss is settling.");
      return;
    }
    setResultModal(null);
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-950">
          <span>Wallet Balance (USDT)</span>
          <b className="shrink-0 text-slate-950">{formatMoney(balance)}</b>
        </div>
        <div className="mt-3 text-sm text-slate-950">Choose asset to trade</div>
        <select
          value={selectedAsset}
          onChange={(e) => setSelectedAsset(normalizeAsset(e.target.value))}
          className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {TRADE_ASSETS.map((asset) => (
            <option key={asset} value={asset}>
              {asset}
            </option>
          ))}
        </select>
        {!!balanceErr && <div className="mt-2 text-xs text-red-300">{balanceErr}</div>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
        <div className="mb-2 text-sm text-slate-950">Choose your quantity</div>
        <select
          value={tierId}
          onChange={(e) => onTierChange(e.target.value)}
          className="mb-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {QUANTITY_TIERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.min.toLocaleString()} - {t.max.toLocaleString()} ({Math.round(t.pct * 100)}%)
            </option>
          ))}
        </select>

        <div className="mb-2 text-sm text-slate-950">Trade Amount (USDT)</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="100"
            className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="button"
            onClick={() =>
              setAmount(
                String(
                  Math.max(
                    selectedTier.min,
                    Math.min(selectedTier.max, Math.floor(Math.max(0, balance)))
                  )
                )
              )
            }
            className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-950"
          >
            Max
          </button>
        </div>
        <div className="mt-1 text-xs text-slate-900">
          Range: {selectedTier.min.toLocaleString()} - {selectedTier.max.toLocaleString()} USDT (
          {Math.round(selectedTier.pct * 100)}%)
        </div>
        {!!permissionErr && <div className="mt-2 text-xs text-red-300">{permissionErr}</div>}
        {tradeRestricted ? (
          <div className="mt-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
            Your account is restricted.
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => startSession("BUY")}
            disabled={sessionLocked}
            className="rounded-xl bg-emerald-600 py-3 font-bold text-white disabled:opacity-50"
          >
            {startLoading === "BUY" ? "Checking..." : "Start BUY"}
          </button>
          <button
            type="button"
            onClick={() => startSession("SELL")}
            disabled={sessionLocked}
            className="rounded-xl bg-rose-600 py-3 font-bold text-white disabled:opacity-50"
          >
            {startLoading === "SELL" ? "Checking..." : "Start SELL"}
          </button>
        </div>
      </div>

      {session && summary && (
        <div
          ref={sessionCardRef}
          className="rounded-2xl border border-white/10 bg-neutral-950 p-4"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-slate-950">
              Session: <b className="text-slate-950">{summary.side}</b>
            </div>
            <div className="shrink-0 text-xs text-slate-900">
              Amount: {formatMoney(summary.amountUSDT)} USDT
            </div>
          </div>
          <div className="mb-2 text-xs text-slate-900">
            Asset: {summary.asset}
            {" · "}
            Quantity: {summary.tierLabel} ({Math.round(summary.tierPct * 100)}%)
          </div>

          <MiniLineChart points={session.points} profitPoints={session.profitPoints} side={session.side} />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-950">Live Profit</span>
            <span className={`shrink-0 font-bold ${summary.profitClass}`}>
              {summary.currentProfitUSDT >= 0 ? "+" : ""}
              {formatMoney(summary.currentProfitUSDT)} USDT
            </span>
          </div>

          {sessionPhase === "RUNNING" ? (
            <div className="mt-1 text-xs text-slate-900">
              Running... {summary.remainingSec}s remaining
            </div>
          ) : null}
        </div>
      )}

      {!!actionErr && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {actionErr}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black p-3">
        <div className="mb-3 text-sm font-semibold text-slate-950">Order History</div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-neutral-900 p-3 text-sm text-slate-900">
            No trade history yet.
          </div>
        ) : (
          <div className="max-h-64 space-y-2 overflow-auto">
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 text-slate-950">
                  <span className="min-w-0 break-words pr-2">
                    {h.side} · {h.asset ?? "BTC"} · {formatMoney(h.amountUSDT)} USDT
                  </span>
                  <span
                    className={`shrink-0 ${h.profitUSDT >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                  >
                    {h.profitUSDT >= 0 ? "+" : ""}
                    {formatMoney(h.profitUSDT)} USDT
                  </span>
                </div>
                <div className="mt-1 text-slate-900">
                  Settled at {new Date(h.claimedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resultModal ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-sky-200/90 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,.14),transparent_45%),linear-gradient(180deg,rgba(248,252,255,.98),rgba(236,244,255,.96))] p-5 shadow-[0_28px_100px_rgba(15,23,42,.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-sky-700/70">AI powered trade</div>
                <div className="mt-2 text-xl font-semibold text-slate-950">
                  {resultModalIsProfit ? "Trade Completed" : "Trade Settled"}
                </div>
              </div>
              <button
                type="button"
                onClick={closeResultModal}
                className="rounded-xl border border-sky-200 bg-white/80 px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-[28px] border border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,.96),rgba(239,246,255,.9))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_18px_36px_rgba(148,163,184,.18)]">
              {!resultModal.revealResult ? (
                <div className="space-y-4">
                  <div className="min-h-[52px] text-center text-lg font-semibold text-slate-800 transition-opacity duration-300">
                    {resultStageTexts[resultModal.stageIndex]}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sky-100">
                    <div
                      className={`h-full transition-[width] duration-500 ${
                        resultModalIsProfit
                          ? "bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400"
                          : "bg-gradient-to-r from-sky-500 via-amber-400 to-rose-400"
                      }`}
                      style={{
                        width: `${Math.max(
                          20,
                          ((resultModal.stageIndex + 1) / resultStageTexts.length) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {resultModalIsProfit ? "Final Profit" : "Final Loss"}
                  </div>
                  <div
                    className={[
                      "text-5xl font-black tracking-tight",
                      resultModal.resultUSDT >= 0 ? "text-emerald-500" : "text-rose-500",
                    ].join(" ")}
                  >
                    {resultModal.resultUSDT >= 0 ? "+" : ""}
                    {formatMoney(resultModal.resultUSDT)}
                    <span className="ml-2 text-2xl font-semibold text-slate-500">USDT</span>
                  </div>

                  <div className="text-sm text-slate-500">
                    {resultModal.side} · {resultModal.asset} · {formatMoney(resultModal.amountUSDT)} USDT
                  </div>
                </div>
              )}
            </div>

            {resultModal.revealResult ? (
              <div className="mt-4 space-y-3">
                {resultModal.settlementError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                    {resultModal.settlementError}
                  </div>
                ) : null}

                {resultModalIsProfit ? (
                  <>
                    {!resultModal.claimed ? (
                      <button
                        type="button"
                        onClick={claimProfit}
                        disabled={claimLoading}
                        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,.28)] disabled:opacity-60"
                      >
                        {claimLoading ? "Claiming..." : "Claim Profit"}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700">
                        Profit transferred to your wallet successfully.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">
                      {resultModal.settlementDone ? "Loss has been deducted from wallet." : "Settling loss..."}
                    </div>
                    <button
                      type="button"
                      onClick={closeResultModal}
                      className="w-full rounded-xl border border-sky-200 bg-white/85 px-4 py-3 text-base font-semibold text-slate-700 hover:bg-white"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {sessionPhase === "ANALYZING" && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4">
              <div className="w-full max-w-md rounded-[26px] border border-sky-200/90 bg-[radial-gradient(circle_at_top,rgba(96,165,250,.16),transparent_55%),linear-gradient(180deg,rgba(255,255,255,.97),rgba(239,246,255,.95))] p-5 shadow-[0_24px_60px_rgba(15,23,42,.22)]">
                <div className="text-sm text-sky-700/70">AI powered Trade Session</div>
                <div
                  className={[
                    "mt-3 text-lg font-semibold text-slate-900 transition-opacity duration-400",
                    analysisVisible ? "opacity-100" : "opacity-10",
                  ].join(" ")}
                >
                  {ANALYSIS_TEXTS[analysisIdx]}
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sky-100">
                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-blue-500 via-cyan-400 to-sky-300" />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
