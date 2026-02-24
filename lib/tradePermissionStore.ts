import type { SupabaseClient } from "@supabase/supabase-js";

export type TradePermissionMode =
  | "BUY_ALL_WIN"
  | "SELL_ALL_WIN"
  | "RANDOM_WIN_LOSS"
  | "ALL_LOSS";

export type TradePermission = {
  permissionMode: TradePermissionMode;
  buyEnabled: boolean;
  sellEnabled: boolean;
  source: "db" | "memory" | "default";
};

type PermissionCore = {
  permissionMode: TradePermissionMode;
  buyEnabled: boolean;
  sellEnabled: boolean;
};

type PermissionRow = {
  user_id: string;
  permission_mode?: string | null;
  buy_enabled?: boolean | null;
  sell_enabled?: boolean | null;
};

type PermissionCache = Map<string, PermissionCore>;

declare global {
  var __opendexTradePermissionCache: PermissionCache | undefined;
}

const TRADE_PERMISSION_MODES: readonly TradePermissionMode[] = [
  "BUY_ALL_WIN",
  "SELL_ALL_WIN",
  "RANDOM_WIN_LOSS",
  "ALL_LOSS",
];

function getCache(): PermissionCache {
  if (!globalThis.__opendexTradePermissionCache) {
    globalThis.__opendexTradePermissionCache = new Map<string, PermissionCore>();
  }
  return globalThis.__opendexTradePermissionCache;
}

function isMissingTableError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const message = String(e.message || "").toLowerCase();
  return e.code === "42P01" || message.includes("trade_permissions");
}

function isMissingColumnError(err: unknown, column: string) {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const message = String(e.message || "").toLowerCase();
  return e.code === "42703" && message.includes(column.toLowerCase());
}

function modeToBuySell(mode: TradePermissionMode) {
  if (mode === "BUY_ALL_WIN") return { buyEnabled: true, sellEnabled: false };
  if (mode === "SELL_ALL_WIN") return { buyEnabled: false, sellEnabled: true };
  if (mode === "RANDOM_WIN_LOSS") return { buyEnabled: true, sellEnabled: true };
  return { buyEnabled: false, sellEnabled: false };
}

function legacyModeFromBuySell(buyEnabled: boolean, sellEnabled: boolean): TradePermissionMode {
  if (buyEnabled && !sellEnabled) return "BUY_ALL_WIN";
  if (!buyEnabled && sellEnabled) return "SELL_ALL_WIN";
  if (buyEnabled && sellEnabled) return "RANDOM_WIN_LOSS";
  return "ALL_LOSS";
}

function normalizeMode(v: unknown): TradePermissionMode | null {
  const raw = String(v || "").trim().toUpperCase();
  if ((TRADE_PERMISSION_MODES as readonly string[]).includes(raw)) {
    return raw as TradePermissionMode;
  }
  return null;
}

function normalizeRow(row?: Partial<PermissionRow> | null): PermissionCore {
  const mode =
    normalizeMode(row?.permission_mode) ??
    legacyModeFromBuySell(Boolean(row?.buy_enabled ?? false), Boolean(row?.sell_enabled ?? false));
  const flags = modeToBuySell(mode);
  return {
    permissionMode: mode,
    buyEnabled: flags.buyEnabled,
    sellEnabled: flags.sellEnabled,
  };
}

async function getLegacyPermissionForUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("trade_permissions")
    .select("buy_enabled, sell_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...normalizeRow(null), source: "default" as const };
  return { ...normalizeRow(data), source: "db" as const };
}

async function getLegacyPermissionsForUsers(supabase: SupabaseClient, userIds: string[]) {
  const result: Record<string, TradePermission> = {};
  const { data, error } = await supabase
    .from("trade_permissions")
    .select("user_id, buy_enabled, sell_enabled")
    .in("user_id", userIds);

  if (error) throw error;

  const rowMap = new Map<string, PermissionCore>();
  (data as PermissionRow[] | null)?.forEach((row) => {
    rowMap.set(String(row.user_id), normalizeRow(row));
  });

  userIds.forEach((uid) => {
    const row = rowMap.get(uid);
    result[uid] = row
      ? { ...row, source: "db" }
      : { ...normalizeRow(null), source: "default" };
  });

  return result;
}

