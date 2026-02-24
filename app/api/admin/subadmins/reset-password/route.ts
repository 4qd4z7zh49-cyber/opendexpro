import { NextResponse } from "next/server";
import { isSuperadminRole, requireAdminSession, supabaseAdmin } from "../../_helpers";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

type ResetResult = {
  ok?: boolean;
  message?: string;
};

function normalizeRpcResult(data: unknown): ResetResult | null {
  if (Array.isArray(data)) {
    return (data[0] as ResetResult | undefined) ?? null;
  }
  if (data && typeof data === "object") {
    return data as ResetResult;
  }
  return null;
}

export async function POST(req: Request) {
  const session = requireAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = session;
  if (!isSuperadminRole(role)) {
    return NextResponse.json({ error: "Only superadmin can reset sub-admin passwords" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const subadminId = String(body?.subadminId || body?.adminId || "").trim();
  const newPassword = String(body?.newPassword || "");

  if (!subadminId || !newPassword) {
    return NextResponse.json({ error: "subadminId and newPassword are required" }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `newPassword must be at most ${MAX_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc("admin_reset_subadmin_password", {
    p_actor_admin_id: adminId,
    p_subadmin_id: subadminId,
    p_new_password: newPassword,
  });

  if (error) {
    const message = String(error.message || "");
    if (message.toLowerCase().includes("could not find the function")) {
      return NextResponse.json(
        { error: "Missing RPC admin_reset_subadmin_password. Run sql/admin_password_management.sql first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const row = normalizeRpcResult(data);
  if (!row?.ok) {
    return NextResponse.json({ error: row?.message || "Failed to reset sub-admin password" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: row.message || "Sub-admin password reset" });
}
