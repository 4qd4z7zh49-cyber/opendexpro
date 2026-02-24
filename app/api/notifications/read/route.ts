import { NextResponse } from "next/server";
import { createServiceClient, resolveUserId } from "../../deposit/_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  notificationId?: string;
  source?: string;
  sourceId?: string;
};

function parseBody(value: unknown): Body {
  if (!value || typeof value !== "object") return {};
  return value as Body;
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = parseBody(await req.json().catch(() => null));
    const source = String(body.source || "NOTIFY").trim().toUpperCase();
    const sourceId = String(body.sourceId || body.notificationId || "").trim();

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }

    if (source === "SUPPORT") {
      const { data, error } = await svc
        .from("support_threads")
        .update({
          last_sender: "USER",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId)
        .eq("user_id", userId)
        .eq("last_sender", "ADMIN")
        .select("id")
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        updated: Boolean(data?.id),
      });
    }

    const { data, error } = await svc
      .from("user_notifications")
      .update({
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId)
      .eq("user_id", userId)
      .eq("status", "PENDING")
      .select("id,status")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      updated: Boolean(data?.id),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
