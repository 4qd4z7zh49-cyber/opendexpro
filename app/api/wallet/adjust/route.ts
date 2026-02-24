import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getUserAccessForUser } from "@/lib/userAccessStore";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdjustBody = {
  deltaUSDT?: number | string;
};

function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseBody(v: unknown): AdjustBody {
  if (!v || typeof v !== "object") return {};
  return v as AdjustBody;
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
}

function createUserClient(cookieHeader: string) {
  return createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      global: { headers: cookieHeader ? { Cookie: cookieHeader } : {} },
    }
  );
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

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getUserAccessForUser(svc, userId);
    if (access.tradeRestricted) {
      return NextResponse.json(
        { error: "Your account is restricted" },
        { status: 403 }
      );
    }

    const body = parseBody(await req.json().catch(() => null));
    const delta = toNumber(body.deltaUSDT);
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "Invalid deltaUSDT" }, { status: 400 });
    }

    const { data: balRow, error: balErr } = await svc
      .from("balances")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (balErr) return NextResponse.json({ error: balErr.message }, { status: 500 });

    const current = Number(balRow?.balance ?? 0);
    const next = current + delta;
    if (next < 0) {
      return NextResponse.json({ error: "Insufficient USDT" }, { status: 400 });
    }

    const { error: upBalErr } = await svc
      .from("balances")
      .upsert({ user_id: userId, balance: next }, { onConflict: "user_id" });
    if (upBalErr) return NextResponse.json({ error: upBalErr.message }, { status: 500 });

    const { error: upHoldErr } = await svc
      .from("holdings")
      .upsert({ user_id: userId, asset: "USDT", balance: next }, { onConflict: "user_id,asset" });
    if (upHoldErr) return NextResponse.json({ error: upHoldErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, balanceUSDT: next, deltaUSDT: delta });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
