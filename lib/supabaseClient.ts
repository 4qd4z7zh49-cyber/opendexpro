import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Server build / prerender time မှာ မပြတ်အောင် throw မလုပ်
  if (!url || !key) {
    if (typeof window !== "undefined") {
      throw new Error("Supabase env vars are missing");
    }
    return null;
  }

  return { url, key };
}

export function getSupabaseClient() {
  if (_client) return _client;

  const env = requireEnv();
  if (!env) {
    // SSR/build time: return null client – caller should only call in client events
    // (login/signup submit handler တွေက client ဖြစ်လို့ OK)
    return null as unknown as SupabaseClient;
  }

  _client = createClient(env.url, env.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "opendex.auth.session",
    },
  });
  return _client;
}

// Backward compatible export (existing code မပျက်စေဖို့)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getSupabaseClient();
    return Reflect.get(c as object, prop);
  },
});
