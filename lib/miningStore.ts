"use client";

import { MINING_PLANS, type MiningPlan } from "@/lib/miningMock";
import { getUserAuthHeaders } from "@/lib/clientAuth";

export type MiningOrderStatus = "PENDING" | "ACTIVE" | "REJECTED" | "ABORTED" | "COMPLETED";

export type MiningOrder = {
  id: string;
  planId: string;
  planName: string;
  principalUSDT: number;
  dailyRate: number;
  cycleDays: number;
  abortFee: number;
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  status: MiningOrderStatus;
  note?: string | null;
};

type OrdersResp = {
  ok?: boolean;
  error?: string;
  rows?: DbMiningOrder[];
};

type PurchaseResp = {
  ok?: boolean;
  error?: string;
  order?: DbMiningOrder;
};

type AbortResp = {
  ok?: boolean;
  error?: string;
  refundUSDT?: number;
  balanceUSDT?: number;
};

type DbMiningOrder = {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  status: MiningOrderStatus;
  created_at: string;
  activated_at?: string | null;
  note?: string | null;
};

function toTimestamp(v: string | null | undefined) {
  if (!v) return 0;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : 0;
}

function mapOrder(row: DbMiningOrder): MiningOrder {
  const plan = MINING_PLANS.find((p) => p.id === row.plan_id);
  const createdAt = toTimestamp(row.created_at);
  const activeStart = toTimestamp(row.activated_at ?? null) || createdAt;
  const startedAt = row.status === "ACTIVE" || row.status === "COMPLETED" ? activeStart : null;

  return {
    id: row.id,
    planId: row.plan_id,
    planName: plan?.name ?? row.plan_id,
    principalUSDT: Number(row.amount ?? 0),
    dailyRate: Number(plan?.dailyRate ?? 0),
    cycleDays: Number(plan?.cycleDays ?? 0),
    abortFee: Number(plan?.abortFee ?? 0.05),
    createdAt,
    startedAt,
    endsAt:
      startedAt != null && Number(plan?.cycleDays ?? 0) > 0
        ? startedAt + Number(plan?.cycleDays ?? 0) * 24 * 60 * 60 * 1000
        : null,
    status: row.status,
    note: row.note ?? null,
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  return getUserAuthHeaders();
}

export async function getMiningOrders() {
  const headers = await authHeaders();
  const r = await fetch("/api/mining/orders", {
    cache: "no-store",
    headers,
  });

  const j = (await r.json().catch(() => ({}))) as OrdersResp;
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || "Failed to load mining orders");
  }

  const rows = Array.isArray(j.rows) ? j.rows : [];
  return rows.map(mapOrder);
}

export async function purchaseMining(plan: MiningPlan, amountUSDT: number) {
  if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
    throw new Error("Invalid amount");
  }
  if (amountUSDT < plan.min || amountUSDT > plan.max) {
    throw new Error("Amount out of plan limit");
  }

  const headers = await authHeaders();
  const r = await fetch("/api/mining/purchase", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ planId: plan.id, amountUSDT }),
  });

  const j = (await r.json().catch(() => ({}))) as PurchaseResp;
  if (!r.ok || !j?.ok || !j.order) {
    throw new Error(j?.error || "Purchase failed");
  }

  return mapOrder(j.order);
}

export async function abortMining(orderId: string) {
  const id = String(orderId || "").trim();
  if (!id) throw new Error("Order id is required");

  const headers = await authHeaders();
  const r = await fetch("/api/mining/abort", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ orderId: id }),
  });

  const j = (await r.json().catch(() => ({}))) as AbortResp;
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || "Abort failed");
  }

  return {
    refundUSDT: Number(j.refundUSDT ?? 0),
    balanceUSDT: Number(j.balanceUSDT ?? 0),
  };
}
