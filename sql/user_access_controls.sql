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
