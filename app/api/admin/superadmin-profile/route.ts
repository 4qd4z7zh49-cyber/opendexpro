import { NextResponse } from "next/server";
import { isSuperadminRole, requireAdminSession, supabaseAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_SUFFIX_LENGTH = 6;
const MAX_INVITE_ATTEMPTS = 16;

type AdminProfileRow = {
  id: string;
  username: string | null;
  role: string | null;
  invitation_code: string | null;
  created_at: string | null;
};

function generateInviteCode() {
  let suffix = "";
  for (let i = 0; i < INVITE_SUFFIX_LENGTH; i += 1) {
    suffix += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return `SA${suffix}`;
}

function isDuplicateInviteError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("duplicate key") || lower.includes("unique constraint");
}

async function getManagedUsersCount(adminId: string) {
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("managed_by", adminId);

  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function getProfile(adminId: string) {
  const { data, error } = await supabaseAdmin
    .from("admins")
    .select("id,username,role,invitation_code,created_at")
    .eq("id", adminId)
    .maybeSingle<AdminProfileRow>();

  if (error) throw new Error(error.message);
  return data || null;
}

async function buildUniqueInviteCode(adminId: string) {
  for (let i = 0; i < MAX_INVITE_ATTEMPTS; i += 1) {
    const candidate = generateInviteCode();
    const { data, error } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("invitation_code", candidate)
      .limit(1);

    if (error) throw new Error(error.message);
    const first = Array.isArray(data) ? data[0] : null;
    if (!first || String(first.id) === adminId) {
      return candidate;
    }
  }

  throw new Error("Failed to generate unique invitation code");
}

async function saveInviteCodeWithRetry(adminId: string) {
  let lastError = "";
  for (let i = 0; i < MAX_INVITE_ATTEMPTS; i += 1) {
    const nextCode = await buildUniqueInviteCode(adminId);
    const { error } = await supabaseAdmin
      .from("admins")
      .update({ invitation_code: nextCode })
      .eq("id", adminId);

    if (!error) return nextCode;

    const message = String(error.message || "Failed to update invitation code");
    lastError = message;
    if (!isDuplicateInviteError(message)) {
      throw new Error(message);
    }
  }

  throw new Error(lastError || "Failed to save invitation code");
}

async function ensureInviteCode(adminId: string, currentInviteCode: string | null) {
  const existing = String(currentInviteCode || "").trim();
  if (existing) return existing;
  return saveInviteCodeWithRetry(adminId);
}

export async function GET(req: Request) {
  const session = requireAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperadminRole(session.role)) {
    return NextResponse.json({ error: "Only superadmin can view this profile" }, { status: 403 });
  }

  try {
    const profile = await getProfile(session.adminId);
    if (!profile) return NextResponse.json({ error: "Superadmin not found" }, { status: 404 });

    const inviteCode = await ensureInviteCode(session.adminId, profile.invitation_code);
    const managedUsersCount = await getManagedUsersCount(session.adminId);

    return NextResponse.json({
      ok: true,
      profile: {
        id: String(profile.id),
        username: profile.username ? String(profile.username) : null,
        role: profile.role ? String(profile.role) : null,
        invitationCode: inviteCode,
        createdAt: profile.created_at ? String(profile.created_at) : null,
        managedUsersCount,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load superadmin profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = requireAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperadminRole(session.role)) {
    return NextResponse.json({ error: "Only superadmin can update this profile" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "regenerate_invite_code")
    .trim()
    .toLowerCase();
  if (action !== "regenerate_invite_code") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  try {
    const profile = await getProfile(session.adminId);
    if (!profile) return NextResponse.json({ error: "Superadmin not found" }, { status: 404 });

    const invitationCode = await saveInviteCodeWithRetry(session.adminId);
    const managedUsersCount = await getManagedUsersCount(session.adminId);

    return NextResponse.json({
      ok: true,
      profile: {
        id: String(profile.id),
        username: profile.username ? String(profile.username) : null,
        role: profile.role ? String(profile.role) : null,
        invitationCode,
        createdAt: profile.created_at ? String(profile.created_at) : null,
        managedUsersCount,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update invitation code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
