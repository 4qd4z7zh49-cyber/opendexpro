import { NextResponse } from "next/server";
import { MINING_PLANS } from "@/lib/miningMock";
import {
  isRootAdminRole,
  requireAdminSession,
  resolveRootManagedUserIds,
  supabaseAdmin,
} from "../_helpers";

export const dynamic = "force-dynamic";

type MiningHistoryRow = {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "ABORTED" | "COMPLETED";
  created_at: string;
  activated_at?: string | null;
  note?: string | null;
  username?: string | null;
  email?: string | null;
};

function toTs(v: string | null | undefined) {
  if (!v) return 0;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : 0;
}

function shouldBeCompleted(row: MiningHistoryRow, nowTs: number) {
  if (row.status !== "ACTIVE") return false;
  const plan = MINING_PLANS.find((p) => p.id === row.plan_id);
  if (!plan) return false;
  const startTs = toTs(row.activated_at) || toTs(row.created_at);
  if (!startTs) return false;
  const endTs = startTs + plan.cycleDays * 24 * 60 * 60 * 1000;
  return nowTs >= endTs;
}

async function attachProfiles(rows: MiningHistoryRow[]) {
  if (!rows.length) return rows;

  const ids = Array.from(new Set(rows.map((r) => String(r.user_id)).filter(Boolean)));
  if (!ids.length) return rows;

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id,username,email")
    .in("id", ids);

  if (error) return rows;

  const map = new Map<string, { username: string | null; email: string | null }>();
  (profiles || []).forEach((p: { id: string; username: string | null; email: string | null }) => {
    map.set(String(p.id), {
      username: p.username ?? null,
      email: p.email ?? null,
    });
  });

  return rows.map((r) => {
    const u = map.get(String(r.user_id));
    return {
      ...r,
      username: u?.username ?? null,
      email: u?.email ?? null,
    };
  });
}

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;
  const url = new URL(req.url);
  const managedByRaw = String(url.searchParams.get("managedBy") || "").trim();

  let visibleUserIds: string[] | null = null;
  if (!isRootAdminRole(role)) {
    const { data: users, error: uErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("managed_by", adminId);

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    const ids = (users || []).map((x: { id: string }) => x.id);
    if (ids.length === 0) return NextResponse.json({ rows: [] });
    visibleUserIds = ids;
  } else {
    visibleUserIds = await resolveRootManagedUserIds(managedByRaw);
    if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) {
      return NextResponse.json({ rows: [] });
    }
  }

  let query = supabaseAdmin
    .from("mining_orders")
    .select("id,user_id,plan_id,amount,status,created_at,activated_at,note")
    .neq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (visibleUserIds) {
    query = query.in("user_id", visibleUserIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as MiningHistoryRow[];
  const nowTs = Date.now();
  const completeIds = rows.filter((r) => shouldBeCompleted(r, nowTs)).map((r) => r.id);

  if (completeIds.length > 0) {
    let upQuery = supabaseAdmin
      .from("mining_orders")
      .update({ status: "COMPLETED" })
      .eq("status", "ACTIVE")
      .in("id", completeIds);

    if (visibleUserIds) {
      upQuery = upQuery.in("user_id", visibleUserIds);
    }

    const { error: upErr } = await upQuery;
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    let refetch = supabaseAdmin
      .from("mining_orders")
      .select("id,user_id,plan_id,amount,status,created_at,activated_at,note")
      .neq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (visibleUserIds) {
      refetch = refetch.in("user_id", visibleUserIds);
    }

    const { data: fresh, error: freshErr } = await refetch;
    if (freshErr) return NextResponse.json({ error: freshErr.message }, { status: 500 });

    const enriched = await attachProfiles((fresh || []) as MiningHistoryRow[]);
    return NextResponse.json({ rows: enriched });
  }

  const enriched = await attachProfiles(rows);
  return NextResponse.json({ rows: enriched });
}
