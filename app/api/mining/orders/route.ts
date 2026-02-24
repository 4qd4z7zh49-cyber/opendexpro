import { NextResponse } from "next/server";
import { MINING_PLANS } from "@/lib/miningMock";
import { createServiceClient, resolveUserId } from "../_helpers";
import { getUserAccessForUser } from "@/lib/userAccessStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbMiningOrder = {
  id: string;
  plan_id: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "ABORTED" | "COMPLETED";
  created_at: string;
  activated_at: string | null;
};

function toTs(v: string | null | undefined) {
  if (!v) return 0;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : 0;
}

function shouldBeCompleted(row: DbMiningOrder, nowTs: number) {
  if (row.status !== "ACTIVE") return false;
  const plan = MINING_PLANS.find((p) => p.id === row.plan_id);
  if (!plan) return false;
  const startTs = toTs(row.activated_at) || toTs(row.created_at);
  if (!startTs) return false;
  const endTs = startTs + plan.cycleDays * 24 * 60 * 60 * 1000;
  return nowTs >= endTs;
}

export async function GET(req: Request) {
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

    const { data, error } = await svc
      .from("mining_orders")
      .select("id,user_id,plan_id,amount,status,created_at,activated_at,note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as DbMiningOrder[];
    const nowTs = Date.now();
    const doneIds = rows.filter((r) => shouldBeCompleted(r, nowTs)).map((r) => r.id);

    if (doneIds.length > 0) {
      const { error: upErr } = await svc
        .from("mining_orders")
        .update({ status: "COMPLETED" })
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .in("id", doneIds);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }

      const { data: fresh, error: freshErr } = await svc
        .from("mining_orders")
        .select("id,user_id,plan_id,amount,status,created_at,activated_at,note")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (freshErr) {
        return NextResponse.json({ error: freshErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, rows: fresh || [] });
    }

    return NextResponse.json({ ok: true, rows: data || [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load mining orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
