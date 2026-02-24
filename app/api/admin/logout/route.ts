import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  res.cookies.set("admin_session", "", cookieOpts);
  res.cookies.set("admin_role", "", cookieOpts);
  res.cookies.set("admin_id", "", cookieOpts);

  return res;
}