import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveBaseUrl(req: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");

  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function extractActionLink(data: unknown) {
  if (!data || typeof data !== "object") return "";

  const rootAction = (data as { action_link?: unknown }).action_link;
  if (typeof rootAction === "string" && rootAction) return rootAction;

  const props = (data as { properties?: unknown }).properties;
  if (!props || typeof props !== "object") return "";

  const nestedAction = (props as { action_link?: unknown }).action_link;
  return typeof nestedAction === "string" ? nestedAction : "";
}

function formatRetry(waitMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(waitMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
  return parts.join(" ");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: limitRow, error: limitErr } = await supabase
    .from("password_reset_limits")
    .select("last_reset_at")
    .eq("email", email)
    .maybeSingle();

  if (limitErr) {
    const lower = String(limitErr.message || "").toLowerCase();
    if (lower.includes("password_reset_limits")) {
      return NextResponse.json(
        { error: "Missing table password_reset_limits. Run sql/password_reset_limits.sql first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: limitErr.message || "Failed to validate reset cooldown." }, { status: 500 });
  }

  const now = Date.now();
  const last = limitRow?.last_reset_at ? new Date(limitRow.last_reset_at).getTime() : 0;
  const waitMs = COOLDOWN_MS - (now - last);
  if (waitMs > 0) {
    return NextResponse.json(
      {
        error: `This account can reset password once every 3 days. Try again in ${formatRetry(waitMs)}.`,
      },
      { status: 429 }
    );
  }

  const redirectTo = `${resolveBaseUrl(req)}/reset-password`;
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) {
    const lower = String(error.message || "").toLowerCase();
    if (lower.includes("not found") || lower.includes("invalid email")) {
      return NextResponse.json({ error: "This email is not registered." }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || "Failed to start password reset." }, { status: 500 });
  }

  const resetUrl = extractActionLink(data);
  if (!resetUrl) {
    return NextResponse.json({ error: "Could not build reset link. Please try again." }, { status: 500 });
  }

  const { error: upsertErr } = await supabase.from("password_reset_limits").upsert(
    {
      email,
      last_reset_at: new Date().toISOString(),
    },
    { onConflict: "email" }
  );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message || "Failed to save reset cooldown." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resetUrl });
}
