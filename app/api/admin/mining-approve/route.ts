import { NextResponse } from "next/server";
import { requireAdminSession, supabaseAdmin, assertCanManageUser } from "../_helpers";
import { sendOneSignalPush } from "@/lib/onesignalServer";

function resolveAppBaseUrl(req: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { adminId, role } = auth;

  try {
    const { miningId } = await req.json();
    const id = String(miningId || "");
    if (!id) return NextResponse.json({ error: "miningId required" }, { status: 400 });

    // find mining order
    const { data: mo, error } = await supabaseAdmin
      .from("mining_orders")
      .select("id,user_id,status")
      .eq("id", id)
      .single();

    if (error || !mo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (mo.status !== "PENDING") return NextResponse.json({ error: "Not pending" }, { status: 400 });

    const ok = await assertCanManageUser(adminId, role, mo.user_id);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error: upErr } = await supabaseAdmin
      .from("mining_orders")
      .update({
        status: "ACTIVE",
        activated_at: new Date().toISOString(),
        note: role === "admin" || role === "superadmin" ? "Approved by admin" : "Approved by subadmin",
      })
      .eq("id", id);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    try {
      const appBase = resolveAppBaseUrl(req);
      await sendOneSignalPush({
        externalUserIds: [String(mo.user_id)],
        title: "Mining Approved",
        message: "Your mining order is now active.",
        url: `${appBase}/mining`,
        data: {
          source: "MINING",
          miningId: id,
          status: "ACTIVE",
        },
      });
    } catch (pushError) {
      console.error("mining push send error:", pushError);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
