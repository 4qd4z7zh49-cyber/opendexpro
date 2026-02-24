import { NextResponse } from "next/server";
import { isRootAdminRole, requireAdminSession, supabaseAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

type UserProfileRow = {
  id: string;
  username: string | null;
  email: string | null;
  managed_by: string | null;
  created_at: string | null;
};

type AdminRow = {
  id: string;
  username: string | null;
  role: string | null;
};

type UpdateBody = {
  userId?: string;
  managedBy?: string | null;
};

function parseBody(value: unknown): UpdateBody {
  if (!value || typeof value !== "object") return {};
  return value as UpdateBody;
}

function normalizeRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isSubadminRole(value: unknown) {
  const r = normalizeRole(value);
  return r === "sub-admin" || r === "subadmin";
}

function isSuperadminRole(value: unknown) {
  return normalizeRole(value) === "superadmin";
}

function isAssignableManagerRole(value: unknown) {
  return isSubadminRole(value) || isSuperadminRole(value);
}

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRootAdminRole(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [{ data: usersData, error: usersErr }, { data: adminsData, error: adminsErr }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id,username,email,managed_by,created_at")
          .order("created_at", { ascending: false })
          .limit(3000),
        supabaseAdmin
          .from("admins")
          .select("id,username,role")
          .order("username", { ascending: true }),
      ]);

    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
    if (adminsErr) return NextResponse.json({ error: adminsErr.message }, { status: 500 });

    const managers = ((adminsData || []) as AdminRow[])
      .filter((row) => isAssignableManagerRole(row.role))
      .map((row) => ({
        id: String(row.id),
        username: row.username ? String(row.username) : null,
        role: row.role ? String(row.role) : null,
      }));

    const managerMap = new Map<string, { username: string | null; role: string | null }>();
    managers.forEach((row) => {
      managerMap.set(row.id, { username: row.username ?? null, role: row.role ?? null });
    });

    const users = ((usersData || []) as UserProfileRow[]).map((row) => ({
      id: String(row.id),
      username: row.username ? String(row.username) : null,
      email: row.email ? String(row.email) : null,
      managedBy: row.managed_by ? String(row.managed_by) : null,
      managedByUsername: row.managed_by
        ? managerMap.get(String(row.managed_by))?.username ?? null
        : null,
      managedByRole: row.managed_by ? managerMap.get(String(row.managed_by))?.role ?? null : null,
      createdAt: row.created_at ? String(row.created_at) : null,
    }));

    return NextResponse.json({
      ok: true,
      users,
      managers,
      subadmins: managers.filter((row) => isSubadminRole(row.role)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load manage users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRootAdminRole(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = parseBody(await req.json().catch(() => null));
    const userId = String(body.userId || "").trim();
    const managedByRaw =
      typeof body.managedBy === "string" ? body.managedBy.trim() : body.managedBy ? String(body.managedBy) : "";
    const managedBy = managedByRaw || null;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data: existingUser, error: userErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
    if (!existingUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let managerUsername: string | null = null;
    let managerRole: string | null = null;
    if (managedBy) {
      const { data: managerRow, error: managerErr } = await supabaseAdmin
        .from("admins")
        .select("id,username,role")
        .eq("id", managedBy)
        .maybeSingle<AdminRow>();

      if (managerErr) return NextResponse.json({ error: managerErr.message }, { status: 500 });
      if (!managerRow || !isAssignableManagerRole(managerRow.role)) {
        return NextResponse.json(
          { error: "Target manager must be a sub-admin or superadmin" },
          { status: 400 }
        );
      }
      managerUsername = managerRow.username ? String(managerRow.username) : null;
      managerRole = managerRow.role ? String(managerRow.role) : null;
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ managed_by: managedBy })
      .eq("id", userId)
      .select("id,username,email,managed_by,created_at")
      .maybeSingle<UserProfileRow>();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 409 });

    return NextResponse.json({
      ok: true,
      user: {
        id: String(updated.id),
        username: updated.username ? String(updated.username) : null,
        email: updated.email ? String(updated.email) : null,
        managedBy: updated.managed_by ? String(updated.managed_by) : null,
        managedByUsername: managerUsername,
        managedByRole: managerRole,
        createdAt: updated.created_at ? String(updated.created_at) : null,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update user manager";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
