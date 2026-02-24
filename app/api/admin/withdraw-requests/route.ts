import { NextResponse } from "next/server";
import {
  assertCanManageUser,
  isRootAdminRole,
  requireAdminSession,
  resolveRootManagedUserIds,
  supabaseAdmin,
} from "../_helpers";
import { sendOneSignalPush } from "@/lib/onesignalServer";

export const dynamic = "force-dynamic";

type WithdrawStatus = "PENDING" | "CONFIRMED" | "FROZEN";
type Action = "CONFIRM" | "FREEZE" | "PENDING" | "DECLINE";
type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";

type WithdrawRow = {
  id: string;
  user_id: string;
  admin_id: string | null;
  asset: Asset;
  amount: number;
  wallet_address: string;
  status: WithdrawStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type Body = {
  requestId?: string;
  action?: string;
  note?: string;
};

function parseBody(value: unknown): Body {
  if (!value || typeof value !== "object") return {};
  return value as Body;
}

function normalizeStatus(value: unknown): WithdrawStatus {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "FROZEN" || s === "FREEZE") return "FROZEN";
  return "PENDING";
}

function normalizeTimestamp(value: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function normalizeAction(value: unknown): Action | "" {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === "CONFIRM" || s === "CONFIRMED" || s === "APPROVE") return "CONFIRM";
  if (s === "DECLINE" || s === "REJECT" || s === "REJECTED") return "DECLINE";
  if (s === "FREEZE" || s === "FROZEN") return "FREEZE";
  if (s === "PENDING" || s === "RESET") return "PENDING";
  return "";
}

function isSubadminRole(role: string) {
  const normalized = role.trim().toLowerCase();
  return normalized === "sub-admin" || normalized === "subadmin";
}

