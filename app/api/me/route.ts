import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";

  const get = (name: string) => {
    const m = cookie.match(new RegExp(`${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : "";
  };

  const session = get("admin_session");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    role: get("admin_role"),
    id: get("admin_id"),
  });
}