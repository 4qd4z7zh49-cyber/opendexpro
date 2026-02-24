import { NextResponse } from "next/server";
import { requireAdminSession, supabaseAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

const ASSETS = ["USDT", "BTC", "ETH", "SOL", "XRP"] as const;
type Asset = (typeof ASSETS)[number];
type AddressMap = Record<Asset, string>;

type AddressBody = {
  addresses?: Partial<Record<Asset | string, string>>;
};

function emptyMap(): AddressMap {
  return {
    USDT: "",
    BTC: "",
    ETH: "",
    SOL: "",
    XRP: "",
  };
}

function isSuperadminRole(role: string) {
  return role.trim().toLowerCase() === "superadmin";
}

async function resolvePrimarySuperadminId() {
  const { data, error } = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("role", "superadmin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : "";
}

function normalizeBody(value: unknown): AddressBody {
  if (!value || typeof value !== "object") return {};
  return value as AddressBody;
}

function sanitizeAddress(value: unknown) {
  return String(value || "").trim();
}

async function loadAddressMap(adminId: string) {
  const map = emptyMap();
  if (!adminId) return map;

  const { data, error } = await supabaseAdmin
    .from("admin_deposit_addresses")
    .select("asset,address")
    .eq("admin_id", adminId);

  if (error) throw new Error(error.message);

  (data || []).forEach((row: { asset: string | null; address: string | null }) => {
    const asset = String(row.asset || "").toUpperCase();
    if ((ASSETS as readonly string[]).includes(asset)) {
      map[asset as Asset] = String(row.address || "");
    }
  });

  return map;
}

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ownerAdminId = await resolvePrimarySuperadminId();
    if (!ownerAdminId) {
      return NextResponse.json({ error: "Superadmin not configured" }, { status: 400 });
    }

    const addresses = await loadAddressMap(ownerAdminId);
    const canEdit = isSuperadminRole(auth.role) && auth.adminId === ownerAdminId;

    return NextResponse.json({
      ok: true,
      adminId: ownerAdminId,
      canEdit,
      addresses,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load addresses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperadminRole(auth.role)) {
    return NextResponse.json({ error: "Only superadmin can update deposit addresses" }, { status: 403 });
  }

  try {
    const ownerAdminId = await resolvePrimarySuperadminId();
    if (!ownerAdminId) {
      return NextResponse.json({ error: "Superadmin not configured" }, { status: 400 });
    }
    if (auth.adminId !== ownerAdminId) {
      return NextResponse.json({ error: "Only primary superadmin can update deposit addresses" }, { status: 403 });
    }

    const body = normalizeBody(await req.json().catch(() => null));
    const rawAddresses = body.addresses ?? {};

    const payload = ASSETS.map((asset) => ({
      admin_id: ownerAdminId,
      asset,
      address: sanitizeAddress(rawAddresses[asset]),
    }));

    const { error } = await supabaseAdmin
      .from("admin_deposit_addresses")
      .upsert(payload, { onConflict: "admin_id,asset" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const addresses = await loadAddressMap(ownerAdminId);
    return NextResponse.json({
      ok: true,
      adminId: ownerAdminId,
      canEdit: true,
      addresses,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save addresses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
