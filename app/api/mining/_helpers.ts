import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabaseEnv";

export const runtime = "nodejs";

export function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
}

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

export function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export async function resolveUserId(req: Request, svc: SupabaseClient) {
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

export function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function roundTo(v: number, digits = 8) {
  const p = 10 ** digits;
  return Math.round((v + Number.EPSILON) * p) / p;
}

export async function readUsdtBalance(svc: SupabaseClient, userId: string) {
  const { data: balRow, error: balErr } = await svc
    .from("balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (balErr) throw new Error(balErr.message);
  return Number(balRow?.balance ?? 0);
}

export async function writeUsdtBalance(svc: SupabaseClient, userId: string, next: number) {
  const { error: upBalErr } = await svc
    .from("balances")
    .upsert({ user_id: userId, balance: next }, { onConflict: "user_id" });
  if (upBalErr) throw new Error(upBalErr.message);

  const { error: upHoldErr } = await svc
    .from("holdings")
    .upsert({ user_id: userId, asset: "USDT", balance: next }, { onConflict: "user_id,asset" });
  if (upHoldErr) throw new Error(upHoldErr.message);
}
