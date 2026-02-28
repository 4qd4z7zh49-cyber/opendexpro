"use client";

import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserAccessToken, getUserAuthHeaders } from "@/lib/clientAuth";
import {
  isOneSignalConfigured,
  oneSignalGetPushState,
  oneSignalLogin,
  oneSignalRequestPermission,
  oneSignalSetOptIn,
  type OneSignalPushState,
} from "@/lib/onesignalClient";
import { supabase } from "@/lib/supabaseClient";

type Theme = "dark" | "light";
type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
type LanguageCode = "en" | "es" | "de" | "fr" | "zh";

type Profile = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  role: string | null;
  created_at: string | null;
  invitation_code: string | null;
  last_sign_in_at?: string | null;
  last_password_reset_request_at?: string | null;
};

type ProfileResp = {
  ok?: boolean;
  error?: string;
  profile?: Profile;
};

type AppSettings = {
  avatarPreset: number;
  avatarImageDataUrl: string;
  avatarImageUrl: string;
  avatarStoragePath: string;
  language: LanguageCode;
  notifications: {
    mailNotify: boolean;
    supportNotify: boolean;
    depositWithdrawNotify: boolean;
  };
  safety: {
    defaultAsset: Asset;
    defaultNetwork: string;
    antiPhishingCode: string;
    withdrawWhitelist: Record<Asset, string>;
  };
};

const SETTINGS_METADATA_KEY = "opendex_settings_v1";
const ASSETS: Asset[] = ["USDT", "BTC", "ETH", "SOL", "XRP"];
const NETWORK_OPTIONS = ["TRC20", "ERC20", "BEP20", "SOLANA", "XRP Ledger"];
const LANGUAGE_OPTIONS: Array<{ value: LanguageCode; label: string }> = [
  { value: "en", label: "En" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "fr", label: "France" },
  { value: "zh", label: "Chinese" },
];

const DEFAULT_SETTINGS: AppSettings = {
  avatarPreset: 0,
  avatarImageDataUrl: "",
  avatarImageUrl: "",
  avatarStoragePath: "",
  language: "en",
  notifications: {
    mailNotify: true,
    supportNotify: true,
    depositWithdrawNotify: true,
  },
  safety: {
    defaultAsset: "USDT",
    defaultNetwork: "TRC20",
    antiPhishingCode: "",
    withdrawWhitelist: {
      USDT: "",
      BTC: "",
      ETH: "",
      SOL: "",
      XRP: "",
    },
  },
};

const AVATAR_PRESETS = [
  {
    shellClass:
      "bg-[linear-gradient(135deg,rgba(14,165,233,0.96),rgba(37,99,235,0.92))]",
    glowClass: "shadow-[0_18px_35px_rgba(37,99,235,0.22)]",
  },
  {
    shellClass:
      "bg-[linear-gradient(135deg,rgba(56,189,248,0.94),rgba(14,116,144,0.92))]",
    glowClass: "shadow-[0_18px_35px_rgba(14,116,144,0.2)]",
  },
  {
    shellClass:
      "bg-[linear-gradient(135deg,rgba(96,165,250,0.94),rgba(59,130,246,0.88))]",
    glowClass: "shadow-[0_18px_35px_rgba(59,130,246,0.2)]",
  },
  {
    shellClass:
      "bg-[linear-gradient(135deg,rgba(125,211,252,0.94),rgba(29,78,216,0.88))]",
    glowClass: "shadow-[0_18px_35px_rgba(29,78,216,0.18)]",
  },
] as const;

