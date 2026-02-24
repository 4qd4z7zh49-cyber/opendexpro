import { NextResponse } from "next/server";
import { requireAdminSession, supabaseAdmin } from "../_helpers";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

function isAllowedRole(role: string) {
  return role === "admin" || role === "superadmin" || role === "sub-admin" || role === "subadmin";
}

type PasswordChangeResult = {
  ok?: boolean;
  message?: string;
};

function normalizeRpcResult(data: unknown): PasswordChangeResult | null {
  if (Array.isArray(data)) {
    return (data[0] as PasswordChangeResult | undefined) ?? null;
  }
  if (data && typeof data === "object") {
    return data as PasswordChangeResult;
  }
  return null;
}

export async function POST(req: Request) {
  const session = requireAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = session;
  if (!isAllowedRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required" },
      { status: 400 }
    );
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

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "newPassword must be different from currentPassword" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc("admin_change_password", {
    p_admin_id: adminId,
    p_old_password: currentPassword,
    p_new_password: newPassword,
  });

  if (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("could not find the function")) {
      return NextResponse.json(
        { error: "Missing RPC admin_change_password. Run sql/admin_password_management.sql first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const row = normalizeRpcResult(data);
  if (!row?.ok) {
    return NextResponse.json(
      { error: row?.message || "Failed to change admin password" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, message: row.message || "Password changed" });
}
