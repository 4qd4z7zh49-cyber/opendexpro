import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  role: string | null;
  created_at: string | null;
  invitation_code: string | null;
};

type PasswordResetLimitRow = {
  last_reset_at: string | null;
};

type ProfilePatchBody = {
  username?: unknown;
  phone?: unknown;
  country?: unknown;
};

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
}

function createUserClient(cookieHeader: string) {
  return createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      global: {
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
      },
    }
  );
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

export async function GET(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error } = await svc
      .from("profiles")
      .select("id,username,email,phone,country,role,created_at,invitation_code")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: authUser, error: authErr } = await svc.auth.admin.getUserById(userId);
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    const row = (profile || null) as ProfileRow | null;
    const email = row?.email ?? authUser?.user?.email ?? null;

    let lastPasswordResetRequestAt: string | null = null;
    if (email) {
      const { data: limitRow, error: limitErr } = await svc
        .from("password_reset_limits")
        .select("last_reset_at")
        .eq("email", String(email).toLowerCase())
        .maybeSingle<PasswordResetLimitRow>();

      if (!limitErr) {
        lastPasswordResetRequestAt = limitRow?.last_reset_at ?? null;
      } else {
        const lower = String(limitErr.message || "").toLowerCase();
        if (!lower.includes("password_reset_limits")) {
          return NextResponse.json({ error: limitErr.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: userId,
        username: row?.username ?? null,
        email,
        phone: row?.phone ?? null,
        country: row?.country ?? null,
        role: row?.role ?? "user",
        created_at: row?.created_at ?? authUser?.user?.created_at ?? null,
        invitation_code: row?.invitation_code ?? null,
        last_sign_in_at: authUser?.user?.last_sign_in_at ?? null,
        last_password_reset_request_at: lastPasswordResetRequestAt,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeOptionalText(value: unknown, max = 80) {
  if (value === undefined) return undefined;
  const next = String(value ?? "").trim();
  if (!next) return null;
  return next.slice(0, max);
}

export async function PATCH(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: authUser, error: authErr } = await svc.auth.admin.getUserById(userId);
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }
    const authEmail = authUser?.user?.email ? String(authUser.user.email) : null;

    const body = (await req.json().catch(() => ({}))) as ProfilePatchBody;
    const username = normalizeOptionalText(body.username, 40);
    const phone = normalizeOptionalText(body.phone, 30);
    const countryRaw = normalizeOptionalText(body.country, 80);

    const updates: Record<string, string | null> = {};
    if (username !== undefined) updates.username = username;
    if (phone !== undefined) updates.phone = phone;
    if (countryRaw !== undefined) updates.country = countryRaw ? String(countryRaw).toUpperCase() : null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const { data: updatedRow, error: upErr } = await svc
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("id,username,email,phone,country,role,created_at,invitation_code")
      .maybeSingle<ProfileRow>();
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    let row = updatedRow || null;
    if (!row) {
      const upsertPayload: Record<string, string | null> = { id: userId };
      if (authEmail) upsertPayload.email = authEmail;
      if (username !== undefined) upsertPayload.username = username;
      if (phone !== undefined) upsertPayload.phone = phone;
      if (countryRaw !== undefined) upsertPayload.country = countryRaw ? String(countryRaw).toUpperCase() : null;

      const { data: inserted, error: insertErr } = await svc
        .from("profiles")
        .upsert(upsertPayload, { onConflict: "id" })
        .select("id,username,email,phone,country,role,created_at,invitation_code")
        .maybeSingle<ProfileRow>();
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      row = inserted || null;
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: userId,
        username: row?.username ?? null,
        email: row?.email ?? null,
        phone: row?.phone ?? null,
        country: row?.country ?? null,
        role: row?.role ?? "user",
        created_at: row?.created_at ?? null,
        invitation_code: row?.invitation_code ?? null,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
