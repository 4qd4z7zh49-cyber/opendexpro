"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type SuperadminProfileRow = {
  id: string;
  username: string | null;
  role: string | null;
  invitationCode: string | null;
  createdAt: string | null;
  managedUsersCount: number;
};

type ProfileResponse = {
  ok?: boolean;
  error?: string;
  profile?: SuperadminProfileRow;
};

type ChangePasswordResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

export default function SuperadminProfilePage() {
  const sp = useSearchParams();
  const isZh = sp.get("lang") === "zh";
  const isLight = sp.get("theme") === "light";
  const [profile, setProfile] = useState<SuperadminProfileRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState("");
  const [inviteInfo, setInviteInfo] = useState("");

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordErr, setChangePasswordErr] = useState("");
  const [changePasswordInfo, setChangePasswordInfo] = useState("");
  const text = {
    pageTitle: isZh ? "超级管理员资料" : "Super Admin Profile",
    pageDesc: isZh
      ? "查看超级管理员账号信息、邀请码和密码控制。"
      : "View superadmin account information, invitation code, and password controls.",
    loading: isZh ? "加载中..." : "Loading...",
    username: isZh ? "用户名" : "Username",
    role: isZh ? "角色" : "Role",
    adminId: isZh ? "管理员 ID" : "Admin ID",
    managedUsers: isZh ? "管理用户数" : "Managed Users",
    createdDate: isZh ? "创建日期" : "Created Date",
    inviteCodeTitle: isZh ? "邀请码" : "Invitation Code",
    inviteCodeDesc: isZh
      ? "该邀请码可用于分配和账号流程。"
      : "This code can be used for assignment and account workflows.",
    updating: isZh ? "更新中..." : "Updating...",
    regenerateCode: isZh ? "重新生成邀请码" : "Regenerate Code",
    refresh: isZh ? "刷新" : "Refresh",
    security: isZh ? "安全设置" : "Security",
    securityDesc: isZh
      ? "将密码更新流程统一放在这里。"
      : "Move your password update workflow here from Manage Subadmin.",
    cancel: isZh ? "取消" : "Cancel",
    changePassword: isZh ? "修改密码" : "Change Password",
    currentPassword: isZh ? "当前密码" : "Current password",
    newPasswordMin8: isZh ? "新密码（最少 8 位）" : "New password (min 8)",
    confirmNewPassword: isZh ? "确认新密码" : "Confirm new password",
    updatePassword: isZh ? "更新密码" : "Update Password",
    loadFailed: isZh ? "加载超级管理员资料失败" : "Failed to load superadmin profile",
    regenerateFailed: isZh ? "重新生成邀请码失败" : "Failed to regenerate invitation code",
    inviteUpdated: isZh ? "邀请码已更新。" : "Invitation code updated.",
    changePasswordFailed: isZh ? "修改密码失败" : "Failed to change password",
    passwordMin8: isZh ? "新密码至少需要 8 个字符" : "New password must be at least 8 characters",
    passwordMismatch: isZh
      ? "新密码与确认密码不一致"
      : "New password and confirm password do not match",
    passwordUpdated: isZh ? "密码更新成功。" : "Password updated successfully.",
  };

  const regenerateButtonClass = isLight
    ? "rounded-xl border border-cyan-500/45 bg-cyan-100 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-200 disabled:opacity-60"
    : "rounded-xl border border-cyan-300/40 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-60";

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/superadmin-profile", {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as ProfileResponse;
      if (!res.ok || !json?.ok || !json.profile) {
        throw new Error(json?.error || text.loadFailed);
      }
      setProfile(json.profile);
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

  async function regenerateInviteCode() {
    setInviteBusy(true);
    setInviteErr("");
    setInviteInfo("");
    try {
      const res = await fetch("/api/admin/superadmin-profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_invite_code" }),
      });
      const json = (await res.json().catch(() => ({}))) as ProfileResponse;
      if (!res.ok || !json?.ok || !json.profile) {
        throw new Error(json?.error || text.regenerateFailed);
      }
      setProfile(json.profile);
      setInviteInfo(text.inviteUpdated);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.regenerateFailed;
      setInviteErr(message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function changeMyPassword() {
    setChangingPassword(true);
    setChangePasswordErr("");
    setChangePasswordInfo("");
    try {
      if (newPassword.length < 8) {
        throw new Error(text.passwordMin8);
      }
      if (newPassword !== confirmNewPassword) {
        throw new Error(text.passwordMismatch);
      }

      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as ChangePasswordResponse;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || text.changePasswordFailed);
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordOpen(false);
      setChangePasswordInfo(text.passwordUpdated);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : text.changePasswordFailed;
      setChangePasswordErr(message);
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="admin-page-title text-2xl font-semibold">
          {text.pageTitle}
        </div>
        <p className="mt-2 text-white/60">
          {text.pageDesc}
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        {loading ? <div className="text-white/60">{text.loading}</div> : null}
        {err ? <div className="text-red-400">{err}</div> : null}

        {!loading && !err && profile ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-white/50">{text.username}</div>
              <div className="mt-2 text-lg font-semibold">{profile.username || "-"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-white/50">{text.role}</div>
              <div className="mt-2 text-lg font-semibold uppercase">{profile.role || "-"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-white/50">{text.adminId}</div>
              <div className="mt-2 break-all font-mono text-sm text-white/85">{profile.id}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-white/50">{text.managedUsers}</div>
              <div className="mt-2 text-lg font-semibold">{profile.managedUsersCount}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:col-span-2">
              <div className="text-xs uppercase tracking-[0.08em] text-white/50">{text.createdDate}</div>
              <div className="mt-2 text-lg font-semibold">{fmtDate(profile.createdAt)}</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-semibold">{text.inviteCodeTitle}</div>
        <p className="mt-2 text-sm text-white/60">
          {text.inviteCodeDesc}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-lg tracking-wide">
            {profile?.invitationCode || "-"}
          </div>
          <button
            type="button"
            disabled={inviteBusy || loading || !profile}
            onClick={() => void regenerateInviteCode()}
            className={regenerateButtonClass}
          >
            {inviteBusy ? text.updating : text.regenerateCode}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
          >
            {text.refresh}
          </button>
        </div>

        {inviteErr ? <div className="mt-3 text-sm text-red-400">{inviteErr}</div> : null}
        {inviteInfo ? <div className="mt-3 text-sm text-emerald-300">{inviteInfo}</div> : null}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{text.security}</div>
            <p className="mt-2 text-sm text-white/60">
              {text.securityDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPasswordOpen((prev) => !prev)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {passwordOpen ? text.cancel : text.changePassword}
          </button>
        </div>

        {passwordOpen ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                placeholder={text.currentPassword}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                placeholder={text.newPasswordMin8}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                placeholder={text.confirmNewPassword}
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={() => void changeMyPassword()}
              disabled={
                changingPassword ||
                !currentPassword ||
                newPassword.length < 8 ||
                confirmNewPassword.length < 8
              }
              className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {changingPassword ? text.updating : text.updatePassword}
            </button>
          </div>
        ) : null}

        {changePasswordErr ? <div className="mt-3 text-sm text-red-400">{changePasswordErr}</div> : null}
        {changePasswordInfo ? (
          <div className="mt-3 text-sm text-emerald-300">{changePasswordInfo}</div>
        ) : null}
      </div>
    </div>
  );
}
