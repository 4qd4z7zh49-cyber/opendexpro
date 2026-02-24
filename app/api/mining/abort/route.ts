import { NextResponse } from "next/server";
import { MINING_PLANS } from "@/lib/miningMock";
import { getUserAccessForUser } from "@/lib/userAccessStore";
import {
  createServiceClient,
  readUsdtBalance,
  resolveUserId,
  roundTo,
  writeUsdtBalance,
} from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AbortBody = {
  orderId?: string;
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

    const body = (await req.json().catch(() => ({}))) as AbortBody;
    const orderId = String(body.orderId ?? "").trim();
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const { data: order, error: orderErr } = await svc
      .from("mining_orders")
      .select("id,user_id,plan_id,amount,status")
      .eq("id", orderId)
      .eq("user_id", userId)
      .maybeSingle();

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "ACTIVE") {
      return NextResponse.json({ error: "Only active orders can be aborted" }, { status: 400 });
    }

    const plan = MINING_PLANS.find((p) => p.id === String(order.plan_id));
    const abortFee = Number(plan?.abortFee ?? 0.05);
    const principal = Number(order.amount ?? 0);
    const refundUSDT = roundTo(principal * (1 - abortFee), 8);

    const current = await readUsdtBalance(svc, userId);
    const next = roundTo(current + refundUSDT, 8);

    await writeUsdtBalance(svc, userId, next);

    const { data: updated, error: upErr } = await svc
      .from("mining_orders")
      .update({ status: "ABORTED", note: "User aborted" })
      .eq("id", orderId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .select("id")
      .maybeSingle();

    if (upErr || !updated) {
      try {
        await writeUsdtBalance(svc, userId, current);
      } catch {
        // best-effort rollback
      }
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ error: "Order can no longer be aborted" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, refundUSDT, balanceUSDT: next });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Abort failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
