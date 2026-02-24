import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabaseEnv";

export const ASSETS = ["USDT", "BTC", "ETH", "SOL", "XRP"] as const;
export type Asset = (typeof ASSETS)[number];
export type AddressMap = Record<Asset, string>;

type ProfileOwnerRow = {
  managed_by: string | null;
};

type AdminRow = {
  id: string;
  username: string | null;
  role: string | null;
};

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

export function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
}

export function emptyAddressMap(): AddressMap {
  return {
    USDT: "",
    BTC: "",
    ETH: "",
    SOL: "",
    XRP: "",
  };
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

export async function resolveAddressOwnerAdmin(
  svc: SupabaseClient,
  userId: string
): Promise<AdminRow | null> {
  const { data: profileRow, error: profileErr } = await svc
    .from("profiles")
    .select("managed_by")
    .eq("id", userId)
    .maybeSingle<ProfileOwnerRow>();
  if (profileErr) throw new Error(profileErr.message);

  const managedBy = profileRow?.managed_by ? String(profileRow.managed_by) : "";
  if (managedBy) {
    const { data: owner, error: ownerErr } = await svc
      .from("admins")
      .select("id,username,role")
      .eq("id", managedBy)
      .maybeSingle<AdminRow>();
    if (ownerErr) throw new Error(ownerErr.message);
    if (owner?.id) return owner;
  }

  const { data: fallbackOwner, error: fallbackErr } = await svc
    .from("admins")
    .select("id,username,role")
    .in("role", ["admin", "superadmin"])
    .is("managed_by", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<AdminRow>();
  if (fallbackErr) throw new Error(fallbackErr.message);

  return fallbackOwner?.id ? fallbackOwner : null;
}

export async function resolvePrimarySuperadmin(svc: SupabaseClient): Promise<AdminRow | null> {
  const { data, error } = await svc
    .from("admins")
    .select("id,username,role")
    .eq("role", "superadmin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<AdminRow>();

  if (error) throw new Error(error.message);
  return data?.id ? data : null;
}

export async function readAddressMap(svc: SupabaseClient, adminId: string) {
  const addresses = emptyAddressMap();
  if (!adminId) return addresses;

  const { data, error } = await svc
    .from("admin_deposit_addresses")
    .select("asset,address")
    .eq("admin_id", adminId);
  if (error) throw new Error(error.message);

  (data || []).forEach((row: { asset: string | null; address: string | null }) => {
    const asset = String(row.asset || "").toUpperCase();
    if ((ASSETS as readonly string[]).includes(asset)) {
      addresses[asset as Asset] = String(row.address || "");
    }
  });

  return addresses;
}
