-- Forgot-password cooldown table (safe to run multiple times)
-- Rule: one reset request per email every 3 days.

create table if not exists public.password_reset_limits (
  email text primary key,
  last_reset_at timestamptz not null default now()
);

