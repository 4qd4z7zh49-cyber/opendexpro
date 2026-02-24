import { NextResponse } from "next/server";
import {
  assertCanManageUser,
  isRootAdminRole,
  readCookie,
  requireAdminSession,
  resolveRootManagedUserIds,
  supabaseAdmin,
} from "../_helpers";
import { sendOneSignalPush } from "@/lib/onesignalServer";

export const dynamic = "force-dynamic";

type NotifyStatus = "PENDING" | "CONFIRMED";

type Body = {
  userId?: string;
  subject?: string;
  message?: string;
};

type PendingUserRow = {
  user_id: string | null;
};

function parseBody(value: unknown): Body {
  if (!value || typeof value !== "object") return {};
  return value as Body;
}

function resolveNotifyAuth(req: Request) {
  const strict = requireAdminSession(req);
  if (strict) return strict;

  const session = readCookie(req, "admin_session");
  const role = String(readCookie(req, "admin_role") || "");
  const adminId = String(readCookie(req, "admin_id") || "");
  if (!session || !role) return null;

  // Fallback: allow root admin access even when admin_id cookie is missing.
  if (isRootAdminRole(role)) {
    return { role, adminId };
  }
  return null;
}

function normalizeStatus(value: unknown): NotifyStatus {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === "CONFIRMED" || s === "READ") return "CONFIRMED";
  return "PENDING";
}

function resolveAppBaseUrl(req: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function pendingCount(role: string, adminId: string, visibleUserIds?: string[] | null) {
  if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) return 0;

  let q = supabaseAdmin
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  if (Array.isArray(visibleUserIds)) {
    q = q.in("user_id", visibleUserIds);
  } else if (!isRootAdminRole(role)) {
    q = q.eq("admin_id", adminId);
  }

  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

async function pendingCountByUser(role: string, adminId: string, visibleUserIds?: string[] | null) {
  if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) return {} as Record<string, number>;

  let q = supabaseAdmin
    .from("user_notifications")
    .select("user_id")
    .eq("status", "PENDING")
    .limit(10000);

  if (Array.isArray(visibleUserIds)) {
    q = q.in("user_id", visibleUserIds);
  } else if (!isRootAdminRole(role)) {
    q = q.eq("admin_id", adminId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const next: Record<string, number> = {};
  ((data || []) as PendingUserRow[]).forEach((row) => {
    const userId = String(row.user_id || "").trim();
    if (!userId) return;
    next[userId] = Number(next[userId] || 0) + 1;
  });

  return next;
}

export async function GET(req: Request) {
  const auth = resolveNotifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;

  try {
    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    const managedByRaw = String(url.searchParams.get("managedBy") || "").trim();
    const statusRaw = String(url.searchParams.get("status") || "").trim().toUpperCase();
    const limitRaw = Number(url.searchParams.get("limit") || 300);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 300;
    const visibleUserIds = isRootAdminRole(role)
      ? await resolveRootManagedUserIds(managedByRaw)
      : null;

    if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) {
      return NextResponse.json({ ok: true, pendingCount: 0, notifications: [] });
    }
    if (userId && Array.isArray(visibleUserIds) && !visibleUserIds.includes(userId)) {
      return NextResponse.json({ ok: true, pendingCount: 0, notifications: [] });
    }

    if (userId) {
      const canManage = await assertCanManageUser(adminId, role, userId);
      if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let q = supabaseAdmin
      .from("user_notifications")
      .select("id,user_id,admin_id,subject,message,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!isRootAdminRole(role)) {
      q = q.eq("admin_id", adminId);
    } else if (Array.isArray(visibleUserIds)) {
      q = q.in("user_id", visibleUserIds);
    }
    if (userId) {
      q = q.eq("user_id", userId);
    }
    if (statusRaw && statusRaw !== "ALL") {
      q = q.eq("status", normalizeStatus(statusRaw));
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const userIds = Array.from(new Set(rows.map((r) => String(r.user_id)).filter(Boolean)));
    const profileMap = new Map<string, { username: string | null; email: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id,username,email")
        .in("id", userIds);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

      (profiles || []).forEach((p) => {
        profileMap.set(String(p.id), {
          username: p.username ? String(p.username) : null,
          email: p.email ? String(p.email) : null,
        });
      });
    }

    const unreadByUserId = await pendingCountByUser(role, adminId, visibleUserIds);
    const pending = Object.values(unreadByUserId).reduce((sum, n) => sum + Number(n || 0), 0);

    return NextResponse.json({
      ok: true,
      pendingCount: pending,
      unreadByUserId,
      notifications: rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        adminId: r.admin_id ? String(r.admin_id) : null,
        subject: String(r.subject || ""),
        message: String(r.message || ""),
        status: normalizeStatus(r.status),
        createdAt: String(r.created_at || ""),
        updatedAt: String(r.updated_at || r.created_at || ""),
        username: profileMap.get(String(r.user_id))?.username ?? null,
        email: profileMap.get(String(r.user_id))?.email ?? null,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = resolveNotifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;

  try {
    const body = parseBody(await req.json().catch(() => null));
    const userId = String(body.userId || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (subject.length > 180) {
      return NextResponse.json({ error: "Subject is too long (max 180)" }, { status: 400 });
    }
    if (message.length > 10_000) {
      return NextResponse.json({ error: "Message is too long (max 10000)" }, { status: 400 });
    }

    const canManage = await assertCanManageUser(adminId, role, userId);
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .insert({
        user_id: userId,
        admin_id: adminId || null,
        subject,
        message,
        status: "PENDING",
      })
      .select("id,user_id,admin_id,subject,message,status,created_at,updated_at")
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to send notification" }, { status: 500 });
    }

    let username: string | null = null;
    let email: string | null = null;
    const { data: profileRow, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id,username,email")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
    if (profileRow) {
      username = profileRow.username ? String(profileRow.username) : null;
      email = profileRow.email ? String(profileRow.email) : null;
    }

    try {
      const appBase = resolveAppBaseUrl(req);
      await sendOneSignalPush({
        externalUserIds: [userId],
        title: subject || "OpenBookPro Notification",
        message: message || "You have a new notification.",
        url: `${appBase}/home`,
        data: {
          source: "NOTIFY",
          notificationId: String(data.id),
        },
      });
    } catch (pushError) {
      console.error("notify push send error:", pushError);
    }

    return NextResponse.json({
      ok: true,
      notification: {
        id: String(data.id),
        userId: String(data.user_id),
        adminId: data.admin_id ? String(data.admin_id) : null,
        username,
        email,
        subject: String(data.subject || ""),
        message: String(data.message || ""),
        status: normalizeStatus(data.status),
        createdAt: String(data.created_at || ""),
        updatedAt: String(data.updated_at || data.created_at || ""),
      },
      pendingCount: await pendingCount(role, adminId),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