export async function getPermissionForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TradePermission> {
  const { data, error } = await supabase
    .from("trade_permissions")
    .select("permission_mode, buy_enabled, sell_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error, "permission_mode")) {
      try {
        return await getLegacyPermissionForUser(supabase, userId);
      } catch (legacyError) {
        if (!isMissingTableError(legacyError)) throw legacyError;
        const fallback = getCache().get(userId);
        if (!fallback) return { ...normalizeRow(null), source: "default" };
        return { ...fallback, source: "memory" };
      }
    }

    if (!isMissingTableError(error)) throw error;
    const fallback = getCache().get(userId);
    if (!fallback) return { ...normalizeRow(null), source: "default" };
    return { ...fallback, source: "memory" };
  }

  if (!data) return { ...normalizeRow(null), source: "default" };
  return {
    ...normalizeRow(data),
    source: "db",
  };
}

export async function getPermissionsForUsers(
  supabase: SupabaseClient,
  userIds: string[]
) {
  const result: Record<string, TradePermission> = {};

  if (userIds.length === 0) return result;

  const { data, error } = await supabase
    .from("trade_permissions")
    .select("user_id, permission_mode, buy_enabled, sell_enabled")
    .in("user_id", userIds);

  if (error) {
    if (isMissingColumnError(error, "permission_mode")) {
      try {
        return await getLegacyPermissionsForUsers(supabase, userIds);
      } catch (legacyError) {
        if (!isMissingTableError(legacyError)) throw legacyError;
        const cache = getCache();
        userIds.forEach((uid) => {
          const fallback = cache.get(uid);
          result[uid] = fallback
            ? { ...fallback, source: "memory" }
            : { ...normalizeRow(null), source: "default" };
        });
        return result;
      }
    }

    if (!isMissingTableError(error)) throw error;
    const cache = getCache();
    userIds.forEach((uid) => {
      const fallback = cache.get(uid);
      result[uid] = fallback
        ? { ...fallback, source: "memory" }
        : { ...normalizeRow(null), source: "default" };
    });
    return result;
  }

  const rowMap = new Map<string, PermissionCore>();
  (data as PermissionRow[] | null)?.forEach((row) => {
    rowMap.set(String(row.user_id), normalizeRow(row));
  });

  userIds.forEach((uid) => {
    const row = rowMap.get(uid);
    result[uid] = row ? { ...row, source: "db" } : { ...normalizeRow(null), source: "default" };
  });

  return result;
}

export async function setPermissionForUser(
  supabase: SupabaseClient,
  userId: string,
  next: Pick<PermissionCore, "permissionMode">
): Promise<TradePermission> {
  const normalized = normalizeRow({ permission_mode: next.permissionMode });

  const { error } = await supabase
    .from("trade_permissions")
    .upsert(
      {
        user_id: userId,
        permission_mode: normalized.permissionMode,
        buy_enabled: normalized.buyEnabled,
        sell_enabled: normalized.sellEnabled,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    if (isMissingColumnError(error, "permission_mode")) {
      const { error: legacyError } = await supabase
        .from("trade_permissions")
        .upsert(
          {
            user_id: userId,
            buy_enabled: normalized.buyEnabled,
            sell_enabled: normalized.sellEnabled,
          },
          { onConflict: "user_id" }
        );

      if (legacyError) {
        if (!isMissingTableError(legacyError)) throw legacyError;
        getCache().set(userId, normalized);
        return { ...normalized, source: "memory" };
      }

      return { ...normalized, source: "db" };
    }

    if (!isMissingTableError(error)) throw error;
    getCache().set(userId, normalized);
    return { ...normalized, source: "memory" };
  }

  return { ...normalized, source: "db" };
}
