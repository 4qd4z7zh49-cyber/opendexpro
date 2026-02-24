// /middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("admin_session")?.value;
  const role = req.cookies.get("admin_role")?.value; // "admin" | "superadmin" | "sub-admin" | "subadmin"
  const url = req.nextUrl.clone();

  const isAdminPath = url.pathname.startsWith("/admin");
  const isSubAdminPath = url.pathname.startsWith("/subadmin");

  // ✅ allow login page always
  if (url.pathname.startsWith("/admin/login")) return NextResponse.next();

  // ✅ protect both /admin and /subadmin
  if ((isAdminPath || isSubAdminPath) && !session) {
    url.pathname = "/admin/login";
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // ✅ role-based redirect
  const isSub =
    role === "sub-admin" || role === "subadmin";

  const isAdmin =
    role === "admin" || role === "superadmin";

  // sub-admin trying to access /admin (except /admin/login)
  if (isSub && isAdminPath) {
    url.pathname = "/subadmin";
    return NextResponse.redirect(url);
  }

  // admin trying to access /subadmin
  if (isAdmin && isSubAdminPath) {
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/subadmin/:path*"],
};