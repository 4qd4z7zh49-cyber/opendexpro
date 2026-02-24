import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function isAdminRole(role: string | null) {
  return role === "admin" || role === "superadmin";
}

export async function GET(req: Request) {
  let supabase: ReturnType<typeof getSupabaseAdminClient>;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase configuration missing";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const session = getCookie(req, "admin_session");
  const role = getCookie(req, "admin_role");

  if (!session || !isAdminRole(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("admins")
    .select("id, username, role, invitation_code, managed_by, created_at")
    .eq("role", "sub-admin")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subadmins: data ?? [] });
}

export async function POST(req: Request) {
  let supabase: ReturnType<typeof getSupabaseAdminClient>;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase configuration missing";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const session = getCookie(req, "admin_session");
  const role = getCookie(req, "admin_role");
  const adminId = getCookie(req, "admin_id"); // admins.id

  if (!session || !isAdminRole(role) || !adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return NextResponse.json({ error: "username/password required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_create_subadmin", {
    p_username: username,
    p_password: password,
    p_managed_by: adminId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({ ok: true, subadmin: row });
}
