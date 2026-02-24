import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "ob_admin";

function sign(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function verifyAdminCookie(req: NextRequest) {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) return false;

  const v = req.cookies.get(COOKIE_NAME)?.value;
  if (!v) return false;

  const [token, sig] = v.split(".");
  if (!token || !sig) return false;

  const expected = sign(token, secret);
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { exp: number };
    if (!payload?.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // allow admin login page + its API
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  // protect /admin and /api/admin/**
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const ok = verifyAdminCookie(req);

    if (!ok) {
      // API -> 401, Page -> redirect to login
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = `?next=${encodeURIComponent(pathname + (search || ""))}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};