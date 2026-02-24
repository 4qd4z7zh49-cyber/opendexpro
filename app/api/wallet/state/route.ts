import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createUserClient(cookieHeader: string) {
  return createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      global: {
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
      },
    }
  );
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
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

export async function GET(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: bals, error: bErr } = await svc
      .from("balances")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const { data: holds, error: hErr } = await svc
      .from("holdings")
      .select("asset, balance")
      .eq("user_id", userId);
    if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

    const holdings: Record<string, number> = { USDT: Number(bals?.balance ?? 0) };
    (holds ?? []).forEach((r) => {
      holdings[String(r.asset)] = Number(r.balance ?? 0);
    });

    return NextResponse.json({ ok: true, holdings });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read wallet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
