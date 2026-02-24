import { NextResponse } from "next/server";
import { MINING_PLANS } from "@/lib/miningMock";
import { getUserAccessForUser } from "@/lib/userAccessStore";
import {
  createServiceClient,
  readUsdtBalance,
  resolveUserId,
  roundTo,
  toNumber,
  writeUsdtBalance,
} from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PurchaseBody = {
  planId?: string;
  amountUSDT?: number | string;
};

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getUserAccessForUser(svc, userId);
    if (access.miningRestricted) {
      return NextResponse.json(
        { error: "Your account is restricted" },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as PurchaseBody;
    const planId = String(body.planId ?? "").trim();
    const amountUSDT = toNumber(body.amountUSDT);

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const plan = MINING_PLANS.find((p) => p.id === planId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (amountUSDT < plan.min || amountUSDT > plan.max) {
      return NextResponse.json(
        {
          error: `Amount must be between ${plan.min.toLocaleString()} and ${plan.max.toLocaleString()}`,
        },
        { status: 400 }
      );
    }

    const current = await readUsdtBalance(svc, userId);
    if (current + 1e-9 < amountUSDT) {
      return NextResponse.json({ error: "Insufficient USDT" }, { status: 400 });
    }

    const next = roundTo(current - amountUSDT, 8);

    await writeUsdtBalance(svc, userId, next);

    const { data: inserted, error: insErr } = await svc
      .from("mining_orders")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        amount: amountUSDT,
        status: "PENDING",
      })
      .select("id,user_id,plan_id,amount,status,created_at,activated_at,note")
      .single();

    if (insErr) {
      try {
        await writeUsdtBalance(svc, userId, current);
      } catch {
        // best-effort rollback
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, balanceUSDT: next, order: inserted });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Purchase failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
