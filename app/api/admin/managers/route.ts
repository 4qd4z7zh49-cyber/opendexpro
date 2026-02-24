import { NextResponse } from "next/server";
import { isRootAdminRole, requireAdminSession, supabaseAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

type ManagerRow = {
  id: string;
  username: string | null;
  role: string | null;
};

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;

  try {
    let q = supabaseAdmin
      .from("admins")
      .select("id,username,role")
      .order("username", { ascending: true });

    if (!isRootAdminRole(role)) {
      q = q.eq("id", adminId);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const managers = (data || []).map((row: ManagerRow) => ({
      id: String(row.id),
      username: row.username ? String(row.username) : null,
      role: row.role ? String(row.role) : null,
    }));

    return NextResponse.json({ ok: true, managers });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load managers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
