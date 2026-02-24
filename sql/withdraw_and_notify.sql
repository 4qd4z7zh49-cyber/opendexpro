-- Withdraw requests + Admin notify messages
-- Safe to run multiple times.

create table if not exists public.withdraw_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  admin_id uuid references public.admins(id),
  asset text not null default 'USDT'
    check (asset = any (array['USDT'::text, 'BTC'::text, 'ETH'::text, 'SOL'::text, 'XRP'::text])),
  amount numeric not null check (amount > 0),
  wallet_address text not null,
  status text not null default 'PENDING'
    check (status = any (array['PENDING'::text, 'CONFIRMED'::text, 'FROZEN'::text])),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_withdraw_requests_user_created
  on public.withdraw_requests (user_id, created_at desc);

create index if not exists idx_withdraw_requests_admin_status
  on public.withdraw_requests (admin_id, status, created_at desc);

create index if not exists idx_withdraw_requests_status_created
  on public.withdraw_requests (status, created_at desc);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  admin_id uuid references public.admins(id),
  subject text not null,
  message text not null,
  status text not null default 'PENDING'
    check (status = any (array['PENDING'::text, 'CONFIRMED'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_status
  on public.user_notifications (user_id, status, created_at desc);

create index if not exists idx_user_notifications_admin_created
  on public.user_notifications (admin_id, created_at desc);
