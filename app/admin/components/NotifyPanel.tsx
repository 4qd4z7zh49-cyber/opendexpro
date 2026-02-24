"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type UserRow = {
  id: string;
  username?: string | null;
  email?: string | null;
};

type UsersResp = {
  users?: UserRow[];
  error?: string;
};

type NotifyStatus = "PENDING" | "CONFIRMED";

type NotifyRow = {
  id: string;
  userId: string;
  adminId?: string | null;
  username?: string | null;
  email?: string | null;
  subject: string;
  message: string;
  status: NotifyStatus;
  createdAt: string;
  updatedAt: string;
};

type NotifyListResp = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  unreadByUserId?: Record<string, number>;
  notifications?: NotifyRow[];
};

type NotifyCreateResp = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  notification?: NotifyRow;
};

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

function fmtWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function statusBadgeClass(status: NotifyStatus) {
  return status === "CONFIRMED"
    ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200"
    : "border-amber-300/30 bg-amber-500/10 text-amber-200";
}

function statusLabel(status: NotifyStatus, isZh: boolean) {
  if (isZh) return status === "CONFIRMED" ? "已读" : "未读";
  return status === "CONFIRMED" ? "READ" : "UNREAD";
}

export default function NotifyPanel() {
  const sp = useSearchParams();
  const isZh = sp.get("lang") === "zh";
  const managedBy = String(sp.get("managedBy") || "ALL").trim() || "ALL";
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState("");

  const [selectedUserId, setSelectedUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const [sendInfo, setSendInfo] = useState("");

  const [rows, setRows] = useState<NotifyRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadByUserId, setUnreadByUserId] = useState<Record<string, number>>({});
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsErr, setRowsErr] = useState("");
  const text = {
    title: isZh ? "用户通知" : "Notify Users",
    refresh: isZh ? "刷新" : "Refresh",
    users: isZh ? "用户" : "Users",
    loadingUsers: isZh ? "加载用户中..." : "Loading users...",
    noUsers: isZh ? "未找到用户。" : "No users found.",
    composeTitle: isZh ? "编写通知（Gmail 样式）" : "Compose (Gmail style)",
    to: isZh ? "收件人" : "To",
    subjectPlaceholder: isZh ? "主题" : "Subject",
    messagePlaceholder: isZh ? "请输入通知内容" : "Write your message",
    sending: isZh ? "发送中..." : "Sending...",
    send: isZh ? "发送通知" : "Send Notification",
    sentStatus: isZh ? "发送记录 / 状态" : "Sent / Status",
    loading: isZh ? "加载中..." : "Loading...",
    noRows: isZh ? "暂无通知记录。" : "No notifications yet.",
    loadUsersFailed: isZh ? "加载用户失败" : "Failed to load users",
    loadNotifyFailed: isZh ? "加载通知失败" : "Failed to load notifications",
    selectUser: isZh ? "请选择用户" : "Please select a user",
    subjectRequired: isZh ? "主题不能为空" : "Subject is required",
    messageRequired: isZh ? "内容不能为空" : "Message is required",
    sendFailed: isZh ? "发送通知失败" : "Failed to send notification",
    sendSuccess: isZh ? "通知已发送。" : "Notification sent.",
  };

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersErr("");
    try {
      const params = new URLSearchParams();
      if (managedBy.toUpperCase() !== "ALL") {
        params.set("managedBy", managedBy);
      }
      const qs = params.toString();
      const r = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await readJson<UsersResp>(r);
      if (!r.ok) {
        throw new Error(j?.error || text.loadUsersFailed);
      }

      const nextUsers = Array.isArray(j.users) ? j.users : [];
      setUsers(nextUsers);
      setSelectedUserId((prev) => {
        if (prev && nextUsers.some((u) => u.id === prev)) return prev;
        return nextUsers[0]?.id || "";
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.loadUsersFailed;
      setUsersErr(message);
    } finally {
      setUsersLoading(false);
    }
  }, [managedBy, text.loadUsersFailed]);

  const loadRows = useCallback(async (userId = selectedUserId) => {
    setLoadingRows(true);
    setRowsErr("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (userId) params.set("userId", userId);
      if (managedBy.toUpperCase() !== "ALL") params.set("managedBy", managedBy);
      const r = await fetch(`/api/admin/notify?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await readJson<NotifyListResp>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || text.loadNotifyFailed);
      }
      setRows(Array.isArray(j.notifications) ? j.notifications : []);
      const unreadMap = j.unreadByUserId && typeof j.unreadByUserId === "object" ? j.unreadByUserId : {};
      setUnreadByUserId(unreadMap);
      const unreadTotal = Object.values(unreadMap).reduce((sum, n) => sum + Number(n || 0), 0);
      setPendingCount(Number(j.pendingCount ?? unreadTotal));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.loadNotifyFailed;
      setRowsErr(message);
    } finally {
      setLoadingRows(false);
    }
  }, [selectedUserId, managedBy, text.loadNotifyFailed]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadRows(selectedUserId);
  }, [selectedUserId, loadRows]);

  const onSend = async () => {
    if (!selectedUserId) {
      setSendErr(text.selectUser);
      return;
    }
    if (!subject.trim()) {
      setSendErr(text.subjectRequired);
      return;
    }
    if (!message.trim()) {
      setSendErr(text.messageRequired);
      return;
    }

    setSendLoading(true);
    setSendErr("");
    setSendInfo("");
    try {
      const r = await fetch("/api/admin/notify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const j = await readJson<NotifyCreateResp>(r);
      if (!r.ok || !j?.ok || !j.notification) {
        throw new Error(j?.error || text.sendFailed);
      }

      const enriched = {
        ...(j.notification as NotifyRow),
        username: j.notification.username ?? selectedUser?.username ?? null,
        email: j.notification.email ?? selectedUser?.email ?? null,
      };
      setRows((prev) => [enriched, ...prev].slice(0, 200));
      setUnreadByUserId((prev) => ({
        ...prev,
        [selectedUserId]: Number(prev[selectedUserId] || 0) + 1,
      }));
      setPendingCount((prev) => Number(j.pendingCount ?? prev + 1));
      setSendInfo(text.sendSuccess);
      setSubject("");
      setMessage("");
    } catch (e: unknown) {
      const messageText = e instanceof Error ? e.message : text.sendFailed;
      setSendErr(messageText);
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-xl font-semibold">{text.title}</div>
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
            {pendingCount}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadUsers();
            void loadRows(selectedUserId);
          }}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          {text.refresh}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-sm font-semibold text-white">{text.users}</div>
          {usersLoading ? <div className="text-xs text-white/60">{text.loadingUsers}</div> : null}
          {usersErr ? <div className="text-xs text-red-300">{usersErr}</div> : null}

          <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
            {users.map((u) => {
              const active = selectedUserId === u.id;
              const unread = Number(unreadByUserId[u.id] ?? 0);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className={[
                    "w-full rounded-xl border px-3 py-2 text-left",
                    active
                      ? "border-blue-400/50 bg-blue-500/15 text-white"
                      : "border-white/10 bg-black/20 text-white/80 hover:bg-black/30",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold">{u.username || "-"}</div>
                    {unread > 0 ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        {unread}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-white/60">{u.email || "-"}</div>
                </button>
              );
            })}

            {!usersLoading && users.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                {text.noUsers}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-base font-semibold">{text.composeTitle}</div>
            <div className="mt-1 text-sm text-white/60">
              {text.to}: {selectedUser?.email || "-"}
            </div>

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={text.subjectPlaceholder}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            />

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder={text.messagePlaceholder}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            />

            {sendErr ? <div className="mt-3 text-sm text-red-300">{sendErr}</div> : null}
            {sendInfo ? <div className="mt-3 text-sm text-emerald-300">{sendInfo}</div> : null}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={sendLoading || !selectedUserId}
                onClick={() => void onSend()}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sendLoading ? text.sending : text.send}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-base font-semibold">{text.sentStatus}</div>

            {rowsErr ? <div className="mb-3 text-sm text-red-300">{rowsErr}</div> : null}
            {loadingRows ? <div className="text-sm text-white/60">{text.loading}</div> : null}

            {!loadingRows && rows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                {text.noRows}
              </div>
            ) : null}

            {!loadingRows && rows.length > 0 ? (
              <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                {rows.map((row) => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{row.subject}</div>
                        <div className="mt-0.5 text-xs text-white/60">
                          {row.username || "-"} · {row.email || "-"}
                        </div>
                      </div>
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          statusBadgeClass(row.status),
                        ].join(" ")}
                      >
                        {statusLabel(row.status, isZh)}
                      </span>
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-xs text-white/75">
                      {row.message}
                    </div>

                    <div className="mt-2 text-[11px] text-white/50">{fmtWhen(row.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
