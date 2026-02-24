"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Row = {
  id: string;
  username: string | null;
  role: string | null;
  invitation_code: string | null;
  managed_by: string | null;
  created_at?: string | null;
};

type SubadminResetPasswordResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export default function ManageAdminPage() {
  const sp = useSearchParams();
  const isZh = sp.get("lang") === "zh";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [newInvite, setNewInvite] = useState<string | null>(null);
  const [resettingSubadminId, setResettingSubadminId] = useState("");
  const [subadminResetErr, setSubadminResetErr] = useState("");
  const [subadminResetInfo, setSubadminResetInfo] = useState("");
  const text = {
    pageTitle: isZh ? "管理子管理员" : "Manage Subadmin",
    pageDesc: isZh ? "创建子管理员账号并生成邀请码。" : "Create sub-admin accounts + generate invitation codes.",
    createTitle: isZh ? "创建子管理员" : "Create Sub-admin",
    username: isZh ? "用户名" : "Username",
    password: isZh ? "密码" : "Password",
    creating: isZh ? "创建中..." : "Creating...",
    createAndGenerate: isZh ? "创建并生成邀请码" : "Create + Generate code",
    invitation: isZh ? "邀请码" : "Invitation",
    refresh: isZh ? "刷新" : "Refresh",
    listTitle: isZh ? "子管理员列表" : "Sub-admin list",
    loading: isZh ? "加载中..." : "Loading...",
    noRows: isZh ? "暂无子管理员。" : "No sub-admins.",
    invite: isZh ? "邀请码" : "INVITE",
    managedBy: isZh ? "管理者" : "MANAGED BY",
    resetPassword: isZh ? "重置密码" : "RESET PASSWORD",
    created: isZh ? "创建时间" : "CREATED",
    resetButton: isZh ? "重置密码" : "Reset Password",
    resetting: isZh ? "重置中..." : "Resetting...",
    loadFailed: isZh ? "加载失败" : "Failed to load",
    genericFailed: isZh ? "操作失败" : "Failed",
    createFailed: isZh ? "创建失败" : "Create failed",
    subadminFallback: isZh ? "子管理员" : "sub-admin",
    promptPassword: (name: string) =>
      isZh ? `为 ${name} 设置新密码（至少 8 位）。` : `Set new password for ${name} (minimum 8 characters).`,
    confirmPassword: (name: string) =>
      isZh ? `确认 ${name} 的新密码。` : `Confirm new password for ${name}.`,
    min8: isZh ? "新密码至少需要 8 个字符。" : "New password must be at least 8 characters.",
    max72: isZh ? "新密码最多 72 个字符。" : "New password must be at most 72 characters.",
    confirmMismatch: isZh ? "确认密码不匹配。" : "Confirm password does not match.",
    resetFailed: isZh ? "重置子管理员密码失败" : "Failed to reset sub-admin password",
    resetDone: (name: string) =>
      isZh ? `${name} 的密码重置已完成。` : `Password reset completed for ${name}.`,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/subadmins");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || text.loadFailed);
      setRows(Array.isArray(j?.subadmins) ? j.subadmins : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.genericFailed;
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, [text.genericFailed, text.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    setErr("");
    setNewInvite(null);
    try {
      const r = await fetch("/api/admin/subadmins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || text.createFailed);

      setNewInvite(j?.subadmin?.invitation_code ?? null);
      setUsername("");
      setPassword("");
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.createFailed;
      setErr(message);
    } finally {
      setCreating(false);
    }
  }

  async function resetSubadminPassword(row: Row) {
    const name = String(row.username || text.subadminFallback);
    const input = window.prompt(text.promptPassword(name), "");
    if (input === null) return;

    const newPassword = String(input);
    if (newPassword.length < 8) {
      setSubadminResetErr(text.min8);
      setSubadminResetInfo("");
      return;
    }
    if (newPassword.length > 72) {
      setSubadminResetErr(text.max72);
      setSubadminResetInfo("");
      return;
    }

    const confirmPassword = window.prompt(text.confirmPassword(name), "");
    if (confirmPassword === null) return;
    if (confirmPassword !== newPassword) {
      setSubadminResetErr(text.confirmMismatch);
      setSubadminResetInfo("");
      return;
    }

    setResettingSubadminId(row.id);
    setSubadminResetErr("");
    setSubadminResetInfo("");

    try {
      const res = await fetch("/api/admin/subadmins/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subadminId: row.id,
          newPassword,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as SubadminResetPasswordResponse;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || text.resetFailed);
      }

      setSubadminResetInfo(text.resetDone(name));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.resetFailed;
      setSubadminResetErr(message);
    } finally {
      setResettingSubadminId("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div
          className="text-2xl font-semibold"
          style={{
            color: "#ecfeff",
            textShadow:
              "0 0 6px rgba(34,211,238,0.85), 0 0 14px rgba(59,130,246,0.55), 0 0 24px rgba(217,70,239,0.35)",
          }}
        >
          {text.pageTitle}
        </div>
        <p className="mt-2 text-white/60">{text.pageDesc}</p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-semibold">{text.createTitle}</div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            placeholder={text.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            placeholder={text.password}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={create}
            disabled={creating || username.trim().length < 3 || password.length < 4}
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold disabled:opacity-60"
          >
            {creating ? text.creating : text.createAndGenerate}
          </button>

          {newInvite ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
              <span className="text-white/60">{text.invitation}:</span>{" "}
              <span className="font-semibold">{newInvite}</span>
            </div>
          ) : null}

          <button
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          >
            {text.refresh}
          </button>
        </div>

        {err ? <div className="mt-3 text-red-400">{err}</div> : null}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 text-lg font-semibold">{text.listTitle}</div>

        {loading ? <div className="text-white/60">{text.loading}</div> : null}
        {!loading && rows.length === 0 ? <div className="text-white/60">{text.noRows}</div> : null}

        {!loading && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{text.username.toUpperCase()}</th>
                  <th className="py-3">{text.invite}</th>
                  <th className="py-3">{text.managedBy}</th>
                  <th className="py-3 text-center">{text.resetPassword}</th>
                  <th className="py-3 text-right">{text.created}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const busy = resettingSubadminId === r.id;
                  return (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="py-3">{r.username ?? "-"}</td>
                      <td className="py-3 font-mono">{r.invitation_code ?? "-"}</td>
                      <td className="py-3 font-mono text-white/70">
                        {r.managed_by ? r.managed_by.slice(0, 12) + "…" : "-"}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resetSubadminPassword(r)}
                          className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-60"
                        >
                          {busy ? text.resetting : text.resetButton}
                        </button>
                      </td>
                      <td className="py-3 text-right text-white/70">
                        {(r.created_at || "").toString().slice(0, 10) || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {subadminResetErr ? <div className="mt-3 text-red-400">{subadminResetErr}</div> : null}
        {subadminResetInfo ? <div className="mt-3 text-emerald-300">{subadminResetInfo}</div> : null}
      </div>
    </div>
  );
}
