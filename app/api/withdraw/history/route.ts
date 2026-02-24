import { NextResponse } from "next/server";
import {
  ASSETS,
  createServiceClient,
  resolveAddressOwnerAdmin,
  resolveUserId,
} from "../../deposit/_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Asset = (typeof ASSETS)[number];
type WithdrawStatus = "PENDING" | "CONFIRMED" | "FROZEN";

type WithdrawRow = {
  id: string;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: WithdrawStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateBody = {
  asset?: string;
  amount?: number | string;
  walletAddress?: string;
  note?: string;
};

function normalizeAsset(v: unknown): Asset {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  return (ASSETS as readonly string[]).includes(s) ? (s as Asset) : "USDT";
}

function normalizeStatus(v: unknown): WithdrawStatus {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "FROZEN") return "FROZEN";
  return "PENDING";
}

function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseBody(v: unknown): CreateBody {
  if (!v || typeof v !== "object") return {};
  return v as CreateBody;
}

function mapRow(row: Record<string, unknown>): WithdrawRow {
  return {
    id: String(row.id || ""),
    asset: normalizeAsset(row.asset),
    amount: toNumber(row.amount) || 0,
    walletAddress: String(row.wallet_address || ""),
    status: normalizeStatus(row.status),
    note: row.note ? String(row.note) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || row.created_at || ""),
  };
}

export async function GET(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await svc
      .from("withdraw_requests")
      .select("id,asset,amount,wallet_address,status,note,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      rows: (data || []).map((row) => mapRow(row as Record<string, unknown>)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load withdraw history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = parseBody(await req.json().catch(() => null));
    const asset = normalizeAsset(body.asset);
    const amount = toNumber(body.amount);
    const walletAddress = String(body.walletAddress || "").trim();
    const note = String(body.note || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }
    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    const owner = await resolveAddressOwnerAdmin(svc, userId);

    const { data, error } = await svc
      .from("withdraw_requests")
      .insert({
        user_id: userId,
        admin_id: owner?.id || null,
        asset,
        amount,
        wallet_address: walletAddress,
        status: "PENDING",
        note: note || null,
      })
      .select("id,asset,amount,wallet_address,status,note,created_at,updated_at")
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to create withdraw request" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      row: mapRow(data as Record<string, unknown>),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to create withdraw request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
