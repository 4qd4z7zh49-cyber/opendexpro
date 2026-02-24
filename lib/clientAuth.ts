"use client";

import { supabase } from "@/lib/supabaseClient";

const AUTH_STORAGE_KEY = "openbookpro.auth.session";

function normalizeClientAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("supabasekey is required")) {
    return new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (lower.includes("supabase url is required")) {
    return new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  }
  return error instanceof Error ? error : new Error(message || "Auth error");
}

function recoverableAuthError(message: string) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("invalid refresh token") ||
    lower.includes("refresh token not found") ||
    lower.includes("refresh token is invalid") ||
    lower.includes("jwt expired") ||
    lower.includes("auth session missing")
  );
}

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function clearStoredSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore local storage errors
  }
}

async function clearBrokenClientSession() {
  clearStoredSession();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore sign-out cleanup errors
  }
}

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as
      | {
          currentSession?: {
            access_token?: unknown;
            refresh_token?: unknown;
            expires_at?: unknown;
          } | null;
          access_token?: unknown;
          refresh_token?: unknown;
          expires_at?: unknown;
        }
      | null;

    const source = parsed?.currentSession && typeof parsed.currentSession === "object"
      ? parsed.currentSession
      : parsed;

    if (!source || typeof source !== "object") return null;

    const accessToken = String(source.access_token || "").trim();
    const refreshToken = String(source.refresh_token || "").trim();
    const expiresAt = Number(source.expires_at || 0);

    if (!accessToken) return null;

    return {
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    };
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function getUserAccessToken() {
  try {
    const stored = readStoredSession();
    if (!stored?.accessToken) return "";
    if (!stored.refreshToken) {
      await clearBrokenClientSession();
      return "";
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (stored.expiresAt > nowSec + 15) {
      return stored.accessToken;
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) {
      if (recoverableAuthError(sessionErr.message)) {
        await clearBrokenClientSession();
        return "";
      }
      throw sessionErr;
    }

    return sessionData.session?.access_token || "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (recoverableAuthError(message)) {
      await clearBrokenClientSession();
      return "";
    }
    throw normalizeClientAuthError(error);
  }
}

export async function getUserAuthHeaders(): Promise<Record<string, string>> {
  const token = await getUserAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isUnauthorizedMessage(message: string) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("unauthorized") ||
    lower.includes("jwt") ||
    lower.includes("auth session missing") ||
    lower.includes("refresh token")
  );
}
