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
