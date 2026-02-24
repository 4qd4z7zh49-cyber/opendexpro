import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { assertCanManageUser, requireAdminSession, supabaseAdmin } from "../_helpers";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

function isAllowedRole(role: string) {
  return role === "admin" || role === "superadmin" || role === "sub-admin" || role === "subadmin";
}

function randomFrom(chars: string) {
  return chars[randomInt(0, chars.length)];
}

function shuffle(input: string[]) {
  for (let i = input.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [input[i], input[j]] = [input[j], input[i]];
  }
  return input;
}

function generateTemporaryPassword(length = 14) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-+=";
  const all = `${upper}${lower}${digits}${symbols}`;

  const chars = [
    randomFrom(upper),
    randomFrom(lower),
    randomFrom(digits),
    randomFrom(symbols),
  ];

  while (chars.length < length) {
    chars.push(randomFrom(all));
  }

  return shuffle(chars).join("");
}

export async function POST(req: Request) {
  const session = requireAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = session;
  if (!isAllowedRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId || "").trim();
  const suppliedPassword =
    typeof body?.newPassword === "string" ? String(body.newPassword).trim() : "";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (suppliedPassword.length > 0 && suppliedPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (suppliedPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `newPassword must be at most ${MAX_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const canManage = await assertCanManageUser(adminId, role, userId);
  if (!canManage) {
    return NextResponse.json({ error: "You cannot manage this user" }, { status: 403 });
  }

  const generated = suppliedPassword.length === 0;
  const nextPassword = generated ? generateTemporaryPassword() : suppliedPassword;

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: nextPassword,
    email_confirm: true,
  });

  if (error) {
    const lower = String(error.message || "").toLowerCase();
    const status = lower.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    userId,
    generated,
    temporaryPassword: generated ? nextPassword : null,
  });
}
