import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "BUY" | "SELL";
type TradeAsset = "USDT" | "BTC" | "ETH" | "GOLD" | "XRP" | "SOL";

type Body = {
  id?: unknown;
  side?: unknown;
  asset?: unknown;
  amountUSDT?: unknown;
  profitUSDT?: unknown;
  createdAt?: unknown; // ISO or ms
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
  return Number.isFinite(n) ? n : NaN;
}

function normalizeSide(value: unknown): Side {
  return String(value || "").trim().toUpperCase() === "SELL" ? "SELL" : "BUY";
}

function normalizeAsset(value: unknown): TradeAsset {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "BTC" || raw === "ETH" || raw === "GOLD" || raw === "XRP" || raw === "SOL") return raw as TradeAsset;
  return "USDT";
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

function isUniqueViolation(error: ErrorLike) {
  const code = String(error?.code || "").trim();
  if (code === "23505") return true;
  return errorMessage(error).toLowerCase().includes("duplicate key");
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
}

function createUserClient(cookieHeader: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: cookieHeader ? { Cookie: cookieHeader } : {} },
  });
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function resolveUserId(req: Request, svc: SupabaseClient) {
  const bearer = getBearerToken(req);
  if (bearer) {
    const { data, error } = await svc.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  const cookieHeader = req.headers.get("cookie") || "";
  const userClient = createUserClient(cookieHeader);
  const { data, error } = await userClient.auth.getUser();
  if (!error && data?.user?.id) return data.user.id;

  return "";
}

function normalizeCreatedAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const ts = Date.parse(raw);
  if (Number.isFinite(ts)) return new Date(ts).toISOString();
  return new Date().toISOString();
}

async function insertWithFallback(svc: SupabaseClient, payloads: Array<Record<string, unknown>>) {
  let lastErr: ErrorLike = null;
  for (const payload of payloads) {
    const { error } = await svc.from("orders").insert(payload);
    if (!error) return;
    if (isUniqueViolation(error as ErrorLike)) return;
    if (isMissingRelationOrColumnError(error as ErrorLike)) {
      lastErr = error as ErrorLike;
      continue;
    }
    throw new Error(error.message);
  }
  if (lastErr) {
    // Table exists but schema mismatch; surface a readable error for debugging.
    throw new Error(errorMessage(lastErr) || "Failed to record trade order");
  }
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const side = normalizeSide(body.side);
    const asset = normalizeAsset(body.asset);
    const amountUSDT = toNumber(body.amountUSDT);
    const profitUSDT = toNumber(body.profitUSDT);
    const createdAt = normalizeCreatedAt(body.createdAt);
    if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
      return NextResponse.json({ error: "amountUSDT is invalid" }, { status: 400 });
    }
    if (!Number.isFinite(profitUSDT)) {
      return NextResponse.json({ error: "profitUSDT is invalid" }, { status: 400 });
    }

    const result = profitUSDT >= 0 ? "WIN" : "LOSE";

    // Try common column shapes; fall back to minimal payload.
    await insertWithFallback(svc, [
      {
        id,
        user_id: userId,
        side,
        asset,
        amount_usdt: amountUSDT,
        profit_usdt: profitUSDT,
        result,
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id,
        user_id: userId,
        side,
        asset,
        amount: amountUSDT,
        profit: profitUSDT,
        result,
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id,
        userId: userId,
        side,
        asset,
        amountUSDT: amountUSDT,
        profitUSDT: profitUSDT,
        result,
        createdAt,
      },
      {
        id,
        user_id: userId,
        result,
        created_at: createdAt,
      },
      {
        id,
        user_id: userId,
        result,
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to record trade order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

