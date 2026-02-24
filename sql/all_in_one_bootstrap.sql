-- OpenBook: all-in-one bootstrap SQL
-- Safe to run multiple times.
--
-- Usage:
--   psql "postgres://..." -f sql/all_in_one_bootstrap.sql
--
-- Note:
-- - This script expects Supabase auth schema (`auth.users`) to already exist.
-- - It creates all app tables/RPCs used by this project in one run.

create extension if not exists pgcrypto;

-- Shared helper trigger for updated_at columns.
create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Base tables missing from sql/*.sql migrations
-- ============================================================================

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  role text not null default 'admin',
  invitation_code text,
  managed_by uuid references public.admins(id) on delete set null,
  password_hash text,
  hashed_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.admins add column if not exists username text;
alter table if exists public.admins add column if not exists role text;
alter table if exists public.admins add column if not exists invitation_code text;
alter table if exists public.admins add column if not exists managed_by uuid;
alter table if exists public.admins add column if not exists password_hash text;
alter table if exists public.admins add column if not exists hashed_password text;
alter table if exists public.admins add column if not exists created_at timestamptz not null default now();
alter table if exists public.admins add column if not exists updated_at timestamptz not null default now();
alter table if exists public.admins alter column role set default 'admin';

-- Hash column compatibility (old schema may use hashed_password).
update public.admins
set password_hash = hashed_password
where coalesce(password_hash, '') = '' and coalesce(hashed_password, '') <> '';

update public.admins
set hashed_password = password_hash
where coalesce(hashed_password, '') = '' and coalesce(password_hash, '') <> '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admins_role_check'
      and conrelid = 'public.admins'::regclass
  ) then
    alter table public.admins
      add constraint admins_role_check
      check (role = any (array['admin'::text, 'superadmin'::text, 'sub-admin'::text, 'subadmin'::text]));
  end if;
end $$;

create unique index if not exists idx_admins_username_lower_unique
  on public.admins (lower(username));

create unique index if not exists idx_admins_invitation_code_unique
  on public.admins (invitation_code)
  where invitation_code is not null and btrim(invitation_code) <> '';

create index if not exists idx_admins_managed_by on public.admins(managed_by);
create index if not exists idx_admins_created_at on public.admins(created_at desc);


create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  phone text,
  country text,
  role text not null default 'user',
  status text,
  invitation_code text,
  sub_admin_id uuid references public.admins(id) on delete set null,
  managed_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profiles add column if not exists username text;
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists phone text;
alter table if exists public.profiles add column if not exists country text;
alter table if exists public.profiles add column if not exists role text;
alter table if exists public.profiles add column if not exists status text;
alter table if exists public.profiles add column if not exists invitation_code text;
alter table if exists public.profiles add column if not exists sub_admin_id uuid;
alter table if exists public.profiles add column if not exists managed_by uuid;
alter table if exists public.profiles add column if not exists created_at timestamptz not null default now();
alter table if exists public.profiles add column if not exists updated_at timestamptz not null default now();
alter table if exists public.profiles alter column role set default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role = any (array[
        'user'::text,
        'admin'::text,
        'superadmin'::text,
        'sub-admin'::text,
        'subadmin'::text
      ]));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_sub_admin_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_sub_admin_id_fkey
      foreign key (sub_admin_id) references public.admins(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_managed_by_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_managed_by_fkey
      foreign key (managed_by) references public.admins(id) on delete set null;
  end if;
end $$;

create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_profiles_managed_by on public.profiles(managed_by);
create index if not exists idx_profiles_email_lower on public.profiles(lower(email));
create index if not exists idx_profiles_invitation_code on public.profiles(invitation_code);


create table if not exists public.balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table if exists public.balances add column if not exists user_id uuid;
alter table if exists public.balances add column if not exists balance numeric not null default 0;
alter table if exists public.balances add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_balances_user_id_unique on public.balances(user_id);


create table if not exists public.holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text not null,
  balance numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, asset)
);

alter table if exists public.holdings add column if not exists user_id uuid;
alter table if exists public.holdings add column if not exists asset text;
alter table if exists public.holdings add column if not exists balance numeric not null default 0;
alter table if exists public.holdings add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'holdings_asset_check'
      and conrelid = 'public.holdings'::regclass
  ) then
    alter table public.holdings
      add constraint holdings_asset_check
      check (asset = any (array['USDT'::text, 'BTC'::text, 'ETH'::text, 'SOL'::text, 'XRP'::text]));
  end if;
end $$;

create unique index if not exists idx_holdings_user_asset_unique on public.holdings(user_id, asset);
create index if not exists idx_holdings_user_id on public.holdings(user_id);
create index if not exists idx_holdings_asset on public.holdings(asset);


create table if not exists public.topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references public.admins(id) on delete set null,
  amount numeric not null,
  asset text not null default 'USDT',
  note text,
  created_at timestamptz not null default now()
);

alter table if exists public.topups add column if not exists id uuid default gen_random_uuid();
alter table if exists public.topups add column if not exists user_id uuid;
alter table if exists public.topups add column if not exists admin_id uuid;
alter table if exists public.topups add column if not exists amount numeric;
alter table if exists public.topups add column if not exists asset text default 'USDT';
alter table if exists public.topups add column if not exists note text;
alter table if exists public.topups add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'topups_asset_check'
      and conrelid = 'public.topups'::regclass
  ) then
    alter table public.topups
      add constraint topups_asset_check
      check (asset = any (array['USDT'::text, 'BTC'::text, 'ETH'::text, 'SOL'::text, 'XRP'::text]));
  end if;
end $$;

create index if not exists idx_topups_user_created_at on public.topups(user_id, created_at desc);
create index if not exists idx_topups_admin_created_at on public.topups(admin_id, created_at desc);


create table if not exists public.mining_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  amount numeric not null check (amount > 0),
  status text not null default 'PENDING',
  note text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table if exists public.mining_orders add column if not exists user_id uuid;
alter table if exists public.mining_orders add column if not exists plan_id text;
alter table if exists public.mining_orders add column if not exists amount numeric;
alter table if exists public.mining_orders add column if not exists status text default 'PENDING';
alter table if exists public.mining_orders add column if not exists note text;
alter table if exists public.mining_orders add column if not exists created_at timestamptz not null default now();
alter table if exists public.mining_orders add column if not exists activated_at timestamptz;
alter table if exists public.mining_orders add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mining_orders_status_check'
      and conrelid = 'public.mining_orders'::regclass
  ) then
    alter table public.mining_orders
      add constraint mining_orders_status_check
      check (status = any (array[
        'PENDING'::text,
        'ACTIVE'::text,
        'REJECTED'::text,
        'ABORTED'::text,
        'COMPLETED'::text
      ]));
  end if;
end $$;

create index if not exists idx_mining_orders_user_created on public.mining_orders(user_id, created_at desc);
create index if not exists idx_mining_orders_status_created on public.mining_orders(status, created_at desc);


create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.orders add column if not exists user_id uuid;
alter table if exists public.orders add column if not exists result text;
alter table if exists public.orders add column if not exists created_at timestamptz not null default now();
alter table if exists public.orders add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_result_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_result_check
      check (
        result is null
        or result = any (array['WIN'::text, 'LOSE'::text])
      );
  end if;
end $$;

create index if not exists idx_orders_user_created on public.orders(user_id, created_at desc);

-- updated_at triggers for base tables
drop trigger if exists trg_admins_updated_at on public.admins;
create trigger trg_admins_updated_at
before update on public.admins
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_balances_updated_at on public.balances;
create trigger trg_balances_updated_at
before update on public.balances
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_holdings_updated_at on public.holdings;
create trigger trg_holdings_updated_at
before update on public.holdings
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_mining_orders_updated_at on public.mining_orders;
create trigger trg_mining_orders_updated_at
before update on public.mining_orders
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at_column();

-- ============================================================================
-- RPCs required by current API routes
-- ============================================================================

create or replace function public.admin_verify_login(
  p_username text,
  p_password text
)
returns table(id uuid, role text, username text)
language sql
security definer
set search_path = public, extensions
as $$
  select a.id, a.role, a.username
  from public.admins a
  where lower(a.username) = lower(trim(coalesce(p_username, '')))
    and (
      case
        when coalesce(a.password_hash, a.hashed_password, '') = '' then false
        else coalesce(a.password_hash, a.hashed_password)
          = crypt(coalesce(p_password, ''), coalesce(a.password_hash, a.hashed_password))
      end
    )
  limit 1;
$$;

revoke all on function public.admin_verify_login(text, text) from public;
grant execute on function public.admin_verify_login(text, text) to service_role;


create or replace function public.admin_create_subadmin(
  p_username text,
  p_password text,
  p_managed_by uuid
)
returns table(
  id uuid,
  username text,
  role text,
  invitation_code text,
  managed_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := trim(coalesce(p_username, ''));
  v_password text := coalesce(p_password, '');
  v_manager_role text;
  v_invite text := null;
  v_hash text;
  v_attempt int;
  v_row public.admins%rowtype;
begin
  if v_username = '' then
    raise exception 'username is required';
  end if;

  if length(v_password) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;

  if length(v_password) > 72 then
    raise exception 'password must be at most 72 characters';
  end if;

  if p_managed_by is null then
    raise exception 'managed_by is required';
  end if;

  select a.role
  into v_manager_role
  from public.admins a
  where a.id = p_managed_by;

  if v_manager_role is null then
    raise exception 'manager admin not found';
  end if;

  if lower(v_manager_role) not in ('admin', 'superadmin') then
    raise exception 'only admin/superadmin can create sub-admin';
  end if;

  for v_attempt in 1..32 loop
    v_invite := 'SA' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.admins where invitation_code = v_invite
    );
  end loop;

  if v_invite is null then
    raise exception 'failed to generate invitation code';
  end if;

  v_hash := crypt(v_password, gen_salt('bf'));

  insert into public.admins (
    username,
    role,
    invitation_code,
    managed_by,
    password_hash,
    hashed_password
  )
  values (
    v_username,
    'sub-admin',
    v_invite,
    p_managed_by,
    v_hash,
    v_hash
  )
  returning * into v_row;

  return query
  select
    v_row.id,
    v_row.username,
    v_row.role,
    v_row.invitation_code,
    v_row.managed_by,
    v_row.created_at;
exception
  when unique_violation then
    raise exception 'username or invitation code already exists';
end;
$$;

revoke all on function public.admin_create_subadmin(text, text, uuid) from public;
grant execute on function public.admin_create_subadmin(text, text, uuid) to service_role;

-- ============================================================================
-- RLS for base tables
-- ============================================================================

alter table if exists public.admins enable row level security;
drop policy if exists "admins_service_role_all" on public.admins;
create policy "admins_service_role_all"
on public.admins
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.profiles enable row level security;
drop policy if exists "profiles_service_role_all" on public.profiles;
create policy "profiles_service_role_all"
on public.profiles
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "profiles_user_select_own" on public.profiles;
create policy "profiles_user_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_user_insert_own" on public.profiles;
create policy "profiles_user_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_user_update_own" on public.profiles;
create policy "profiles_user_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

alter table if exists public.balances enable row level security;
drop policy if exists "balances_service_role_all" on public.balances;
create policy "balances_service_role_all"
on public.balances
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "balances_user_select_own" on public.balances;
create policy "balances_user_select_own"
on public.balances
for select
using (auth.uid() = user_id);

alter table if exists public.holdings enable row level security;
drop policy if exists "holdings_service_role_all" on public.holdings;
create policy "holdings_service_role_all"
on public.holdings
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "holdings_user_select_own" on public.holdings;
create policy "holdings_user_select_own"
on public.holdings
for select
using (auth.uid() = user_id);

alter table if exists public.topups enable row level security;
drop policy if exists "topups_service_role_all" on public.topups;
create policy "topups_service_role_all"
on public.topups
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.mining_orders enable row level security;
drop policy if exists "mining_orders_service_role_all" on public.mining_orders;
create policy "mining_orders_service_role_all"
on public.mining_orders
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.orders enable row level security;
drop policy if exists "orders_service_role_all" on public.orders;
create policy "orders_service_role_all"
on public.orders
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ============================================================================
-- Existing SQL scripts merged
-- ============================================================================

-- ---- from sql/admin_password_management.sql ----
-- Admin password management helpers (safe to run multiple times)

create extension if not exists pgcrypto;

create or replace function public.admin_change_password(
  p_admin_id uuid,
  p_old_password text,
  p_new_password text
)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_password_col text;
  v_has_updated_at boolean;
  v_old_hash text;
begin
  if coalesce(length(trim(p_old_password)), 0) = 0 then
    return query select false, 'Current password is required';
    return;
  end if;

  if coalesce(length(p_new_password), 0) < 8 then
    return query select false, 'New password must be at least 8 characters';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'admins'
  ) then
    return query select false, 'public.admins table not found';
    return;
  end if;

  select c.column_name
  into v_password_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'admins'
    and c.column_name in ('password_hash', 'hashed_password')
  order by case when c.column_name = 'password_hash' then 1 else 2 end
  limit 1;

  if v_password_col is null then
    return query select false, 'Password hash column not found on public.admins';
    return;
  end if;

  execute format('select %I from public.admins where id = $1', v_password_col)
    into v_old_hash
    using p_admin_id;

  if v_old_hash is null or v_old_hash = '' then
    return query select false, 'Admin not found or password not configured';
    return;
  end if;

  if v_old_hash <> crypt(p_old_password, v_old_hash) then
    return query select false, 'Current password is incorrect';
    return;
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admins'
      and column_name = 'updated_at'
  ) into v_has_updated_at;

  if v_has_updated_at then
    execute format(
      'update public.admins set %I = crypt($2, gen_salt(''bf'')), updated_at = now() where id = $1',
      v_password_col
    )
      using p_admin_id, p_new_password;
  else
    execute format(
      'update public.admins set %I = crypt($2, gen_salt(''bf'')) where id = $1',
      v_password_col
    )
      using p_admin_id, p_new_password;
  end if;

  return query select true, 'Password changed';
end;
$$;

revoke all on function public.admin_change_password(uuid, text, text) from public;
grant execute on function public.admin_change_password(uuid, text, text) to service_role;

create or replace function public.admin_reset_subadmin_password(
  p_actor_admin_id uuid,
  p_subadmin_id uuid,
  p_new_password text
)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_password_col text;
  v_has_updated_at boolean;
  v_actor_role text;
  v_target_role text;
begin
  if p_actor_admin_id is null then
    return query select false, 'Actor admin is required';
    return;
  end if;

  if p_subadmin_id is null then
    return query select false, 'Sub-admin id is required';
    return;
  end if;

  if coalesce(length(p_new_password), 0) < 8 then
    return query select false, 'New password must be at least 8 characters';
    return;
  end if;

  if coalesce(length(p_new_password), 0) > 72 then
    return query select false, 'New password must be at most 72 characters';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'admins'
  ) then
    return query select false, 'public.admins table not found';
    return;
  end if;

  select a.role
    into v_actor_role
  from public.admins a
  where a.id = p_actor_admin_id;

  if v_actor_role is null then
    return query select false, 'Actor admin not found';
    return;
  end if;

  if lower(v_actor_role) <> 'superadmin' then
    return query select false, 'Only superadmin can reset sub-admin password';
    return;
  end if;

  select a.role
    into v_target_role
  from public.admins a
  where a.id = p_subadmin_id;

  if v_target_role is null then
    return query select false, 'Target sub-admin not found';
    return;
  end if;

  if lower(v_target_role) not in ('sub-admin', 'subadmin') then
    return query select false, 'Target admin must be sub-admin';
    return;
  end if;

  select c.column_name
    into v_password_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'admins'
    and c.column_name in ('password_hash', 'hashed_password')
  order by case when c.column_name = 'password_hash' then 1 else 2 end
  limit 1;

  if v_password_col is null then
    return query select false, 'Password hash column not found on public.admins';
    return;
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admins'
      and column_name = 'updated_at'
  ) into v_has_updated_at;

  if v_has_updated_at then
    execute format(
      'update public.admins set %I = crypt($2, gen_salt(''bf'')), updated_at = now() where id = $1',
      v_password_col
    )
      using p_subadmin_id, p_new_password;
  else
    execute format(
      'update public.admins set %I = crypt($2, gen_salt(''bf'')) where id = $1',
      v_password_col
    )
      using p_subadmin_id, p_new_password;
  end if;

  return query select true, 'Sub-admin password reset';
end;
$$;

revoke all on function public.admin_reset_subadmin_password(uuid, uuid, text) from public;
grant execute on function public.admin_reset_subadmin_password(uuid, uuid, text) to service_role;

-- ---- from sql/password_reset_limits.sql ----
-- Forgot-password cooldown table (safe to run multiple times)
-- Rule: one reset request per email every 3 days.

create table if not exists public.password_reset_limits (
  email text primary key,
  last_reset_at timestamptz not null default now()
);

-- ---- from sql/trade_permissions.sql ----
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

-- ---- from sql/user_access_controls.sql ----
-- User access restriction controls
-- Restricting a user disables Trade and Mining APIs.

create table if not exists public.user_access_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trade_restricted boolean not null default false,
  mining_restricted boolean not null default false,
  updated_by uuid references public.admins(id),
  updated_at timestamptz not null default now()
);

create or replace function public.set_user_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_access_updated_at on public.user_access_controls;

create trigger trg_user_access_updated_at
before update on public.user_access_controls
for each row
execute function public.set_user_access_updated_at();

alter table public.user_access_controls enable row level security;

drop policy if exists "user_access_service_role_read" on public.user_access_controls;
create policy "user_access_service_role_read"
on public.user_access_controls
for select
using (auth.role() = 'service_role');

drop policy if exists "user_access_service_role_write" on public.user_access_controls;
create policy "user_access_service_role_write"
on public.user_access_controls
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ---- from sql/deposit_addresses_and_history.sql ----
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

-- ---- from sql/withdraw_and_notify.sql ----
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

-- ---- from sql/support_chat.sql ----
-- Support live chat (user <-> admin/sub-admin)
-- Safe to run multiple times.

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  admin_id uuid references public.admins(id) on delete set null,
  status text not null default 'OPEN'
    check (status = any (array['OPEN'::text, 'CLOSED'::text])),
  last_message_at timestamptz not null default now(),
  last_sender text not null default 'USER'
    check (last_sender = any (array['USER'::text, 'ADMIN'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_threads_admin_last
  on public.support_threads (admin_id, last_message_at desc);

create index if not exists idx_support_threads_last_sender
  on public.support_threads (last_sender, status, last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_role text not null
    check (sender_role = any (array['USER'::text, 'ADMIN'::text])),
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_admin_id uuid references public.admins(id) on delete set null,
  message text not null,
  message_type text not null default 'TEXT'
    check (message_type = any (array['TEXT'::text, 'IMAGE'::text])),
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_thread_created
  on public.support_messages (thread_id, created_at asc);

alter table if exists public.support_messages
  add column if not exists message_type text not null default 'TEXT';

alter table if exists public.support_messages
  add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_messages_message_type_check'
  ) then
    alter table public.support_messages
      add constraint support_messages_message_type_check
      check (message_type = any (array['TEXT'::text, 'IMAGE'::text]));
  end if;
end $$;

-- ============================================================================
-- Extra hardening/consistency (RLS + updated_at) for merged tables
-- ============================================================================

alter table if exists public.password_reset_limits enable row level security;
drop policy if exists "password_reset_limits_service_role_all" on public.password_reset_limits;
create policy "password_reset_limits_service_role_all"
on public.password_reset_limits
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.withdraw_requests enable row level security;
drop policy if exists "withdraw_requests_service_role_all" on public.withdraw_requests;
create policy "withdraw_requests_service_role_all"
on public.withdraw_requests
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.user_notifications enable row level security;
drop policy if exists "user_notifications_service_role_all" on public.user_notifications;
create policy "user_notifications_service_role_all"
on public.user_notifications
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.support_threads enable row level security;
drop policy if exists "support_threads_service_role_all" on public.support_threads;
create policy "support_threads_service_role_all"
on public.support_threads
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table if exists public.support_messages enable row level security;
drop policy if exists "support_messages_service_role_all" on public.support_messages;
create policy "support_messages_service_role_all"
on public.support_messages
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop trigger if exists trg_admin_deposit_addresses_updated_at on public.admin_deposit_addresses;
create trigger trg_admin_deposit_addresses_updated_at
before update on public.admin_deposit_addresses
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_withdraw_requests_updated_at on public.withdraw_requests;
create trigger trg_withdraw_requests_updated_at
before update on public.withdraw_requests
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_user_notifications_updated_at on public.user_notifications;
create trigger trg_user_notifications_updated_at
before update on public.user_notifications
for each row execute function public.set_updated_at_column();

drop trigger if exists trg_support_threads_updated_at on public.support_threads;
create trigger trg_support_threads_updated_at
before update on public.support_threads
for each row execute function public.set_updated_at_column();
