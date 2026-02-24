import { NextResponse } from "next/server";
import { requireAdminSession, supabaseAdmin, assertCanManageUser } from "../_helpers";
import {
  getPermissionsForUsers,
  setPermissionForUser,
  type TradePermissionMode,
} from "@/lib/tradePermissionStore";

type UpdateBody = {
  userId?: string;
  permissionMode?: TradePermissionMode;
};

function parseBody(v: unknown): UpdateBody {
  if (!v || typeof v !== "object") return {};
  return v as UpdateBody;
}

export const dynamic = "force-dynamic";

const ALLOWED_MODES: readonly TradePermissionMode[] = [
  "BUY_ALL_WIN",
  "SELL_ALL_WIN",
  "RANDOM_WIN_LOSS",
  "ALL_LOSS",
];

function normalizeMode(v: unknown): TradePermissionMode | "" {
  const raw = String(v || "").trim().toUpperCase();
  if ((ALLOWED_MODES as readonly string[]).includes(raw)) {
    return raw as TradePermissionMode;
  }
  return "";
}

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;

  try {
    const url = new URL(req.url);
    const managedByRaw = String(url.searchParams.get("managedBy") || "").trim();

    let q = supabaseAdmin
      .from("profiles")
      .select("id, username, email, managed_by")
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

    const ids = (profiles ?? []).map((p) => String(p.id));
    const permissionMap = await getPermissionsForUsers(supabaseAdmin, ids);

    const users = (profiles ?? []).map((p) => {
      const uid = String(p.id);
      const perm = permissionMap[uid] ?? {
        permissionMode: "ALL_LOSS" as const,
        buyEnabled: false,
        sellEnabled: false,
        source: "default" as const,
      };

      return {
        id: uid,
        username: p.username ?? null,
        email: p.email ?? null,
        permissionMode: perm.permissionMode,
        buyEnabled: perm.buyEnabled,
        sellEnabled: perm.sellEnabled,
        source: perm.source,
      };
    });

    return NextResponse.json({ users });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;

  try {
    const body = parseBody(await req.json().catch(() => null));
    const userId = String(body.userId || "").trim();
    const permissionMode = normalizeMode(body.permissionMode);

    if (!userId || !permissionMode) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const ok = await assertCanManageUser(adminId, role, userId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const permission = await setPermissionForUser(supabaseAdmin, userId, {
      permissionMode,
    });

    return NextResponse.json({
      ok: true,
      userId,
      permissionMode: permission.permissionMode,
      buyEnabled: permission.buyEnabled,
      sellEnabled: permission.sellEnabled,
      source: permission.source,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
