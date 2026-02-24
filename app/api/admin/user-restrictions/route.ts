import { NextResponse } from "next/server";
import { assertCanManageUser, isRootAdminRole, requireAdminSession, supabaseAdmin } from "../_helpers";
import { setUserAccessForUser } from "@/lib/userAccessStore";

type UpdateBody = {
  userId?: string;
  restricted?: boolean;
};

function parseBody(v: unknown): UpdateBody {
  if (!v || typeof v !== "object") return {};
  return v as UpdateBody;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adminId, role } = auth;
  if (!isRootAdminRole(role)) {
    return NextResponse.json({ error: "Sub-admin cannot restrict users" }, { status: 403 });
  }

  try {
    const body = parseBody(await req.json().catch(() => null));
    const userId = String(body.userId || "").trim();
    const restricted = body.restricted;

    if (!userId) {
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }
    if (typeof restricted !== "boolean") {
      return NextResponse.json({ error: "restricted must be boolean" }, { status: 400 });
    }

    const canManage = await assertCanManageUser(adminId, role, userId);
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const access = await setUserAccessForUser(supabaseAdmin, userId, {
      tradeRestricted: restricted,
      miningRestricted: restricted,
    });

    return NextResponse.json({
      ok: true,
      userId,
      restricted: Boolean(access.tradeRestricted || access.miningRestricted),
      tradeRestricted: access.tradeRestricted,
      miningRestricted: access.miningRestricted,
      source: access.source,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
