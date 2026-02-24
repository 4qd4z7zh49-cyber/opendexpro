import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function normalizeInvitationCode(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

function isSubAdminRole(role: unknown) {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  return r === "sub-admin" || r === "subadmin";
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { invitationCode } = await req.json();
    const code = normalizeInvitationCode(invitationCode);

    if (!code) {
      return NextResponse.json({ error: "Invitation code required" }, { status: 400 });
    }

    // 1) Case-insensitive exact check
    const { data: exactData, error: exactErr } = await supabase
      .from("admins")
      .select("id, role, invitation_code")
      .ilike("invitation_code", code)
      .single();

    let row = exactData;

    // 2) Fallback: ignore spaces / hyphens in stored code
    if (exactErr || !row) {
      const { data: rows, error: rowsErr } = await supabase
        .from("admins")
        .select("id, role, invitation_code")
        .not("invitation_code", "is", null)
        .limit(3000);

      if (!rowsErr && Array.isArray(rows)) {
        row =
          rows.find(
            (r) => normalizeInvitationCode(r.invitation_code) === code
          ) ?? null;
      }
    }

    if (!row) {
      return NextResponse.json({ error: "Invalid invitation code" }, { status: 400 });
    }

    if (!isSubAdminRole(row.role)) {
      return NextResponse.json({ error: "Invitation code is not for sub-admin" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      subAdminId: row.id,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