function getAvatarInitials(name?: string | null) {
  const raw = String(name || "").trim();
  if (!raw) return "OD";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function fileToAvatarDataUrl(file: File, size = 160) {
  const src = await readFileAsDataUrl(file);
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to process image");

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = Math.max(0, (image.naturalWidth - side) / 2);
  const sy = Math.max(0, (image.naturalHeight - side) / 2);

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.84);
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function normalizeLanguage(value: unknown): LanguageCode {
  const v = String(value || "").toLowerCase();
  if (v === "es" || v === "de" || v === "fr" || v === "zh") return v;
  return "en";
}

function normalizeSettings(raw: unknown): AppSettings {
  const next = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const notifications =
    next.notifications && typeof next.notifications === "object"
      ? (next.notifications as Record<string, unknown>)
      : {};
  const safety =
    next.safety && typeof next.safety === "object" ? (next.safety as Record<string, unknown>) : {};
  const whitelist =
    safety.withdrawWhitelist && typeof safety.withdrawWhitelist === "object"
      ? (safety.withdrawWhitelist as Record<string, unknown>)
      : {};

  const defaultAsset = String(safety.defaultAsset || "").toUpperCase();
  const normalizedAsset = ASSETS.includes(defaultAsset as Asset) ? (defaultAsset as Asset) : "USDT";
  const avatarPresetRaw = Number(next.avatarPreset);
  const avatarPreset =
    Number.isInteger(avatarPresetRaw) && avatarPresetRaw >= 0 && avatarPresetRaw < AVATAR_PRESETS.length
      ? avatarPresetRaw
      : DEFAULT_SETTINGS.avatarPreset;
  const avatarImageDataUrl =
    typeof next.avatarImageDataUrl === "string" ? String(next.avatarImageDataUrl).slice(0, 400_000) : "";
  const avatarImageUrl =
    typeof next.avatarImageUrl === "string" ? String(next.avatarImageUrl).slice(0, 2_000) : "";
  const avatarStoragePath =
    typeof next.avatarStoragePath === "string" ? String(next.avatarStoragePath).slice(0, 280) : "";

  return {
    avatarPreset,
    avatarImageDataUrl,
    avatarImageUrl,
    avatarStoragePath,
    language: normalizeLanguage(next.language),
    notifications: {
      mailNotify:
        typeof notifications.mailNotify === "boolean"
          ? notifications.mailNotify
          : DEFAULT_SETTINGS.notifications.mailNotify,
      supportNotify:
        typeof notifications.supportNotify === "boolean"
          ? notifications.supportNotify
          : DEFAULT_SETTINGS.notifications.supportNotify,
      depositWithdrawNotify:
        typeof notifications.depositWithdrawNotify === "boolean"
          ? notifications.depositWithdrawNotify
          : DEFAULT_SETTINGS.notifications.depositWithdrawNotify,
    },
    safety: {
      defaultAsset: normalizedAsset,
      defaultNetwork: String(safety.defaultNetwork || DEFAULT_SETTINGS.safety.defaultNetwork),
      antiPhishingCode: String(safety.antiPhishingCode || "").slice(0, 24),
      withdrawWhitelist: {
        USDT: String(whitelist.USDT || "").slice(0, 140),
        BTC: String(whitelist.BTC || "").slice(0, 140),
        ETH: String(whitelist.ETH || "").slice(0, 140),
        SOL: String(whitelist.SOL || "").slice(0, 140),
        XRP: String(whitelist.XRP || "").slice(0, 140),
      },
    },
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [theme, setTheme] = useState<Theme>("light");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [accountAvatarPreset, setAccountAvatarPreset] = useState(DEFAULT_SETTINGS.avatarPreset);
  const [accountAvatarImageDataUrl, setAccountAvatarImageDataUrl] = useState("");
  const [accountAvatarImageUrl, setAccountAvatarImageUrl] = useState(DEFAULT_SETTINGS.avatarImageUrl);
  const [accountAvatarStoragePath, setAccountAvatarStoragePath] = useState(
    DEFAULT_SETTINGS.avatarStoragePath
  );
  const [accountEditOpen, setAccountEditOpen] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountInfo, setAccountInfo] = useState("");

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [savingNotification, setSavingNotification] = useState(false);
  const [savingSafety, setSavingSafety] = useState(false);
  const [settingsInfo, setSettingsInfo] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [securityInfo, setSecurityInfo] = useState("");

  const [logoutLoading, setLogoutLoading] = useState(false);
  const [pushState, setPushState] = useState<OneSignalPushState>({
    configured: isOneSignalConfigured(),
    supported: false,
    permissionGranted: false,
    optedIn: false,
    subscriptionId: null,
  });
  const [pushLoading, setPushLoading] = useState(false);

  const isLight = theme === "light";
  const avatarPreset = useMemo(
    () => AVATAR_PRESETS[accountAvatarPreset] || AVATAR_PRESETS[0],
    [accountAvatarPreset]
  );
  const avatarInitials = useMemo(() => getAvatarInitials(profile?.username), [profile?.username]);
  const accountAvatarPreview = accountAvatarImageDataUrl || accountAvatarImageUrl || "";

  useEffect(() => {
    const readTheme = () => {
      const v = document.documentElement.getAttribute("data-ob-theme");
      setTheme(v === "dark" ? "dark" : "light");
    };

    readTheme();
    const obs = new MutationObserver(readTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ob-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await getUserAuthHeaders();
      const res = await fetch("/api/profile", { cache: "no-store", headers });
      const json = (await res.json().catch(() => ({}))) as ProfileResp;
      if (res.status === 401 || json?.error === "Unauthorized") {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login?next=/settings");
        }
        throw new Error("Unauthorized");
      }
      if (!res.ok || !json?.ok || !json.profile) {
        throw new Error(json?.error || "Failed to load profile");
      }

      setProfile(json.profile);
      setUsername(String(json.profile.username || ""));
      setPhone(String(json.profile.phone || ""));
      setCountry(String(json.profile.country || ""));

      const token = await getUserAccessToken();
      if (!token) {
        throw new Error("Unauthorized");
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData.user) {
        throw new Error(userErr?.message || "Unauthorized");
      }
      const metadata =
        userData.user.user_metadata && typeof userData.user.user_metadata === "object"
          ? (userData.user.user_metadata as Record<string, unknown>)
          : {};
      const normalizedSettings = normalizeSettings(metadata[SETTINGS_METADATA_KEY]);
      setSettings(normalizedSettings);
      setAccountAvatarPreset(normalizedSettings.avatarPreset);
      setAccountAvatarImageDataUrl("");
      setAccountAvatarImageUrl(normalizedSettings.avatarImageUrl || normalizedSettings.avatarImageDataUrl);
      setAccountAvatarStoragePath(normalizedSettings.avatarStoragePath);

      if (isOneSignalConfigured()) {
        try {
          const state = await oneSignalGetPushState();
          setPushState(state);
          const uid = String(json.profile.id || "").trim();
          if (uid && state.permissionGranted) {
            await oneSignalLogin(uid);
          }
        } catch {
          setPushState({
            configured: true,
            supported: false,
            permissionGranted: false,
            optedIn: false,
            subscriptionId: null,
          });
        }
      }

      setError("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load settings";
      if (message !== "Unauthorized") setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistMetadata = useCallback(async (nextSettings: AppSettings) => {
    const token = await getUserAccessToken();
    if (!token) {
      throw new Error("Unauthorized");
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      throw new Error(userErr?.message || "Unauthorized");
    }
    const metadata =
      userData.user.user_metadata && typeof userData.user.user_metadata === "object"
        ? (userData.user.user_metadata as Record<string, unknown>)
        : {};
    const { error: upErr } = await supabase.auth.updateUser({
      data: {
        ...metadata,
        [SETTINGS_METADATA_KEY]: nextSettings,
      },
    });
    if (upErr) throw upErr;
  }, []);

  const saveAccount = async () => {
    try {
      setSavingAccount(true);
      setAccountInfo("");
      setError("");
      const headers = await getUserAuthHeaders();
      headers["Content-Type"] = "application/json";

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          username: username.trim(),
          phone: phone.trim(),
          country: country.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ProfileResp;
      if (res.status === 401 || json?.error === "Unauthorized") {
        router.replace("/login?next=/settings");
        return;
      }
      if (!res.ok || !json?.ok || !json.profile) {
        throw new Error(json?.error || "Failed to save account");
      }

      let nextAvatarImageUrl = accountAvatarImageUrl;
      let nextAvatarStoragePath = accountAvatarStoragePath;
      if (accountAvatarImageDataUrl) {
        const avatarRes = await fetch("/api/profile/avatar", {
          method: "POST",
          headers,
          body: JSON.stringify({ imageDataUrl: accountAvatarImageDataUrl }),
        });
        const avatarJson = (await avatarRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          publicUrl?: string;
          storagePath?: string;
        };
        if (!avatarRes.ok || !avatarJson.ok || !avatarJson.publicUrl || !avatarJson.storagePath) {
          throw new Error(avatarJson.error || "Failed to upload profile photo");
        }
        nextAvatarImageUrl = avatarJson.publicUrl;
        nextAvatarStoragePath = avatarJson.storagePath;
      } else if (!accountAvatarImageUrl && accountAvatarStoragePath) {
        const deleteRes = await fetch("/api/profile/avatar", {
          method: "DELETE",
          headers,
        });
        const deleteJson = (await deleteRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!deleteRes.ok || !deleteJson.ok) {
          throw new Error(deleteJson.error || "Failed to remove profile photo");
        }
        nextAvatarImageUrl = "";
        nextAvatarStoragePath = "";
      }

      const nextSettings = {
        ...settings,
        avatarPreset: accountAvatarPreset,
        avatarImageDataUrl: "",
        avatarImageUrl: nextAvatarImageUrl,
        avatarStoragePath: nextAvatarStoragePath,
      };
      await persistMetadata(nextSettings);
      setSettings(nextSettings);
      setAccountAvatarImageDataUrl("");
      setAccountAvatarImageUrl(nextAvatarImageUrl);
      setAccountAvatarStoragePath(nextAvatarStoragePath);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("opendex:settings-updated"));
      }

      setProfile((prev) => ({
        ...(prev || json.profile!),
        ...json.profile,
        email: json.profile?.email || prev?.email || null,
      }));
      setAccountEditOpen(false);
      setAccountInfo("Account updated.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save account";
      setError(message);
    } finally {
      setSavingAccount(false);
    }
  };

  const resetAccountDraft = useCallback(() => {
    setUsername(String(profile?.username || ""));
    setPhone(String(profile?.phone || ""));
    setCountry(String(profile?.country || ""));
    setAccountAvatarPreset(settings.avatarPreset);
    setAccountAvatarImageDataUrl("");
    setAccountAvatarImageUrl(settings.avatarImageUrl || settings.avatarImageDataUrl);
    setAccountAvatarStoragePath(settings.avatarStoragePath);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  }, [
    profile?.country,
    profile?.phone,
    profile?.username,
    settings.avatarImageDataUrl,
    settings.avatarImageUrl,
    settings.avatarPreset,
    settings.avatarStoragePath,
  ]);

  const openAvatarPicker = () => {
    avatarInputRef.current?.click();
  };

  const removeAvatarPhoto = () => {
    setAccountInfo("Profile photo will be removed after saving.");
    setAccountAvatarImageDataUrl("");
    setAccountAvatarImageUrl("");
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  };

  const onAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError("");
      setAccountInfo("");
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("Image must be smaller than 8MB.");
      }
      const avatarDataUrl = await fileToAvatarDataUrl(file);
      setAccountAvatarImageDataUrl(avatarDataUrl);
      setAccountInfo("Profile photo ready. Save changes to apply.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load image";
      setError(message);
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const toggleAccountEdit = () => {
    if (!accountEditOpen) {
      resetAccountDraft();
      setAccountInfo("");
    }
    setAccountEditOpen((prev) => !prev);
  };

  const cancelAccountEdit = () => {
    resetAccountDraft();
    setAccountEditOpen(false);
  };

  const saveNotifications = async () => {
    try {
      setSavingNotification(true);
      setSettingsInfo("");
      setError("");
      await persistMetadata(settings);
      setSettingsInfo("Notification settings saved.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save notifications";
      setError(message);
    } finally {
      setSavingNotification(false);
    }
  };

  const saveSafety = async () => {
    try {
      setSavingSafety(true);
      setSettingsInfo("");
      setError("");
      await persistMetadata(settings);
      setSettingsInfo("Wallet & safety settings saved.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save wallet & safety settings";
      setError(message);
    } finally {
      setSavingSafety(false);
    }
  };

  const changePassword = async () => {
    try {
      setSavingPassword(true);
      setSecurityInfo("");
      setError("");

      if (!currentPw) throw new Error("Current password is required.");
      if (newPw.length < 8) throw new Error("New password must be at least 8 characters.");
      if (newPw !== confirmPw) throw new Error("New passwords do not match.");

      const email = String(profile?.email || "").trim();
      if (!email) throw new Error("Email is missing on this account.");

      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPw,
      });
      if (verifyErr) throw new Error("Current password is incorrect.");

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;

      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setSecurityInfo("Password changed successfully.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to change password";
      setError(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const logoutCurrentDevice = async () => {
    const ok = window.confirm("Log out from this device?");
    if (!ok) return;
    try {
      setLogoutLoading(true);
      setError("");
      const { error: outErr } = await supabase.auth.signOut();
      if (outErr) throw outErr;
      router.replace("/login");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to log out";
      setError(message);
    } finally {
      setLogoutLoading(false);
    }
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/home");
  };

  const enablePhonePush = async () => {
    try {
      setPushLoading(true);
      setError("");

      const state = await oneSignalRequestPermission();
      setPushState(state);

      const uid = String(profile?.id || "").trim();
      if (uid && state.permissionGranted) {
        await oneSignalLogin(uid);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to enable phone push";
      setError(message);
    } finally {
      setPushLoading(false);
    }
  };

  const disablePhonePush = async () => {
    try {
      setPushLoading(true);
      setError("");
      const state = await oneSignalSetOptIn(false);
      setPushState(state);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to disable phone push";
      setError(message);
    } finally {
      setPushLoading(false);
    }
  };

  const activeLanguageLabel = useMemo(() => {
    const found = LANGUAGE_OPTIONS.find((row) => row.value === settings.language);
    return found?.label || "En";
  }, [settings.language]);

  return (
    <div className="px-4 pt-5 pb-24">
      <div className="mx-auto w-full max-w-[900px] space-y-4">
        <div className="flex items-center">
          <button
            type="button"
            onClick={goBack}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              isLight
                ? "border-slate-300 bg-white/80 text-slate-800 hover:bg-white"
                : "border-white/15 bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 6 9 12l6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
        ) : null}
        {accountInfo ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{accountInfo}</div>
        ) : null}
        {securityInfo ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{securityInfo}</div>
        ) : null}
        {settingsInfo ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{settingsInfo}</div>
        ) : null}

        {loading ? (
          <div className={`rounded-2xl border p-4 ${isLight ? "border-slate-300 bg-white text-slate-600" : "border-white/10 bg-white/5 text-white/70"}`}>
            Loading settings...
          </div>
        ) : null}

        {!loading ? (
          <>
            <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-300 bg-white" : "border-white/10 bg-white/5"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>1. Account</h2>
                  <div className={isLight ? "mt-1 text-sm text-slate-500" : "mt-1 text-sm text-white/60"}>
                    Profile information and preset avatar.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {accountEditOpen ? (
                    <button
                      type="button"
                      onClick={cancelAccountEdit}
                      className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold ${
                        isLight
                          ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                          : "border-white/15 bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleAccountEdit}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    {accountEditOpen ? "Close Edit" : "Edit"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
                <div className="flex flex-col items-center text-center sm:pt-1">
                  <div
                    className={[
                      "grid h-28 w-28 overflow-hidden rounded-full text-3xl font-bold text-white transition-transform duration-300",
                      "shadow-[0_18px_38px_rgba(37,99,235,0.18)] ring-4",
                      isLight ? "ring-white/80" : "ring-white/10",
                      avatarPreset.shellClass,
                      avatarPreset.glowClass,
                    ].join(" ")}
                  >
                    {accountAvatarPreview ? (
                      <NextImage
                        src={accountAvatarPreview}
                        alt="Profile avatar"
                        width={112}
                        height={112}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      avatarInitials
                    )}
                  </div>
                  <div className={`mt-3 text-base font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
                    {profile?.username || "User"}
                  </div>
                  <div className={isLight ? "mt-1 text-sm text-slate-500" : "mt-1 text-sm text-white/60"}>
                    {accountAvatarPreview ? "Gallery photo" : "Preset avatar"}
                  </div>
                  {accountEditOpen ? (
                    <>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          void onAvatarFileChange(event);
                        }}
                        className="hidden"
                      />
                      <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={openAvatarPicker}
                          className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold ${
                            isLight
                              ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                              : "border-white/15 bg-white/10 text-white hover:bg-white/15"
                          }`}
                        >
                          Choose Photo
                        </button>
                        {accountAvatarPreview ? (
                          <button
                            type="button"
                            onClick={removeAvatarPhoto}
                            className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold ${
                              isLight
                                ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                                : "border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                            }`}
                          >
                            Remove Photo
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        {AVATAR_PRESETS.map((preset, index) => {
                          const active = accountAvatarPreset === index;
                          return (
                            <button
                              key={`avatar-preset-${index}`}
                              type="button"
                              onClick={() => setAccountAvatarPreset(index)}
                              className={[
                                "grid h-11 w-11 place-items-center rounded-full border text-xs font-semibold text-white transition-all duration-200",
                                preset.shellClass,
                                active
                                  ? "scale-[1.06] border-white shadow-[0_14px_28px_rgba(37,99,235,0.24)]"
                                  : "border-white/50 opacity-75 hover:opacity-100",
                              ].join(" ")}
                              aria-label={`Choose avatar preset ${index + 1}`}
                            >
                              {avatarInitials}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>

                {!accountEditOpen ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { label: "Username", value: profile?.username || "-" },
                      { label: "Email", value: profile?.email || "-" },
                      { label: "Phone", value: profile?.phone || "-" },
                      { label: "Country", value: profile?.country || "-" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-2xl border px-4 py-3 ${
                          isLight ? "border-slate-200 bg-slate-50/80" : "border-white/10 bg-white/5"
                        }`}
                      >
                        <div className={isLight ? "text-xs uppercase tracking-wide text-slate-500" : "text-xs uppercase tracking-wide text-white/55"}>
                          {item.label}
                        </div>
                        <div className={`mt-1.5 text-sm font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm">
                        <span className={isLight ? "text-slate-600" : "text-white/70"}>Username</span>
                        <input
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                            isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                          }`}
                        />
                      </label>
                      <label className="text-sm">
                        <span className={isLight ? "text-slate-600" : "text-white/70"}>Email (read-only)</span>
                        <input
                          disabled
                          value={profile?.email || ""}
                          className={`mt-1 w-full rounded-xl border px-3 py-2 ${
                            isLight ? "border-slate-300 bg-slate-100 text-slate-700" : "border-white/10 bg-white/10 text-white/70"
                          }`}
                        />
                      </label>
                      <label className="text-sm">
                        <span className={isLight ? "text-slate-600" : "text-white/70"}>Phone</span>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                            isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                          }`}
                        />
                      </label>
                      <label className="text-sm">
                        <span className={isLight ? "text-slate-600" : "text-white/70"}>Country</span>
                        <input
                          value={country}
                          onChange={(e) => setCountry(e.target.value.toUpperCase())}
                          className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                            isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                          }`}
                        />
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveAccount()}
                        disabled={savingAccount}
                        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingAccount ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-300 bg-white" : "border-white/10 bg-white/5"}`}>
              <h2 className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>2. Security</h2>
              <div className={`mt-2 space-y-1 text-sm ${isLight ? "text-slate-700" : "text-white/75"}`}>
                <div>Last sign-in: {fmtDateTime(profile?.last_sign_in_at)}</div>
                <div>Last password reset request: {fmtDateTime(profile?.last_password_reset_request_at)}</div>
                <div>
                  2FA: <span className="font-semibold text-amber-300">Coming soon (Authenticator app)</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className={`rounded-xl border px-3 py-2 outline-none ${
                    isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                  }`}
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={`rounded-xl border px-3 py-2 outline-none ${
                    isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                  }`}
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={`rounded-xl border px-3 py-2 outline-none ${
                    isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                  }`}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void changePassword()}
                  disabled={savingPassword}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPassword ? "Updating..." : "Change Password"}
                </button>
              </div>
            </section>

            <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-300 bg-white" : "border-white/10 bg-white/5"}`}>
              <h2 className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>3. Notifications</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    isLight ? "border-slate-300 bg-slate-50 text-slate-800" : "border-white/10 bg-black/30 text-white/85"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Phone push notification</span>
                    <span className="text-xs opacity-80">
                      {!pushState.configured
                        ? "Not configured"
                        : !pushState.supported
                          ? "Not supported on this browser"
                          : pushState.optedIn
                            ? "Enabled"
                            : pushState.permissionGranted
                              ? "Disabled"
                              : "Permission needed"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void enablePhonePush()}
                      disabled={pushLoading || !pushState.configured}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pushLoading ? "Working..." : "Enable Push"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void disablePhonePush()}
                      disabled={pushLoading || !pushState.configured}
                      className="inline-flex items-center justify-center rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Disable Push
                    </button>
                  </div>
                  {pushState.configured && !pushState.supported ? (
                    <div className="mt-2 text-xs text-amber-300">
                      Push is not supported on this browser. On iPhone, install the app to Home Screen first.
                    </div>
                  ) : null}
                </div>

                <label className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  isLight ? "border-slate-300 bg-slate-50 text-slate-800" : "border-white/10 bg-black/30 text-white/85"
                }`}>
                  <span>Mail notify</span>
                  <input
                    type="checkbox"
                    checked={settings.notifications.mailNotify}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        notifications: { ...prev.notifications, mailNotify: e.target.checked },
                      }))
                    }
                  />
                </label>
                <label className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  isLight ? "border-slate-300 bg-slate-50 text-slate-800" : "border-white/10 bg-black/30 text-white/85"
                }`}>
                  <span>Support message notify</span>
                  <input
                    type="checkbox"
                    checked={settings.notifications.supportNotify}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        notifications: { ...prev.notifications, supportNotify: e.target.checked },
                      }))
                    }
                  />
                </label>
                <label className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  isLight ? "border-slate-300 bg-slate-50 text-slate-800" : "border-white/10 bg-black/30 text-white/85"
                }`}>
                  <span>Deposit / Withdraw alert</span>
                  <input
                    type="checkbox"
                    checked={settings.notifications.depositWithdrawNotify}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        notifications: { ...prev.notifications, depositWithdrawNotify: e.target.checked },
                      }))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void saveNotifications()}
                disabled={savingNotification}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingNotification ? "Saving..." : "Save Notifications"}
              </button>
            </section>

            <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-300 bg-white" : "border-white/10 bg-white/5"}`}>
              <h2 className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>4. Wallet & Safety</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm">
                  <span className={isLight ? "text-slate-600" : "text-white/70"}>Default asset</span>
                  <select
                    value={settings.safety.defaultAsset}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        safety: { ...prev.safety, defaultAsset: e.target.value as Asset },
                      }))
                    }
                    className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                      isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                    }`}
                  >
                    {ASSETS.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={isLight ? "text-slate-600" : "text-white/70"}>Default network</span>
                  <select
                    value={settings.safety.defaultNetwork}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        safety: { ...prev.safety, defaultNetwork: e.target.value },
                      }))
                    }
                    className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                      isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                    }`}
                  >
                    {NETWORK_OPTIONS.map((network) => (
                      <option key={network} value={network}>
                        {network}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={isLight ? "text-slate-600" : "text-white/70"}>Language ({activeLanguageLabel})</span>
                  <select
                    value={settings.language}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        language: normalizeLanguage(e.target.value),
                      }))
                    }
                    className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                      isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                    }`}
                  >
                    {LANGUAGE_OPTIONS.map((row) => (
                      <option key={row.value} value={row.value}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block text-sm">
                <span className={isLight ? "text-slate-600" : "text-white/70"}>Anti-phishing code</span>
                <input
                  placeholder="e.g. opendex-SAFE"
                  value={settings.safety.antiPhishingCode}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      safety: { ...prev.safety, antiPhishingCode: e.target.value.slice(0, 24) },
                    }))
                  }
                  className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                    isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                  }`}
                />
              </label>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {ASSETS.map((asset) => (
                  <label key={asset} className="text-sm">
                    <span className={isLight ? "text-slate-600" : "text-white/70"}>{asset} whitelist address</span>
                    <input
                      placeholder={`${asset} address`}
                      value={settings.safety.withdrawWhitelist[asset]}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          safety: {
                            ...prev.safety,
                            withdrawWhitelist: {
                              ...prev.safety.withdrawWhitelist,
                              [asset]: e.target.value.slice(0, 140),
                            },
                          },
                        }))
                      }
                      className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none ${
                        isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-black/30 text-white"
                      }`}
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void saveSafety()}
                disabled={savingSafety}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSafety ? "Saving..." : "Save Wallet & Safety"}
              </button>
            </section>

            <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-300 bg-white" : "border-white/10 bg-white/5"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>Log out</h2>
                  <div className={isLight ? "mt-1 text-sm text-slate-500" : "mt-1 text-sm text-white/60"}>
                    Sign out from this device.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void logoutCurrentDevice()}
                  disabled={logoutLoading}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {logoutLoading ? "Logging out..." : "Log out"}
                </button>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
