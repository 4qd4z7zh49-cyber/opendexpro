import { NextResponse } from "next/server";
import {
  createServiceClient,
  resolveAddressOwnerAdmin,
  resolveUserId,
} from "../deposit/_helpers";

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

type SupportBody = {
  message?: string;
  imageDataUrl?: string;
};

function normalizeThreadStatus(value: unknown): ThreadStatus {
  return String(value || "").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN";
}

function normalizeSender(value: unknown): SenderRole {
  return String(value || "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
}

function parseBody(value: unknown): SupportBody {
  if (!value || typeof value !== "object") return {};
  return value as SupportBody;
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

async function readThreadByUser(userId: string) {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("support_threads")
    .select("id,user_id,admin_id,status,last_sender,last_message_at,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle<ThreadRow>();
  if (error) throw new Error(error.message);
  return data || null;
}

async function ensureThread(userId: string) {
  const existing = await readThreadByUser(userId);
  if (existing) return existing;

  const svc = createServiceClient();
  const owner = await resolveAddressOwnerAdmin(svc, userId);
  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("support_threads")
    .insert({
      user_id: userId,
      admin_id: owner?.id || null,
      status: "OPEN",
      last_sender: "USER",
      last_message_at: now,
      updated_at: now,
    })
    .select("id,user_id,admin_id,status,last_sender,last_message_at,created_at,updated_at")
    .maybeSingle<ThreadRow>();

  if (!error && data) return data;

  // Unique user_id race safety.
  if (String(error?.message || "").toLowerCase().includes("duplicate key")) {
    const raced = await readThreadByUser(userId);
    if (raced) return raced;
  }

  throw new Error(error?.message || "Failed to create support thread");
}

async function readAdminName(adminId: string | null) {
  if (!adminId) return null;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("admins")
    .select("username")
    .eq("id", adminId)
    .maybeSingle<{ username: string | null }>();
  if (error) throw new Error(error.message);
  return data?.username ? String(data.username) : null;
}

export async function GET(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let thread = await ensureThread(userId);

    // Mark latest admin reply as seen when user opens support page.
    if (normalizeThreadStatus(thread.status) === "OPEN" && normalizeSender(thread.last_sender) === "ADMIN") {
      const now = new Date().toISOString();
      const { error: seenErr } = await svc
        .from("support_threads")
        .update({
          last_sender: "USER",
          updated_at: now,
        })
        .eq("id", thread.id)
        .eq("user_id", userId);
      if (!seenErr) {
        thread = {
          ...thread,
          last_sender: "USER",
          updated_at: now,
        };
      }
    }

    const { data: rows, error } = await svc
      .from("support_messages")
      .select(
        "id,thread_id,sender_role,sender_user_id,sender_admin_id,message,message_type,image_url,created_at"
      )
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(400);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const adminName = await readAdminName(thread.admin_id);

    return NextResponse.json({
      ok: true,
      pollMs: 3000,
      thread: {
        id: String(thread.id),
        userId: String(thread.user_id),
        adminId: thread.admin_id ? String(thread.admin_id) : null,
        adminName,
        status: normalizeThreadStatus(thread.status),
        lastSender: normalizeSender(thread.last_sender),
        lastMessageAt: String(thread.last_message_at || ""),
        createdAt: String(thread.created_at || ""),
      },
      messages: (rows || []).map((row) => mapMessage(row as MessageRow)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load support chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = parseBody(await req.json().catch(() => null));
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

    const thread = await ensureThread(userId);
    const now = new Date().toISOString();
    const messageType = imageDataUrl ? "IMAGE" : "TEXT";

    const { data, error } = await svc
      .from("support_messages")
      .insert({
        thread_id: thread.id,
        sender_role: "USER",
        sender_user_id: userId,
        sender_admin_id: null,
        message: message || "",
        message_type: messageType,
        image_url: imageDataUrl || null,
      })
      .select(
        "id,thread_id,sender_role,sender_user_id,sender_admin_id,message,message_type,image_url,created_at"
      )
      .maybeSingle<MessageRow>();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to send support message" },
        { status: 500 }
      );
    }

    // Ensure owner assignment when thread was created without admin owner.
    let nextAdminId = thread.admin_id;
    if (!nextAdminId) {
      const owner = await resolveAddressOwnerAdmin(svc, userId);
      nextAdminId = owner?.id || null;
    }

    const { error: updateErr } = await svc
      .from("support_threads")
      .update({
        admin_id: nextAdminId,
        status: "OPEN",
        last_sender: "USER",
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", thread.id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: mapMessage(data),
      thread: {
        id: String(thread.id),
        adminId: nextAdminId,
        status: "OPEN",
        lastSender: "USER",
        lastMessageAt: now,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send support message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
