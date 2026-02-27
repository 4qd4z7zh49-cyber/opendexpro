"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type UserRow = {
  id: string;
  username?: string | null;
  email?: string | null;
  managedBy?: string | null;
  managedByUsername?: string | null;
  managedByRole?: string | null;
  createdAt?: string | null;
};

type ManagerRow = {
  id: string;
  username?: string | null;
  role?: string | null;
};

type ManageUsersResponse = {
  ok?: boolean;
  error?: string;
  users?: UserRow[];
  managers?: ManagerRow[];
  subadmins?: ManagerRow[];
};

type ManageUsersUpdateResponse = {
  ok?: boolean;
  error?: string;
  user?: UserRow;
};

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function normalizeRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function roleLabel(role?: string | null, isZh = false) {
  const normalized = normalizeRole(role);
  if (normalized === "superadmin") return isZh ? "超级管理员" : "Superadmin";
  if (normalized === "sub-admin" || normalized === "subadmin") return isZh ? "子管理员" : "Sub-admin";
  return isZh ? "管理员" : "Manager";
}

function managerLabel(user: UserRow, isZh = false) {
  if (!user.managedBy) return isZh ? "未分配" : "Unassigned";
  const name = String(user.managedByUsername || "").trim();
  if (name) return `${name} (${roleLabel(user.managedByRole, isZh)})`;
  return `${user.managedBy.slice(0, 8)}...`;
}

function managerValue(user: UserRow) {
  return user.managedBy || "UNASSIGNED";
}

function managerOptionLabel(manager: ManagerRow, isZh = false) {
  return `${manager.username || manager.id.slice(0, 8)} (${roleLabel(manager.role, isZh)})`;
}

function ManageUserPageInner() {
  const sp = useSearchParams();
  const isZh = sp.get("lang") === "zh";
  const [users, setUsers] = useState<UserRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [draftByUserId, setDraftByUserId] = useState<Record<string, string>>({});
  const text = {
    pageTitle: isZh ? "管理用户" : "Manage User",
    pageDesc: isZh
      ? "在未分配、子管理员和超级管理员之间调整客户归属。"
      : "Move customer assignment between unassigned, sub-admin, and superadmin managers.",
    searchPlaceholder: isZh ? "搜索用户名或邮箱" : "Search username or email",
    refresh: isZh ? "刷新" : "Refresh",
    refreshing: isZh ? "刷新中..." : "Refreshing...",
    loading: isZh ? "加载中..." : "Loading...",
    noUsersFound: isZh ? "没有找到用户。" : "No users found.",
    username: isZh ? "用户名" : "USERNAME",
    email: isZh ? "邮箱" : "EMAIL",
    currentManager: isZh ? "当前管理者" : "CURRENT MANAGER",
    moveTo: isZh ? "调整到" : "MOVE TO",
    action: isZh ? "操作" : "ACTION",
    created: isZh ? "创建时间" : "CREATED",
    unassigned: isZh ? "未分配" : "Unassigned",
    save: isZh ? "保存" : "Save",
    saving: isZh ? "保存中..." : "Saving...",
    noChanges: isZh ? "没有需要保存的变更。" : "No changes to save.",
    userFallback: isZh ? "用户" : "User",
    movedTo: (who: string, target: string) =>
      isZh ? `${who} 已调整到 ${target}。` : `${who} moved to ${target}.`,
    loadFailed: isZh ? "加载用户管理数据失败" : "Failed to load manage users",
    updateFailed: isZh ? "更新管理者失败" : "Failed to update manager",
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/manage-users", {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await r.json().catch(() => ({}))) as ManageUsersResponse;
      if (!r.ok || !j?.ok) throw new Error(j?.error || text.loadFailed);

      const nextUsers = Array.isArray(j.users) ? j.users : [];
      const nextManagers = Array.isArray(j.managers)
        ? j.managers
        : Array.isArray(j.subadmins)
          ? j.subadmins
          : [];

      setUsers(nextUsers);
      setManagers(nextManagers);

      const nextDraft: Record<string, string> = {};
      nextUsers.forEach((row) => {
        nextDraft[row.id] = managerValue(row);
      });
      setDraftByUserId(nextDraft);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.loadFailed;
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, [text.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const username = String(u.username || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return username.includes(q) || email.includes(q);
    });
  }, [users, search]);

  const onChangeManager = (userId: string, value: string) => {
    setDraftByUserId((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const saveUserManager = async (user: UserRow) => {
    const selected = String(draftByUserId[user.id] || managerValue(user));
    if (selected === managerValue(user)) {
      setInfo(text.noChanges);
      setErr("");
      return;
    }

    setSavingUserId(user.id);
    setErr("");
    setInfo("");
    try {
      const r = await fetch("/api/admin/manage-users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          managedBy: selected === "UNASSIGNED" ? null : selected,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as ManageUsersUpdateResponse;
      if (!r.ok || !j?.ok || !j.user) {
        throw new Error(j?.error || text.updateFailed);
      }

      setUsers((prev) => prev.map((row) => (row.id === user.id ? j.user || row : row)));
      setDraftByUserId((prev) => ({
        ...prev,
        [user.id]: managerValue(j.user || user),
      }));

      const who = user.username || user.email || text.userFallback;
      const target = j.user?.managedByUsername
        ? `${j.user.managedByUsername} (${roleLabel(j.user.managedByRole, isZh)})`
        : j.user?.managedBy
          ? roleLabel(j.user.managedByRole, isZh)
          : text.unassigned;
      setInfo(text.movedTo(who, target));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.updateFailed;
      setErr(message);
    } finally {
      setSavingUserId("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">{text.pageTitle}</div>
        <p className="mt-2 text-white/60">
          {text.pageDesc}
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <input
            className="w-full max-w-sm rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            placeholder={text.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          >
            {loading ? text.refreshing : text.refresh}
          </button>
        </div>

        {err ? <div className="mb-3 text-sm text-red-400">{err}</div> : null}
        {info ? <div className="mb-3 text-sm text-emerald-300">{info}</div> : null}
        {loading ? <div className="text-white/60">{text.loading}</div> : null}

        {!loading && filteredUsers.length === 0 ? (
          <div className="text-white/60">{text.noUsersFound}</div>
        ) : null}

        {!loading && filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{text.username}</th>
                  <th className="py-3">{text.email}</th>
                  <th className="py-3">{text.currentManager}</th>
                  <th className="py-3">{text.moveTo}</th>
                  <th className="py-3 text-right">{text.action}</th>
                  <th className="py-3 text-right">{text.created}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const selected = String(draftByUserId[user.id] || managerValue(user));
                  const saving = savingUserId === user.id;

                  return (
                    <tr key={user.id} className="border-t border-white/10">
                      <td className="py-3">{user.username || "-"}</td>
                      <td className="py-3">{user.email || "-"}</td>
                      <td className="py-3">{managerLabel(user, isZh)}</td>
                      <td className="py-3">
                        <select
                          value={selected}
                          onChange={(e) => onChangeManager(user.id, e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        >
                          <option value="UNASSIGNED" className="bg-black">
                            {text.unassigned}
                          </option>
                          {managers.map((m) => (
                            <option key={m.id} value={m.id} className="bg-black">
                              {managerOptionLabel(m, isZh)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveUserManager(user)}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {saving ? text.saving : text.save}
                        </button>
                      </td>
                      <td className="py-3 text-right text-white/70">{fmtDate(user.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ManageUserPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">Loading...</div>}>
      <ManageUserPageInner />
    </Suspense>
  );
}
