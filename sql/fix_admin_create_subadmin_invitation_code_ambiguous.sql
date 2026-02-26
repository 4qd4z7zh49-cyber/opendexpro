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
      select 1
      from public.admins a
      where a.invitation_code = v_invite
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
