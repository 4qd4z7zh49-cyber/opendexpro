function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim() || requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey() {
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}
