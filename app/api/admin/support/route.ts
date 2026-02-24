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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ThreadStatus = "OPEN" | "CLOSED";
type SenderRole = "USER" | "ADMIN";

type ThreadRow = {
  id: string;
  user_id: string;
  admin_id: string | null;
  status: string | null;
  last_sender: string | null;
  last_message_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_role: string | null;
  sender_user_id: string | null;
  sender_admin_id: string | null;
  message: string | null;
  message_type: string | null;
  image_url: string | null;
  created_at: string | null;
};

type Body = {
  threadId?: string;
  userId?: string;
  message?: string;
  imageDataUrl?: string;
};

function parseBody(value: unknown): Body {
  if (!value || typeof value !== "object") return {};
  return value as Body;
}

function normalizeStatus(value: unknown): ThreadStatus {
  return String(value || "").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN";
}

function normalizeSender(value: unknown): SenderRole {
  return String(value || "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
}

function resolveAppBaseUrl(req: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function resolveSupportAuth(req: Request) {
  const strict = requireAdminSession(req);
  if (strict) return strict;

  const session = readCookie(req, "admin_session");
  const role = String(readCookie(req, "admin_role") || "");
  const adminId = String(readCookie(req, "admin_id") || "");
  if (!session || !role) return null;

  if (isRootAdminRole(role)) {
    return { role, adminId };
  }
  return null;
}

async function managedUserIds(adminId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("managed_by", adminId)
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.id)).filter(Boolean);
}

async function pendingCount(role: string, adminId: string, userIds?: string[] | null) {
  let visibleUserIds = userIds ?? null;

  if (!isRootAdminRole(role) && !Array.isArray(visibleUserIds)) {
    visibleUserIds = await managedUserIds(adminId);
  }
  if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) return 0;

  let q = supabaseAdmin
    .from("support_threads")
    .select("id", { count: "exact", head: true })
    .eq("status", "OPEN")
    .eq("last_sender", "USER");

  if (Array.isArray(visibleUserIds)) {
    q = q.in("user_id", visibleUserIds);
  }

  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

function mapMessage(row: MessageRow) {
  return {
    id: String(row.id || ""),
    threadId: String(row.thread_id || ""),
    senderRole: normalizeSender(row.sender_role),
    senderUserId: row.sender_user_id ? String(row.sender_user_id) : null,
    senderAdminId: row.sender_admin_id ? String(row.sender_admin_id) : null,
    message: String(row.message || ""),
    messageType: String(row.message_type || "TEXT").toUpperCase() === "IMAGE" ? "IMAGE" : "TEXT",
    imageUrl: row.image_url ? String(row.image_url) : null,
    createdAt: String(row.created_at || ""),
  };
}

async function readThreadById(threadId: string) {
  const { data, error } = await supabaseAdmin
    .from("support_threads")
    .select("id,user_id,admin_id,status,last_sender,last_message_at,created_at,updated_at")
    .eq("id", threadId)
    .maybeSingle<ThreadRow>();
  if (error) throw new Error(error.message);
  return data || null;
}

async function readThreadByUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("support_threads")
    .select("id,user_id,admin_id,status,last_sender,last_message_at,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle<ThreadRow>();
  if (error) throw new Error(error.message);
  return data || null;
}

async function canManageThread(role: string, adminId: string, thread: ThreadRow) {
  if (isRootAdminRole(role)) return true;
  if (!adminId) return false;
  return assertCanManageUser(adminId, role, String(thread.user_id || ""));
}