function normalizeAsset(value: unknown): Asset {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === "BTC" || s === "ETH" || s === "SOL" || s === "XRP") return s as Asset;
  return "USDT";
}

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveAppBaseUrl(req: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function pendingCount(role: string, adminId: string, visibleUserIds?: string[] | null) {
  if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) return 0;

  let q = supabaseAdmin
    .from("withdraw_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  if (Array.isArray(visibleUserIds)) {
    q = q.in("user_id", visibleUserIds);
  } else if (!isRootAdminRole(role)) {
    q = q.eq("admin_id", adminId);
  }

  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

async function deductBalance(userId: string, asset: Asset, amount: number, adminId: string, note: string) {
  const safeAmount = Math.max(0, toNumber(amount));
  if (safeAmount <= 0) return;

  if (asset === "USDT") {
    const { data: balRow, error: balErr } = await supabaseAdmin
      .from("balances")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (balErr) throw new Error(balErr.message);

    const currentUsdt = Number(balRow?.balance ?? 0);
    const nextUsdt = currentUsdt - safeAmount;
    if (nextUsdt < 0) {
      throw new Error("Insufficient USDT balance");
    }

    const { error: upBalErr } = await supabaseAdmin
      .from("balances")
      .upsert({ user_id: userId, balance: nextUsdt }, { onConflict: "user_id" });
    if (upBalErr) throw new Error(upBalErr.message);

    const { error: upHoldErr } = await supabaseAdmin
      .from("holdings")
      .upsert({ user_id: userId, asset: "USDT", balance: nextUsdt }, { onConflict: "user_id,asset" });
    if (upHoldErr) throw new Error(upHoldErr.message);
  } else {
    const { data: holdRow, error: holdErr } = await supabaseAdmin
      .from("holdings")
      .select("balance")
      .eq("user_id", userId)
      .eq("asset", asset)
      .maybeSingle();
    if (holdErr) throw new Error(holdErr.message);

    const current = Number(holdRow?.balance ?? 0);
    const next = current - safeAmount;
    if (next < 0) {
      throw new Error(`Insufficient ${asset} balance`);
    }

    const { error: upHoldErr } = await supabaseAdmin
      .from("holdings")
      .upsert({ user_id: userId, asset, balance: next }, { onConflict: "user_id,asset" });
    if (upHoldErr) throw new Error(upHoldErr.message);
  }

  const { error: logErr } = await supabaseAdmin.from("topups").insert({
    user_id: userId,
    admin_id: adminId,
    amount: -safeAmount,
    asset,
    note: note || null,
  });
  if (logErr) throw new Error(logErr.message);
}

export async function GET(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;

  try {
    const url = new URL(req.url);
    const statusRaw = String(url.searchParams.get("status") || "").trim().toUpperCase();
    const fromCreatedAt = normalizeTimestamp(url.searchParams.get("from"));
    const toCreatedAt = normalizeTimestamp(url.searchParams.get("to"));
    const userId = String(url.searchParams.get("userId") || "").trim();
    const managedByRaw = String(url.searchParams.get("managedBy") || "").trim();
    const limitRaw = Number(url.searchParams.get("limit") || 300);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, Math.floor(limitRaw))) : 300;
    const visibleUserIds = isRootAdminRole(role)
      ? await resolveRootManagedUserIds(managedByRaw)
      : null;

    if (Array.isArray(visibleUserIds) && visibleUserIds.length === 0) {
      return NextResponse.json({ ok: true, pendingCount: 0, requests: [] });
    }
    if (userId && Array.isArray(visibleUserIds) && !visibleUserIds.includes(userId)) {
      return NextResponse.json({ ok: true, pendingCount: 0, requests: [] });
    }

    let q = supabaseAdmin
      .from("withdraw_requests")
      .select("id,user_id,admin_id,asset,amount,wallet_address,status,note,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusRaw && statusRaw !== "ALL") {
      q = q.eq("status", normalizeStatus(statusRaw));
    }
    if (fromCreatedAt) {
      q = q.gte("created_at", fromCreatedAt);
    }
    if (toCreatedAt) {
      q = q.lt("created_at", toCreatedAt);
    }
    if (userId) {
      q = q.eq("user_id", userId);
    }
    if (!isRootAdminRole(role)) {
      q = q.eq("admin_id", adminId);
    } else if (Array.isArray(visibleUserIds)) {
      q = q.in("user_id", visibleUserIds);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []) as WithdrawRow[];
    const userIds = Array.from(new Set(rows.map((r) => String(r.user_id)).filter(Boolean)));
    const profileMap = new Map<string, { username: string | null; email: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("id,username,email")
        .in("id", userIds);
      if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

      (profiles || []).forEach((p) => {
        profileMap.set(String(p.id), {
          username: p.username ? String(p.username) : null,
          email: p.email ? String(p.email) : null,
        });
      });
    }

    return NextResponse.json({
      ok: true,
      pendingCount: await pendingCount(role, adminId, visibleUserIds),
      requests: rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        adminId: r.admin_id ? String(r.admin_id) : null,
        asset: normalizeAsset(r.asset),
        amount: toNumber(r.amount),
        walletAddress: String(r.wallet_address || ""),
        status: normalizeStatus(r.status),
        note: r.note ? String(r.note) : null,
        createdAt: String(r.created_at || ""),
        updatedAt: String(r.updated_at || r.created_at || ""),
        username: profileMap.get(String(r.user_id))?.username ?? null,
        email: profileMap.get(String(r.user_id))?.email ?? null,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load withdraw requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = requireAdminSession(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, adminId } = auth;
  if (isSubadminRole(role)) {
    return NextResponse.json({ error: "Sub-admin cannot update withdraw status" }, { status: 403 });
  }

  try {
    const body = parseBody(await req.json().catch(() => null));
    const requestId = String(body.requestId || "").trim();
    const action = normalizeAction(body.action);
    const actionNote = String(body.note || "").trim();

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("withdraw_requests")
      .select("id,user_id,admin_id,asset,amount,status,wallet_address,note")
      .eq("id", requestId)
      .maybeSingle();
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    const userId = String(row.user_id || "");
    if (!userId) return NextResponse.json({ error: "Invalid request user" }, { status: 400 });

    const canManage = await assertCanManageUser(adminId, role, userId);
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isRootAdminRole(role) && String(row.admin_id || "") !== adminId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentStatus = normalizeStatus(row.status);
    const targetStatus: WithdrawStatus =
      action === "CONFIRM"
        ? "CONFIRMED"
        : action === "FREEZE" || action === "DECLINE"
          ? "FROZEN"
          : "PENDING";

    if (currentStatus === "CONFIRMED" && targetStatus !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Confirmed request cannot be changed" },
        { status: 409 }
      );
    }

    if (currentStatus !== "CONFIRMED" && targetStatus === "CONFIRMED") {
      const logNote =
        actionNote ||
        `Withdraw confirmed (${normalizeAsset(row.asset)} ${toNumber(row.amount)}) · ${String(
          row.wallet_address || ""
        ).slice(0, 16)}...`;
      await deductBalance(
        userId,
        normalizeAsset(row.asset),
        toNumber(row.amount),
        adminId,
        logNote
      );
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("withdraw_requests")
      .update({
        status: targetStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id,user_id,admin_id,asset,amount,wallet_address,status,note,created_at,updated_at")
      .maybeSingle();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Request update failed" }, { status: 409 });

    try {
      const appBase = resolveAppBaseUrl(req);
      const asset = normalizeAsset(updated.asset);
      const amount = toNumber(updated.amount).toLocaleString(undefined, { maximumFractionDigits: 8 });
      const status = normalizeStatus(updated.status);
      const text =
        status === "CONFIRMED"
          ? `Your withdraw ${amount} ${asset} has been confirmed.`
          : status === "FROZEN"
            ? `Your withdraw ${amount} ${asset} is frozen.`
            : `Your withdraw ${amount} ${asset} is now pending.`;

      await sendOneSignalPush({
        externalUserIds: [String(updated.user_id)],
        title: `Withdraw ${status}`,
        message: text,
        url: `${appBase}/withdraw`,
        data: {
          source: "WITHDRAW",
          requestId: String(updated.id),
          status,
        },
      });
    } catch (pushError) {
      console.error("withdraw push send error:", pushError);
    }

    return NextResponse.json({
      ok: true,
      request: {
        id: String(updated.id),
        userId: String(updated.user_id),
        adminId: updated.admin_id ? String(updated.admin_id) : null,
        asset: normalizeAsset(updated.asset),
        amount: toNumber(updated.amount),
        walletAddress: String(updated.wallet_address || ""),
        status: normalizeStatus(updated.status),
        note: updated.note ? String(updated.note) : null,
        createdAt: String(updated.created_at || ""),
        updatedAt: String(updated.updated_at || updated.created_at || ""),
      },
      pendingCount: await pendingCount(role, adminId),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to process withdraw request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
