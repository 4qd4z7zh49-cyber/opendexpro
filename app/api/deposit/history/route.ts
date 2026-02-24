import { NextResponse } from "next/server";
import {
  ASSETS,
  type Asset,
  createServiceClient,
  resolveUserId,
  resolveAddressOwnerAdmin,
  resolvePrimarySuperadmin,
  readAddressMap,
} from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DepositHistoryBody = {
  asset?: string;
  amount?: number | string;
};

function normalizeBody(value: unknown): DepositHistoryBody {
  if (!value || typeof value !== "object") return {};
  return value as DepositHistoryBody;
}

function normalizeAsset(value: unknown): Asset {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if ((ASSETS as readonly string[]).includes(s)) {
    return s as Asset;
  }
  return "USDT";
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = normalizeBody(await req.json().catch(() => null));
    const amount = Number(body.amount ?? 0);
    const asset = normalizeAsset(body.asset);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    const managedOwner = await resolveAddressOwnerAdmin(svc, userId);
    const addressOwner = await resolvePrimarySuperadmin(svc);
    if (!addressOwner?.id) {
      return NextResponse.json(
        { error: "Superadmin deposit addresses are not configured yet" },
        { status: 400 }
      );
    }

    const addresses = await readAddressMap(svc, addressOwner.id);
    const walletAddress = String(addresses[asset] || "").trim();
    if (!walletAddress) {
      return NextResponse.json(
        { error: `${asset} deposit address is not configured yet` },
        { status: 400 }
      );
    }

    const insertPayload = {
      user_id: userId,
      admin_id: managedOwner?.id || addressOwner.id,
      asset,
      amount,
      wallet_address: walletAddress,
      status: "PENDING",
    };

    const { data, error } = await svc
      .from("deposit_history")
      .insert(insertPayload)
      .select("id,asset,amount,wallet_address,status,created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      row: {
        id: String(data.id),
        asset: String(data.asset),
        amount: Number(data.amount ?? 0),
        walletAddress: String(data.wallet_address || ""),
        status: String(data.status || ""),
        createdAt: String(data.created_at || ""),
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save deposit history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
