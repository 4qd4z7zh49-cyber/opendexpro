import { NextResponse } from "next/server";
import { createServiceClient, resolveUserId } from "../deposit/_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "FROZEN";
type NotificationSource = "DEPOSIT" | "MINING" | "WITHDRAW" | "NOTIFY" | "SUPPORT";

type NotificationItem = {
  id: string;
  source: NotificationSource;
  status: NotificationStatus;
  title: string;
  detail: string;
  fullText: string;
  createdAt: string;
  rawStatus: string;
};

type DepositRow = {
  id: string;
  asset: string | null;
  amount: number | string | null;
  status: string | null;
  created_at: string | null;
};

type MiningRow = {
  id: string;
  plan_id: string | null;
  amount: number | string | null;
  status: string | null;
  created_at: string | null;
  activated_at: string | null;
};

type WithdrawRow = {
  id: string;
  asset: string | null;
  amount: number | string | null;
  status: string | null;
  wallet_address: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type NotifyRow = {
  id: string;
  subject: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupportRow = {
  id: string;
  status: string | null;
  last_sender: string | null;
  last_message_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function isMissingTableError(err: unknown) {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code || "") : "";
  return code === "42P01";
}

function toNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toTs(v: string | null | undefined) {
  if (!v) return 0;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : 0;
}

function statusLabel(status: NotificationStatus) {
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "REJECTED") return "Rejected";
  if (status === "FROZEN") return "Frozen";
  return "Pending";
}

function fmtAmount(amount: number, maxFractionDigits = 8) {
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
}

function preview(text: string, max = 120) {
  const clean = String(text || "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
}

function normalizeDepositStatus(v: unknown): NotificationStatus {
  const s = String(v || "").toUpperCase();
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "REJECTED") return "REJECTED";
  return "PENDING";
}

function normalizeMiningStatus(v: unknown): NotificationStatus {
  const s = String(v || "").toUpperCase();
  if (s === "ACTIVE" || s === "COMPLETED") return "CONFIRMED";
  if (s === "REJECTED" || s === "ABORTED") return "REJECTED";
  return "PENDING";
}

function normalizeWithdrawStatus(v: unknown): NotificationStatus {
  const s = String(v || "").toUpperCase();
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "FROZEN" || s === "FREEZE") return "FROZEN";
  return "PENDING";
}

function normalizeNotifyStatus(v: unknown): NotificationStatus {
  const s = String(v || "").toUpperCase();
  if (s === "CONFIRMED" || s === "READ") return "CONFIRMED";
  return "PENDING";
}

function mapDepositRows(rows: DepositRow[]): NotificationItem[] {
  return rows.map((row) => {
    const status = normalizeDepositStatus(row.status);
    const asset = String(row.asset || "USDT").toUpperCase();
    const amount = toNum(row.amount);

    const fullText =
      status === "CONFIRMED"
        ? `Your deposit request for ${fmtAmount(amount)} ${asset} has been confirmed.`
        : status === "REJECTED"
          ? `Your deposit request for ${fmtAmount(amount)} ${asset} has been rejected.`
          : `Your deposit request for ${fmtAmount(amount)} ${asset} is still pending approval.`;

    return {
      id: String(row.id),
      source: "DEPOSIT",
      status,
      title: `Deposit ${statusLabel(status)}`,
      detail: preview(fullText),
      fullText,
      createdAt: String(row.created_at || ""),
      rawStatus: String(row.status || ""),
    };
  });
}

function mapMiningRows(rows: MiningRow[]): NotificationItem[] {
  return rows.map((row) => {
    const rawStatus = String(row.status || "").toUpperCase();
    const status = normalizeMiningStatus(rawStatus);
    const plan = String(row.plan_id || "-");
    const amount = toNum(row.amount);

    let fullText = `Mining plan ${plan} (${fmtAmount(amount, 2)} USDT) is pending approval.`;
    if (rawStatus === "ACTIVE") {
      fullText = `Mining plan ${plan} (${fmtAmount(amount, 2)} USDT) is now active.`;
    } else if (rawStatus === "COMPLETED") {
      fullText = `Mining plan ${plan} (${fmtAmount(amount, 2)} USDT) completed successfully.`;
    } else if (rawStatus === "ABORTED") {
      fullText = `Mining plan ${plan} (${fmtAmount(amount, 2)} USDT) was aborted.`;
    } else if (rawStatus === "REJECTED") {
      fullText = `Mining plan ${plan} (${fmtAmount(amount, 2)} USDT) was rejected.`;
    }

    return {
      id: String(row.id),
      source: "MINING",
      status,
      title: `Mining ${statusLabel(status)}`,
      detail: preview(fullText),
      fullText,
      createdAt: String(row.created_at || row.activated_at || ""),
      rawStatus,
    };
  });
}

