create table if not exists public.admin_deposit_addresses (
  admin_id uuid not null references public.admins(id) on delete cascade,
  asset text not null check (asset = any (array['USDT'::text, 'BTC'::text, 'ETH'::text, 'SOL'::text, 'XRP'::text])),
  address text not null default ''::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (admin_id, asset)
);

create table if not exists public.deposit_history (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references public.admins(id) on delete set null,
  asset text not null check (asset = any (array['USDT'::text, 'BTC'::text, 'ETH'::text, 'SOL'::text, 'XRP'::text])),
  amount numeric not null check (amount > 0),
  wallet_address text not null,
  status text not null default 'PENDING'::text check (status = any (array['PENDING'::text, 'CONFIRMED'::text, 'REJECTED'::text])),
  created_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists idx_deposit_history_user_created_at
  on public.deposit_history(user_id, created_at desc);

alter table public.admin_deposit_addresses enable row level security;
alter table public.deposit_history enable row level security;

drop policy if exists "service_role_all_admin_deposit_addresses" on public.admin_deposit_addresses;
create policy "service_role_all_admin_deposit_addresses"
on public.admin_deposit_addresses
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_deposit_history" on public.deposit_history;
create policy "service_role_all_deposit_history"
on public.deposit_history
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
