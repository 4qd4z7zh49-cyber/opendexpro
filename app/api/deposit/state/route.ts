import { NextResponse } from "next/server";
import {
  createServiceClient,
  resolveUserId,
  resolvePrimarySuperadmin,
  readAddressMap,
} from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DepositHistoryRow = {
  id: string;
  asset: string;
  amount: number;
  walletAddress: string;
  status: string;
  createdAt: string;
};

export async function GET(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owner = await resolvePrimarySuperadmin(svc);
    const addresses = owner?.id ? await readAddressMap(svc, owner.id) : null;

    const { data: historyRows, error: histErr } = await svc
      .from("deposit_history")
      .select("id,asset,amount,wallet_address,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (histErr) {
      return NextResponse.json({ error: histErr.message }, { status: 500 });
    }

    const history: DepositHistoryRow[] = (historyRows || []).map((row) => ({
      id: String(row.id),
      asset: String(row.asset),
      amount: Number(row.amount ?? 0),
      walletAddress: String(row.wallet_address || ""),
      status: String(row.status || ""),
      createdAt: String(row.created_at || ""),
    }));

    return NextResponse.json({
      ok: true,
      ownerAdmin: owner
        ? {
            id: String(owner.id),
            username: owner.username ? String(owner.username) : null,
            role: owner.role ? String(owner.role) : null,
          }
        : null,
      addresses,
      history,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load deposit state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
