import type { SupabaseClient } from "@supabase/supabase-js";

export type UserAccessState = {
  tradeRestricted: boolean;
  miningRestricted: boolean;
  source: "db" | "memory" | "default";
};

type UserAccessCore = {
  tradeRestricted: boolean;
  miningRestricted: boolean;
};

type UserAccessRow = {
  user_id: string;
  trade_restricted: boolean | null;
  mining_restricted: boolean | null;
};

type UserAccessCache = Map<string, UserAccessCore>;

declare global {
  var __openbookUserAccessCache: UserAccessCache | undefined;
}

function getCache(): UserAccessCache {
  if (!globalThis.__openbookUserAccessCache) {
    globalThis.__openbookUserAccessCache = new Map<string, UserAccessCore>();
  }
  return globalThis.__openbookUserAccessCache;
}

function isMissingTableError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const message = String(e.message || "").toLowerCase();
  return e.code === "42P01" || message.includes("user_access_controls");
}

function normalizeCore(input?: Partial<UserAccessCore> | null): UserAccessCore {
  return {
    tradeRestricted: Boolean(input?.tradeRestricted ?? false),
    miningRestricted: Boolean(input?.miningRestricted ?? false),
  };
}

function mapRow(row?: UserAccessRow | null): UserAccessCore {
  if (!row) return normalizeCore(null);
  return normalizeCore({
    tradeRestricted: row.trade_restricted ?? false,
    miningRestricted: row.mining_restricted ?? false,
  });
}

export async function getUserAccessForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<UserAccessState> {
  const { data, error } = await supabase
    .from("user_access_controls")
    .select("trade_restricted,mining_restricted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (!isMissingTableError(error)) throw error;
    const fallback = getCache().get(userId);
    if (!fallback) return { ...normalizeCore(null), source: "default" };
    return { ...normalizeCore(fallback), source: "memory" };
  }

  return {
    ...mapRow((data as UserAccessRow | null | undefined) ?? null),
    source: data ? "db" : "default",
  };
}

export async function getUserAccessForUsers(supabase: SupabaseClient, userIds: string[]) {
  const result: Record<string, UserAccessState> = {};
  if (userIds.length === 0) return result;

  const { data, error } = await supabase
    .from("user_access_controls")
    .select("user_id, trade_restricted, mining_restricted")
    .in("user_id", userIds);

  if (error) {
    if (!isMissingTableError(error)) throw error;
    const cache = getCache();
    userIds.forEach((uid) => {
      const fallback = cache.get(uid);
      if (fallback) {
        result[uid] = { ...normalizeCore(fallback), source: "memory" };
      } else {
        result[uid] = { ...normalizeCore(null), source: "default" };
      }
    });
    return result;
  }

  const rowMap = new Map<string, UserAccessCore>();
  (data as UserAccessRow[] | null)?.forEach((row) => {
    rowMap.set(String(row.user_id), mapRow(row));
  });

  userIds.forEach((uid) => {
    const row = rowMap.get(uid);
    if (row) result[uid] = { ...row, source: "db" };
    else result[uid] = { ...normalizeCore(null), source: "default" };
  });

  return result;
}

export async function setUserAccessForUser(
  supabase: SupabaseClient,
  userId: string,
  next: UserAccessCore
): Promise<UserAccessState> {
  const clean = normalizeCore(next);

  const { error } = await supabase
    .from("user_access_controls")
    .upsert(
      {
        user_id: userId,
        trade_restricted: clean.tradeRestricted,
        mining_restricted: clean.miningRestricted,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    if (!isMissingTableError(error)) throw error;
    getCache().set(userId, clean);
    return { ...clean, source: "memory" };
  }

  return { ...clean, source: "db" };
}
