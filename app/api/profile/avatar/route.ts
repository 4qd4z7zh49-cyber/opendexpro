import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATAR_BUCKET = "profile-avatars";
const AVATAR_SIZE_LIMIT_BYTES = 5 * 1024 * 1024;

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
}

function createUserClient(cookieHeader: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    },
  });
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function resolveUserId(req: Request, svc: SupabaseClient) {
  const bearer = getBearerToken(req);
  if (bearer) {
    const { data, error } = await svc.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  const cookieHeader = req.headers.get("cookie") || "";
  const userClient = createUserClient(cookieHeader);
  const { data, error } = await userClient.auth.getUser();
  if (!error && data?.user?.id) return data.user.id;

  return "";
}

async function ensureAvatarBucket(svc: SupabaseClient) {
  const { data: buckets, error: listErr } = await svc.storage.listBuckets();
  if (listErr) throw listErr;
  const exists = (buckets || []).some((bucket) => bucket.name === AVATAR_BUCKET || bucket.id === AVATAR_BUCKET);
  if (!exists) {
    const { error: createErr } = await svc.storage.createBucket(AVATAR_BUCKET, {
      public: true,
      fileSizeLimit: AVATAR_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ["image/jpeg"],
    });
    if (createErr && !String(createErr.message || "").toLowerCase().includes("already")) {
      throw createErr;
    }
  }
}

function parseAvatarDataUrl(imageDataUrl: unknown) {
  const raw = String(imageDataUrl || "").trim();
  const match = raw.match(/^data:(image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Avatar image format is invalid.");
  }
  const base64 = match[2] || "";
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.byteLength) {
    throw new Error("Avatar image is empty.");
  }
  if (buffer.byteLength > AVATAR_SIZE_LIMIT_BYTES) {
    throw new Error("Avatar image is too large.");
  }
  return buffer;
}

function avatarPathForUser(userId: string) {
  return `${userId}/avatar.jpg`;
}

function publicAvatarUrl(svc: SupabaseClient, path: string) {
  const { data } = svc.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { imageDataUrl?: unknown };
    const imageBuffer = parseAvatarDataUrl(body.imageDataUrl);

    await ensureAvatarBucket(svc);
    const storagePath = avatarPathForUser(userId);
    const { error: uploadErr } = await svc.storage.from(AVATAR_BUCKET).upload(storagePath, imageBuffer, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });
    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      publicUrl: publicAvatarUrl(svc, storagePath),
      storagePath,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to upload avatar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storagePath = avatarPathForUser(userId);
    const { error } = await svc.storage.from(AVATAR_BUCKET).remove([storagePath]);
    if (error) {
      const message = String(error.message || "");
      if (!message.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to remove avatar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