function mapWithdrawRows(rows: WithdrawRow[]): NotificationItem[] {
  return rows.map((row) => {
    const status = normalizeWithdrawStatus(row.status);
    const asset = String(row.asset || "USDT").toUpperCase();
    const amount = toNum(row.amount);
    const addr = String(row.wallet_address || "");
    const addrShort = addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : "-";

    const fullText =
      status === "CONFIRMED"
        ? `Your withdraw request (${fmtAmount(amount, 8)} ${asset}) to ${addrShort} has been confirmed.`
        : status === "FROZEN"
          ? `Your withdraw request (${fmtAmount(amount, 8)} ${asset}) to ${addrShort} is frozen.`
          : `Your withdraw request (${fmtAmount(amount, 8)} ${asset}) to ${addrShort} is pending.`;

    return {
      id: String(row.id),
      source: "WITHDRAW",
      status,
      title: `Withdraw ${statusLabel(status)}`,
      detail: preview(fullText),
      fullText,
      createdAt: String(row.updated_at || row.created_at || ""),
      rawStatus: String(row.status || ""),
    };
  });
}

function mapNotifyRows(rows: NotifyRow[]): NotificationItem[] {
  return rows.map((row) => {
    const status = normalizeNotifyStatus(row.status);
    const subject = String(row.subject || "Notification");
    const message = String(row.message || "");

    return {
      id: String(row.id),
      source: "NOTIFY",
      status,
      title: subject,
      detail: preview(message),
      fullText: message || subject,
      createdAt: String(row.updated_at || row.created_at || ""),
      rawStatus: String(row.status || ""),
    };
  });
}

function mapSupportRows(rows: SupportRow[]): NotificationItem[] {
  return rows.flatMap((row) => {
    const threadStatus = String(row.status || "").toUpperCase();
    const lastSender = String(row.last_sender || "").toUpperCase();
    const isPending = threadStatus === "OPEN" && lastSender === "ADMIN";
    const isClosedByAdmin = threadStatus === "CLOSED" && lastSender === "ADMIN";
    if (!isPending && !isClosedByAdmin) return [];
    const status: NotificationStatus = isPending ? "PENDING" : "CONFIRMED";

    const fullText = isPending
      ? "You have a new reply from client support. Open Support to continue."
      : "Your support ticket was closed. You can open Support to send a new message.";

    return [{
      id: String(row.id),
      source: "SUPPORT",
      status,
      title: isPending ? "Unread Support Message" : "Support Updated",
      detail: preview(fullText),
      fullText,
      createdAt: String(row.last_message_at || row.updated_at || row.created_at || ""),
      rawStatus: `${threadStatus}:${lastSender}`,
    }];
  });
}

export async function GET(req: Request) {
  try {
    const svc = createServiceClient();
    const userId = await resolveUserId(req, svc);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [depRes, miningRes, withdrawRes, notifyRes, supportRes] = await Promise.all([
      svc
        .from("deposit_history")
        .select("id,asset,amount,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
      svc
        .from("mining_orders")
        .select("id,plan_id,amount,status,created_at,activated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
      svc
        .from("withdraw_requests")
        .select("id,asset,amount,status,wallet_address,created_at,updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
      svc
        .from("user_notifications")
        .select("id,subject,message,status,created_at,updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80),
      svc
        .from("support_threads")
        .select("id,status,last_sender,last_message_at,created_at,updated_at")
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .limit(20),
    ]);

    if (depRes.error) {
      return NextResponse.json({ error: depRes.error.message }, { status: 500 });
    }
    if (miningRes.error) {
      return NextResponse.json({ error: miningRes.error.message }, { status: 500 });
    }
    if (withdrawRes.error && !isMissingTableError(withdrawRes.error)) {
      return NextResponse.json({ error: withdrawRes.error.message }, { status: 500 });
    }
    if (notifyRes.error && !isMissingTableError(notifyRes.error)) {
      return NextResponse.json({ error: notifyRes.error.message }, { status: 500 });
    }
    if (supportRes.error && !isMissingTableError(supportRes.error)) {
      return NextResponse.json({ error: supportRes.error.message }, { status: 500 });
    }

    const items = [
      ...mapDepositRows((depRes.data || []) as DepositRow[]),
      ...mapMiningRows((miningRes.data || []) as MiningRow[]),
      ...mapWithdrawRows((withdrawRes.data || []) as WithdrawRow[]),
      ...mapNotifyRows((notifyRes.data || []) as NotifyRow[]),
      ...mapSupportRows((supportRes.data || []) as SupportRow[]),
    ]
      .sort((a, b) => toTs(b.createdAt) - toTs(a.createdAt))
      .slice(0, 120);

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
