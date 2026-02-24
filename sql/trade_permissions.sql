-- Trade permission modes (safe to run multiple times)

create table if not exists public.trade_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  permission_mode text not null default 'ALL_LOSS'
    check (permission_mode = any (array[
      'BUY_ALL_WIN'::text,
      'SELL_ALL_WIN'::text,
      'RANDOM_WIN_LOSS'::text,
      'ALL_LOSS'::text
    ])),
  buy_enabled boolean not null default false,
  sell_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table if exists public.trade_permissions
  add column if not exists permission_mode text;

alter table if exists public.trade_permissions
  alter column permission_mode set default 'ALL_LOSS';

-- backfill permission_mode from old buy/sell flags for existing rows
do $$
begin
  update public.trade_permissions
  set permission_mode = case
    when buy_enabled = true and sell_enabled = false then 'BUY_ALL_WIN'
    when buy_enabled = false and sell_enabled = true then 'SELL_ALL_WIN'
    when buy_enabled = true and sell_enabled = true then 'RANDOM_WIN_LOSS'
    else 'ALL_LOSS'
  end
  where permission_mode is null
     or permission_mode not in ('BUY_ALL_WIN', 'SELL_ALL_WIN', 'RANDOM_WIN_LOSS', 'ALL_LOSS');
exception
  when undefined_table then
    null;
end $$;

-- keep legacy flags in sync with mode
update public.trade_permissions
set
  buy_enabled = case
    when permission_mode in ('BUY_ALL_WIN', 'RANDOM_WIN_LOSS') then true
    else false
  end,
  sell_enabled = case
    when permission_mode in ('SELL_ALL_WIN', 'RANDOM_WIN_LOSS') then true
    else false
  end;

-- ensure check constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trade_permissions_permission_mode_check'
  ) THEN
    ALTER TABLE public.trade_permissions
      ADD CONSTRAINT trade_permissions_permission_mode_check
      CHECK (permission_mode = ANY (ARRAY['BUY_ALL_WIN'::text, 'SELL_ALL_WIN'::text, 'RANDOM_WIN_LOSS'::text, 'ALL_LOSS'::text]));
  END IF;
END $$;

alter table if exists public.trade_permissions enable row level security;

drop policy if exists "service_role_all_trade_permissions" on public.trade_permissions;
create policy "service_role_all_trade_permissions"
on public.trade_permissions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