export async function GET(req: Request) {
  const auth = resolveSupportAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;

  try {
    const url = new URL(req.url);
    const mode = String(url.searchParams.get("mode") || "").toLowerCase();
    const managedByRaw = String(url.searchParams.get("managedBy") || "").trim();
    let managedIds: string[] | null = null;

    if (isRootAdminRole(role)) {
      managedIds = await resolveRootManagedUserIds(managedByRaw);
    } else {
      managedIds = await managedUserIds(adminId);
    }

    if (mode === "badge") {
      return NextResponse.json({
        ok: true,
        pendingCount: await pendingCount(role, adminId, managedIds),
      });
    }

    const threadId = String(url.searchParams.get("threadId") || "").trim();
    const userId = String(url.searchParams.get("userId") || "").trim();
    const statusFilter = String(url.searchParams.get("status") || "").trim().toUpperCase();
    const limitRaw = Number(url.searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

    if (Array.isArray(managedIds) && managedIds.length === 0) {
      return NextResponse.json({
        ok: true,
        pendingCount: 0,
        threads: [],
        activeThreadId: null,
        messages: [],
      });
    }
    if (userId && Array.isArray(managedIds) && !managedIds.includes(userId)) {
      if (!isRootAdminRole(role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({
        ok: true,
        pendingCount: await pendingCount(role, adminId, managedIds),
        threads: [],
        activeThreadId: null,
        messages: [],
      });
    }

    let q = supabaseAdmin
      .from("support_threads")
      .select("id,user_id,admin_id,status,last_sender,last_message_at,created_at,updated_at")
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (Array.isArray(managedIds)) {
      q = q.in("user_id", managedIds);
    }
    if (userId) {
      q = q.eq("user_id", userId);
    }
    if (statusFilter === "OPEN" || statusFilter === "CLOSED") {
      q = q.eq("status", statusFilter);
    }

    const { data: threadRows, error: threadErr } = await q;
    if (threadErr) {
      return NextResponse.json({ error: threadErr.message }, { status: 500 });
    }

    const threads = (threadRows || []) as ThreadRow[];

    const userIds = Array.from(new Set(threads.map((row) => String(row.user_id || "")).filter(Boolean)));
    const adminIds = Array.from(new Set(threads.map((row) => String(row.admin_id || "")).filter(Boolean)));

    const profileMap = new Map<string, { username: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id,username,email")
        .in("id", userIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      (data || []).forEach((row) => {
        profileMap.set(String(row.id), {
          username: row.username ? String(row.username) : null,
          email: row.email ? String(row.email) : null,
        });
      });
    }

    const adminMap = new Map<string, { username: string | null }>();
    if (adminIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("admins")
        .select("id,username")
        .in("id", adminIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      (data || []).forEach((row) => {
        adminMap.set(String(row.id), {
          username: row.username ? String(row.username) : null,
        });
      });
    }

    let selected =
      (threadId ? threads.find((row) => String(row.id) === threadId) : null) ||
      threads[0] ||
      null;

    let messages: MessageRow[] = [];
    if (selected) {
      if (!(await canManageThread(role, adminId, selected))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // When admin/sub-admin opens a chat that has unread user messages,
      // mark that thread as read for admin side (badge should disappear).
      if (normalizeStatus(selected.status) === "OPEN" && normalizeSender(selected.last_sender) === "USER") {
        const now = new Date().toISOString();
        const { error: seenErr } = await supabaseAdmin
          .from("support_threads")
          .update({
            last_sender: "ADMIN",
            updated_at: now,
          })
          .eq("id", selected.id)
          .eq("status", "OPEN")
          .eq("last_sender", "USER");

        if (!seenErr) {
          selected = {
            ...selected,
            last_sender: "ADMIN",
            updated_at: now,
          };
          const idx = threads.findIndex((row) => row.id === selected?.id);
          if (idx >= 0) {
            threads[idx] = {
              ...threads[idx],
              last_sender: "ADMIN",
              updated_at: now,
            };
          }
        }
      }

      const { data, error } = await supabaseAdmin
        .from("support_messages")
        .select(
          "id,thread_id,sender_role,sender_user_id,sender_admin_id,message,message_type,image_url,created_at"
        )
        .eq("thread_id", selected.id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      messages = (data || []) as MessageRow[];
    }

    return NextResponse.json({
      ok: true,
      pendingCount: await pendingCount(role, adminId, managedIds),
      activeThreadId: selected ? String(selected.id) : null,
      threads: threads.map((row) => {
        const uid = String(row.user_id || "");
        const aid = row.admin_id ? String(row.admin_id) : null;
        return {
          id: String(row.id || ""),
          userId: uid,
          adminId: aid,
          username: profileMap.get(uid)?.username ?? null,
          email: profileMap.get(uid)?.email ?? null,
          adminUsername: aid ? adminMap.get(aid)?.username ?? null : null,
          status: normalizeStatus(row.status),
          lastSender: normalizeSender(row.last_sender),
          lastMessageAt: String(row.last_message_at || ""),
          createdAt: String(row.created_at || ""),
          needsReply: normalizeStatus(row.status) === "OPEN" && normalizeSender(row.last_sender) === "USER",
        };
      }),
      messages: messages.map((row) => mapMessage(row)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load support chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = resolveSupportAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;

  try {
    const body = parseBody(await req.json().catch(() => null));
    const threadId = String(body.threadId || "").trim();
    const userId = String(body.userId || "").trim();
    const message = String(body.message || "").trim();
    const imageDataUrl = String(body.imageDataUrl || "").trim();

    if (!message && !imageDataUrl) {
      return NextResponse.json({ error: "Message or image is required" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "Message is too long (max 4000)" }, { status: 400 });
    }
    if (imageDataUrl) {
      if (!imageDataUrl.startsWith("data:image/")) {
        return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
      }
      if (imageDataUrl.length > 5_000_000) {
        return NextResponse.json({ error: "Image is too large" }, { status: 400 });
      }
    }
    if (!threadId && !userId) {
      return NextResponse.json({ error: "threadId or userId is required" }, { status: 400 });
    }

    let thread = threadId ? await readThreadById(threadId) : null;

    if (!thread && userId) {
      if (!isRootAdminRole(role)) {
        const can = await assertCanManageUser(adminId, role, userId);
        if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("support_threads")
        .insert({
          user_id: userId,
          admin_id: adminId || null,
          status: "OPEN",
          last_sender: "ADMIN",
          last_message_at: now,
          updated_at: now,
        })
        .select("id,user_id,admin_id,status,last_sender,last_message_at,created_at,updated_at")
        .maybeSingle<ThreadRow>();

      if (!error && data) {
        thread = data;
      } else if (String(error?.message || "").toLowerCase().includes("duplicate key")) {
        thread = await readThreadByUser(userId);
      } else {
        return NextResponse.json(
          { error: error?.message || "Failed to create support thread" },
          { status: 500 }
        );
      }
    }

    if (!thread) {
      return NextResponse.json({ error: "Support thread not found" }, { status: 404 });
    }

    const canManage = await canManageThread(role, adminId, thread);
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: msg, error: msgErr } = await supabaseAdmin
      .from("support_messages")
      .insert({
        thread_id: thread.id,
        sender_role: "ADMIN",
        sender_user_id: null,
        sender_admin_id: adminId || null,
        message: message || "",
        message_type: imageDataUrl ? "IMAGE" : "TEXT",
        image_url: imageDataUrl || null,
      })
      .select(
        "id,thread_id,sender_role,sender_user_id,sender_admin_id,message,message_type,image_url,created_at"
      )
      .maybeSingle<MessageRow>();
    if (msgErr || !msg) {
      return NextResponse.json({ error: msgErr?.message || "Failed to send message" }, { status: 500 });
    }

    const now = new Date().toISOString();
    const nextAdminId = thread.admin_id || adminId || null;
    const { error: updateErr } = await supabaseAdmin
      .from("support_threads")
      .update({
        admin_id: nextAdminId,
        status: "OPEN",
        last_sender: "ADMIN",
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", thread.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    try {
      const appBase = resolveAppBaseUrl(req);
      const previewText = message || "You have a new support reply.";
      await sendOneSignalPush({
        externalUserIds: [String(thread.user_id)],
        title: "OpenBookPro Support",
        message: previewText,
        url: `${appBase}/support`,
        data: {
          source: "SUPPORT",
          threadId: String(thread.id),
          messageId: String(msg.id),
        },
      });
    } catch (pushError) {
      console.error("support push send error:", pushError);
    }

    return NextResponse.json({
      ok: true,
      message: mapMessage(msg),
      thread: {
        id: String(thread.id),
        userId: String(thread.user_id),
        adminId: nextAdminId,
        status: "OPEN",
        lastSender: "ADMIN",
        lastMessageAt: now,
      },
      pendingCount: await pendingCount(role, adminId),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send support message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
