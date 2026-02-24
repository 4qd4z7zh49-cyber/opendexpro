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
