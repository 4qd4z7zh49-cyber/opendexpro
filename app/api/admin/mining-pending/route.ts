import { NextResponse } from "next/server";
import {
  isRootAdminRole,
  requireAdminSession,
  resolveRootManagedUserIds,
  supabaseAdmin,
} from "../_helpers";

export const dynamic = "force-dynamic";

type MiningPendingRow = {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  status: string;
  created_at: string;
  activated_at?: string | null;
  note?: string | null;
  username?: string | null;
  email?: string | null;
};

async function attachProfiles(rows: MiningPendingRow[]) {
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

  let query = supabaseAdmin
    .from("mining_orders")
    .select("id,user_id,plan_id,amount,status,created_at,activated_at,note")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (!isRootAdminRole(role)) {
    const { data: users, error: uErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("managed_by", adminId);

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    const ids = (users || []).map((x: { id: string }) => x.id);
    if (ids.length === 0) return NextResponse.json({ rows: [] });
    query = query.in("user_id", ids);
  } else {
    const ids = await resolveRootManagedUserIds(managedByRaw);
    if (Array.isArray(ids)) {
      if (ids.length === 0) return NextResponse.json({ rows: [] });
      query = query.in("user_id", ids);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await attachProfiles((data || []) as MiningPendingRow[]);
  return NextResponse.json({ rows });
}
