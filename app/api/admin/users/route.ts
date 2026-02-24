// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserAccessForUsers } from "@/lib/userAccessStore";

export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key);
}

export async function GET(req: Request) {
  let supabase: ReturnType<typeof getSupabaseAdminClient>;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase configuration missing";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const cookie = req.headers.get("cookie") || "";

  const getCookie = (name: string) => {
    const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  };

  const session = getCookie("admin_session");
  const role = getCookie("admin_role");
  const adminId = getCookie("admin_id");
  const url = new URL(req.url);
  const managedByRaw = String(url.searchParams.get("managedBy") || "").trim();

  if (!session || !role || !adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let q = supabase
    .from("profiles")
    .select("id, username, email, phone, created_at, managed_by")
    .order("created_at", { ascending: false });

  if (role === "sub-admin" || role === "subadmin") {
    q = q.eq("managed_by", adminId);
  } else {
    const managedByUpper = managedByRaw.toUpperCase();
    if (managedByUpper === "UNASSIGNED") {
      q = q.is("managed_by", null);
    } else if (managedByRaw && managedByUpper !== "ALL") {
      q = q.eq("managed_by", managedByRaw);
    }
  }

  const { data: profiles, error: pErr } = await q;
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) return NextResponse.json({ users: [] });

  const managerIds = Array.from(
    new Set(
      (profiles ?? [])
        .map((p) => (p.managed_by ? String(p.managed_by) : ""))
        .filter(Boolean)
    )
  );

  const managerMap = new Map<string, string | null>();
  if (managerIds.length > 0) {
    const { data: managers, error: mErr } = await supabase
      .from("admins")
      .select("id, username")
      .in("id", managerIds);

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    (managers ?? []).forEach((m) => {
      managerMap.set(String(m.id), m.username ?? null);
    });
  }

  // ✅ balances (USDT main balance)
  const { data: bals, error: bErr } = await supabase
    .from("balances")
    .select("user_id, balance")
    .in("user_id", ids);

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  const { data: holds, error: hErr } = await supabase
    .from("holdings")
    .select("user_id, asset, balance")
    .in("user_id", ids);

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

  const accessMap = await getUserAccessForUsers(supabase, ids);

  const balMap = new Map<string, number>();
  (bals ?? []).forEach((r) => balMap.set(r.user_id, Number(r.balance ?? 0)));

  const holdMap = new Map<string, { btc: number; eth: number; sol: number; xrp: number }>();
  (holds ?? []).forEach((r) => {
    const uid = String(r.user_id);
    const asset = String(r.asset || "").toUpperCase();
    const amount = Number(r.balance ?? 0);

    const row = holdMap.get(uid) ?? { btc: 0, eth: 0, sol: 0, xrp: 0 };
    if (asset === "BTC") row.btc = amount;
    if (asset === "ETH") row.eth = amount;
    if (asset === "SOL") row.sol = amount;
    if (asset === "XRP") row.xrp = amount;
    holdMap.set(uid, row);
  });

  const users = (profiles ?? []).map((p) => ({
    ...(holdMap.get(p.id) ?? { btc: 0, eth: 0, sol: 0, xrp: 0 }),
    id: p.id,
    username: p.username ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    created_at: p.created_at ?? null,
    managed_by: p.managed_by ?? null,
    managed_by_username: p.managed_by ? managerMap.get(String(p.managed_by)) ?? null : null,
    balance: balMap.get(p.id) ?? 0, // backward compatibility
    usdt: balMap.get(p.id) ?? 0,
    trade_restricted: Boolean(accessMap[p.id]?.tradeRestricted ?? false),
    mining_restricted: Boolean(accessMap[p.id]?.miningRestricted ?? false),
    restricted: Boolean(
      accessMap[p.id]?.tradeRestricted || accessMap[p.id]?.miningRestricted || false
    ),
  }));

  return NextResponse.json({ users });
}
