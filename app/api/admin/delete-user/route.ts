import { NextResponse } from "next/server";
import { assertCanManageUser, isRootAdminRole, requireAdminSession, supabaseAdmin } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteBody = {
  userId?: unknown;
};

type ErrorLike =
  | {
      message?: unknown;
      code?: unknown;
    }
  | null
  | undefined;

function parseBody(value: unknown): DeleteBody {
  if (!value || typeof value !== "object") return {};
  return value as DeleteBody;
}

function errorMessage(error: ErrorLike) {
  return String(error?.message || "").trim();
}

function isMissingRelationOrColumnError(error: ErrorLike) {
  const code = String(error?.code || "")
    .trim()
    .toUpperCase();
  if (code === "42P01" || code === "42703") return true;

  const message = errorMessage(error).toLowerCase();
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function isNotFoundError(error: ErrorLike) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("not found") || message.includes("no user");
}

async function cleanupByUserId(table: string, userId: string) {
  const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
  if (error && !isMissingRelationOrColumnError(error)) {
    throw new Error(error.message || `Failed to delete rows from ${table}`);
  }
}

async function cleanupById(table: string, userId: string) {
  const { error } = await supabaseAdmin.from(table).delete().eq("id", userId);
  if (error && !isMissingRelationOrColumnError(error)) {
    throw new Error(error.message || `Failed to delete rows from ${table}`);
  }
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;
  if (!isRootAdminRole(role)) {
    return NextResponse.json({ error: "Sub-admin cannot delete users" }, { status: 403 });
  }

  try {
    const body = parseBody(await req.json().catch(() => null));
    const userId = String(body.userId || "").trim();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const canManage = await assertCanManageUser(adminId, role, userId);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (adminErr && !isMissingRelationOrColumnError(adminErr)) {
      return NextResponse.json({ error: adminErr.message }, { status: 500 });
    }
    if (adminRow) {
      return NextResponse.json({ error: "Admin account cannot be deleted here" }, { status: 400 });
    }

    const [{ data: profileRow, error: profileErr }, { data: authData, error: authErr }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id,email").eq("id", userId).maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(userId),
      ]);

    if (profileErr && !isMissingRelationOrColumnError(profileErr)) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const authMissing = Boolean(authErr && isNotFoundError(authErr));
    if (authErr && !authMissing) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    if (!profileRow && authMissing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await cleanupByUserId("orders", userId);
    await cleanupByUserId("topups", userId);
    await cleanupByUserId("deposit_history", userId);
    await cleanupByUserId("withdraw_requests", userId);
    await cleanupByUserId("mining_orders", userId);
    await cleanupByUserId("user_notifications", userId);
    await cleanupByUserId("support_threads", userId);
    await cleanupByUserId("balances", userId);
    await cleanupByUserId("holdings", userId);
    await cleanupByUserId("trade_permissions", userId);
    await cleanupByUserId("user_access_controls", userId);
    await cleanupById("profiles", userId);

    if (!authMissing) {
      const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteAuthErr && !isNotFoundError(deleteAuthErr)) {
        return NextResponse.json({ error: deleteAuthErr.message }, { status: 500 });
      }
    }

    const email = String(authData?.user?.email || profileRow?.email || "")
      .trim()
      .toLowerCase();
    if (email) {
      const { error: limitErr } = await supabaseAdmin
        .from("password_reset_limits")
        .delete()
        .eq("email", email);
      if (limitErr && !isMissingRelationOrColumnError(limitErr)) {
        return NextResponse.json({ error: limitErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, userId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
