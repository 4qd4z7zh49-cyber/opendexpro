import { NextResponse } from "next/server";

import { getUserAccessForUsers } from "@/lib/userAccessStore";
import { assertCanManageUser, requireAdminSession, supabaseAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";

type ProfileRow = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  managed_by: string | null;
};

type HoldingRow = {
  asset: string | null;
  balance: number | null;
};

type TopupRow = {
  id: string;
  amount: number | null;
  asset: string | null;
  note: string | null;
  created_at: string | null;
};

type DepositRow = {
  id: string;
  asset: string | null;
  amount: number | null;
  wallet_address: string | null;
  status: string | null;
  created_at: string | null;
};

type WithdrawRow = {
  id: string;
  asset: string | null;
  amount: number | null;
  wallet_address: string | null;
  status: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MiningRow = {
  id: string;
  plan_id: string | null;
  amount: number | null;
  status: string | null;
  note: string | null;
  created_at: string | null;
  activated_at: string | null;
};

type TradeOrderRow = Record<string, unknown>;

type ActivityItem = {
  id: string;
  source: "BALANCE" | "DEPOSIT" | "WITHDRAW" | "MINING" | "TRADE";
  title: string;
  detail: string;
  status: string;
  createdAt: string;
};

type ErrorLike =
  | {
      message?: unknown;
      code?: unknown;
    }
  | null
  | undefined;

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function errorMessage(error: ErrorLike) {
  return String(error?.message || "").trim();
}

function isMissingRelationOrColumnError(error: ErrorLike) {
  const code = String(error?.code || "")
    .trim()
    .toUpperCase();
  if (code === "42P01" || code === "42703") return true;

  const message = errorMessage(error).toLowerCase();
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function normalizeAsset(value: unknown): Asset {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "BTC" || raw === "ETH" || raw === "SOL" || raw === "XRP") return raw as Asset;
  return "USDT";
}

function normalizeStatus(value: unknown, fallback = "UNKNOWN") {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  return status || fallback;
}

function normalizeDate(value: unknown) {
  const raw = String(value || "").trim();
  return raw || "";
}

function sortByCreatedAtDesc(rows: ActivityItem[]) {
  return rows.sort((a, b) => {
    const aTs = Date.parse(a.createdAt || "");
    const bTs = Date.parse(b.createdAt || "");
    const aSafe = Number.isFinite(aTs) ? aTs : 0;
    const bSafe = Number.isFinite(bTs) ? bTs : 0;
    return bSafe - aSafe;
  });
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = row[key];
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function pickNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = row[key];
    const n = toNumber(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;
  const url = new URL(req.url);
  const userId = String(url.searchParams.get("userId") || "").trim();
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(5, Math.min(100, Math.floor(limitRaw))) : 20;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const canManage = await assertCanManageUser(adminId, role, userId);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [profileRes, usdtRes, holdingsRes, topupsRes, depositsRes, withdrawsRes, miningRes, accessMap] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id,username,email,phone,created_at,managed_by")
          .eq("id", userId)
          .maybeSingle(),
        supabaseAdmin.from("balances").select("balance").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("holdings").select("asset,balance").eq("user_id", userId),
        supabaseAdmin
          .from("topups")
          .select("id,amount,asset,note,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabaseAdmin
          .from("deposit_history")
          .select("id,asset,amount,wallet_address,status,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabaseAdmin
          .from("withdraw_requests")
          .select("id,asset,amount,wallet_address,status,note,created_at,updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabaseAdmin
          .from("mining_orders")
          .select("id,plan_id,amount,status,note,created_at,activated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        getUserAccessForUsers(supabaseAdmin, [userId]),
      ]);

    if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
    if (usdtRes.error) return NextResponse.json({ error: usdtRes.error.message }, { status: 500 });
    if (holdingsRes.error) return NextResponse.json({ error: holdingsRes.error.message }, { status: 500 });
    if (topupsRes.error) return NextResponse.json({ error: topupsRes.error.message }, { status: 500 });
    if (depositsRes.error) return NextResponse.json({ error: depositsRes.error.message }, { status: 500 });
    if (withdrawsRes.error) return NextResponse.json({ error: withdrawsRes.error.message }, { status: 500 });
    if (miningRes.error) return NextResponse.json({ error: miningRes.error.message }, { status: 500 });

    const profile = (profileRes.data || null) as ProfileRow | null;
    if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let managedByUsername: string | null = null;
    if (profile.managed_by) {
      const managerRes = await supabaseAdmin
        .from("admins")
        .select("username")
        .eq("id", profile.managed_by)
        .maybeSingle();
      if (managerRes.error) return NextResponse.json({ error: managerRes.error.message }, { status: 500 });
      managedByUsername = managerRes.data?.username ? String(managerRes.data.username) : null;
    }

    const holdings = (holdingsRes.data || []) as HoldingRow[];
    const assetMap: Record<Asset, number> = {
      USDT: toNumber(usdtRes.data?.balance ?? 0),
      BTC: 0,
      ETH: 0,
      SOL: 0,
      XRP: 0,
    };
    holdings.forEach((row) => {
      const asset = normalizeAsset(row.asset);
      if (asset === "USDT") return;
      assetMap[asset] = toNumber(row.balance);
    });

    const activities: ActivityItem[] = [];

    // Trade history (orders) is optional: avoid breaking the modal if the table/schema is missing.
    let tradeOrders: TradeOrderRow[] = [];
    {
      const attempt = async (orderBy: string | null) => {
        const q = supabaseAdmin.from("orders").select("*").eq("user_id", userId).limit(limit);
        return orderBy ? q.order(orderBy, { ascending: false }) : q;
      };

      const first = await attempt("created_at");
      if (first.error && isMissingRelationOrColumnError(first.error as ErrorLike)) {
        const second = await attempt("updated_at");
        if (second.error && isMissingRelationOrColumnError(second.error as ErrorLike)) {
          const third = await attempt(null);
          if (third.error && !isMissingRelationOrColumnError(third.error as ErrorLike)) {
            return NextResponse.json({ error: third.error.message }, { status: 500 });
          }
          tradeOrders = Array.isArray(third.data) ? (third.data as TradeOrderRow[]) : [];
        } else if (second.error) {
          return NextResponse.json({ error: second.error.message }, { status: 500 });
        } else {
          tradeOrders = Array.isArray(second.data) ? (second.data as TradeOrderRow[]) : [];
        }
      } else if (first.error) {
        return NextResponse.json({ error: first.error.message }, { status: 500 });
      } else {
        tradeOrders = Array.isArray(first.data) ? (first.data as TradeOrderRow[]) : [];
      }
    }

    ((topupsRes.data || []) as TopupRow[]).forEach((row) => {
      const amount = toNumber(row.amount);
      const asset = normalizeAsset(row.asset);
      const isAdd = amount >= 0;
      const absAmount = Math.abs(amount);
      const note = row.note ? ` • ${String(row.note)}` : "";
      activities.push({
        id: `topup:${row.id}`,
        source: "BALANCE",
        title: isAdd ? "Balance Credit" : "Balance Deduct",
        detail: `${isAdd ? "+" : "-"}${absAmount.toLocaleString()} ${asset}${note}`,
        status: "DONE",
        createdAt: normalizeDate(row.created_at),
      });
    });

    ((depositsRes.data || []) as DepositRow[]).forEach((row) => {
      const asset = normalizeAsset(row.asset);
      const amount = toNumber(row.amount);
      const status = normalizeStatus(row.status, "PENDING");
      activities.push({
        id: `deposit:${row.id}`,
        source: "DEPOSIT",
        title: `Deposit ${status}`,
        detail: `${asset} ${amount.toLocaleString()} • ${String(row.wallet_address || "-")}`,
        status,
        createdAt: normalizeDate(row.created_at),
      });
    });

    ((withdrawsRes.data || []) as WithdrawRow[]).forEach((row) => {
      const asset = normalizeAsset(row.asset);
      const amount = toNumber(row.amount);
      const status = normalizeStatus(row.status, "PENDING");
      const note = row.note ? ` • ${String(row.note)}` : "";
      activities.push({
        id: `withdraw:${row.id}`,
        source: "WITHDRAW",
        title: `Withdraw ${status}`,
        detail: `${asset} ${amount.toLocaleString()} • ${String(row.wallet_address || "-")}${note}`,
        status,
        createdAt: normalizeDate(row.updated_at || row.created_at),
      });
    });

    ((miningRes.data || []) as MiningRow[]).forEach((row) => {
      const status = normalizeStatus(row.status, "PENDING");
      const amount = toNumber(row.amount);
      const note = row.note ? ` • ${String(row.note)}` : "";
      const plan = String(row.plan_id || "-");
      activities.push({
        id: `mining:${row.id}`,
        source: "MINING",
        title: `Mining ${status}`,
        detail: `${plan} • ${amount.toLocaleString()} USDT${note}`,
        status,
        createdAt: normalizeDate(row.activated_at || row.created_at),
      });
    });

    tradeOrders.forEach((row) => {
      const r = (row || {}) as Record<string, unknown>;
      const id = pickString(r, ["id"]) || crypto.randomUUID();
      const asset = normalizeAsset(pickString(r, ["asset", "symbol", "coin", "pair"]));
      const sideRaw = pickString(r, ["side", "type", "direction", "position"]).toUpperCase();
      const side = sideRaw === "SELL" || sideRaw === "BUY" ? sideRaw : "";
      const amountUSDT = pickNumber(r, ["amount", "amount_usdt", "amountUSDT", "usdt_amount", "total", "quantity"]);
      const profitUSDT = pickNumber(r, ["profit", "profit_usdt", "profitUSDT", "pnl", "p_l", "result_amount"]);
      const status = normalizeStatus(r["result"] ?? r["status"] ?? (profitUSDT >= 0 ? "WIN" : "LOSE"), "UNKNOWN");
      const createdAt = normalizeDate(
        pickString(r, ["updated_at", "created_at", "settled_at", "completed_at", "createdAt"])
      );

      const plLabel = `${profitUSDT >= 0 ? "+" : "-"}${Math.abs(profitUSDT).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} USDT`;
      const amountLabel = amountUSDT
        ? `${amountUSDT.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`
        : "-";

      activities.push({
        id: `trade:${id}`,
        source: "TRADE",
        title: `Trade ${status}`,
        detail: `${side ? `${side} • ` : ""}${asset} • ${amountLabel} • P/L ${plLabel}`,
        status,
        createdAt,
      });
    });

    const access = accessMap[userId] || {
      tradeRestricted: false,
      miningRestricted: false,
      source: "default" as const,
    };

    return NextResponse.json({
      ok: true,
      user: {
        id: profile.id,
        username: profile.username ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        createdAt: profile.created_at ?? null,
        managedBy: profile.managed_by ?? null,
        managedByUsername,
        balances: {
          usdt: assetMap.USDT,
          btc: assetMap.BTC,
          eth: assetMap.ETH,
          sol: assetMap.SOL,
          xrp: assetMap.XRP,
        },
        access: {
          tradeRestricted: Boolean(access.tradeRestricted),
          miningRestricted: Boolean(access.miningRestricted),
          restricted: Boolean(access.tradeRestricted || access.miningRestricted),
        },
      },
      activities: sortByCreatedAtDesc(activities).slice(0, Math.min(limit * 4, 300)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load user details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
