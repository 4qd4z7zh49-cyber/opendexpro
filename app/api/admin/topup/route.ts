// app/api/admin/topup/route.ts
import { NextResponse } from "next/server";
import { requireAdminSession, supabaseAdmin, assertCanManageUser } from "../_helpers";

export const dynamic = "force-dynamic";

const ASSETS = ["USDT", "BTC", "ETH", "SOL", "XRP"] as const;
type Asset = (typeof ASSETS)[number];
type TopupMode = "ADD" | "SUBTRACT";
type TopupBody = {
  userId?: string;
  user_id?: string;
  amount?: number | string;
  note?: string;
  asset?: string;
  mode?: string;
  action?: string;
};

function isSubadminRole(role: string) {
  const normalized = role.trim().toLowerCase();
  return normalized === "sub-admin" || normalized === "subadmin";
}

function normalizeAsset(value: unknown): Asset {
  const s = String(value ?? "").trim().toUpperCase();
  return (ASSETS as readonly string[]).includes(s) ? (s as Asset) : "USDT";
}

function normalizeBody(value: unknown): TopupBody {
  if (!value || typeof value !== "object") return {};
  return value as TopupBody;
}

function normalizeMode(value: unknown): TopupMode {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "SUBTRACT" || s === "DEDUCT" || s === "WITHDRAW") return "SUBTRACT";
  return "ADD";
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;
  if (isSubadminRole(role)) {
    return NextResponse.json({ error: "Sub-admin cannot topup or deduct balances" }, { status: 403 });
  }

  try {
    const body = normalizeBody(await req.json().catch(() => null));

    const userId = String(body.userId || body.user_id || "").trim();
    const amount = Number(body?.amount ?? 0);
    const note = String(body.note || "").trim();
    const asset = normalizeAsset(body.asset);
    const mode = normalizeMode(body.mode || body.action);

    if (!userId) return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // ✅ subadmin permission: profiles.managed_by check
    const ok = await assertCanManageUser(adminId, role, userId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let newHolding = 0;
    let newUsdtBalance: number | null = null;
    const signedAmount = mode === "SUBTRACT" ? -amount : amount;

    if (asset === "USDT") {
      // USDT source of truth = balances table
      const { data: balRow, error: balErr } = await supabaseAdmin
        .from("balances")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (balErr) return NextResponse.json({ error: balErr.message }, { status: 500 });

      const currentUsdt = Number(balRow?.balance || 0);
      newUsdtBalance = currentUsdt + signedAmount;
      if (newUsdtBalance < 0) {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }
      newHolding = newUsdtBalance;

      const { error: balUpsertErr } = await supabaseAdmin
        .from("balances")
        .upsert({ user_id: userId, balance: newUsdtBalance }, { onConflict: "user_id" });

      if (balUpsertErr) return NextResponse.json({ error: balUpsertErr.message }, { status: 500 });

      // keep USDT holding in sync with main USDT balance
      const { error: usdtHoldErr } = await supabaseAdmin
        .from("holdings")
        .upsert({ user_id: userId, asset: "USDT", balance: newHolding }, { onConflict: "user_id,asset" });

      if (usdtHoldErr) return NextResponse.json({ error: usdtHoldErr.message }, { status: 500 });
    } else {
      // non-USDT assets stay in holdings
      const { data: holdRow, error: holdErr } = await supabaseAdmin
        .from("holdings")
        .select("balance")
        .eq("user_id", userId)
        .eq("asset", asset)
        .maybeSingle();

      if (holdErr) return NextResponse.json({ error: holdErr.message }, { status: 500 });

      const currentHolding = Number(holdRow?.balance || 0);
      newHolding = currentHolding + signedAmount;
      if (newHolding < 0) {
        return NextResponse.json({ error: `Insufficient ${asset} balance` }, { status: 400 });
      }

      const { error: holdUpsertErr } = await supabaseAdmin
        .from("holdings")
        .upsert({ user_id: userId, asset, balance: newHolding }, { onConflict: "user_id,asset" });

      if (holdUpsertErr) return NextResponse.json({ error: holdUpsertErr.message }, { status: 500 });
    }

    // log topup
    const { error: logErr } = await supabaseAdmin.from("topups").insert({
      user_id: userId,
      admin_id: adminId,
      amount: signedAmount,
      asset,
      note: note || null,
    });

    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      asset,
      mode,
      signedAmount,
      newHolding,
      newUsdtBalance,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
