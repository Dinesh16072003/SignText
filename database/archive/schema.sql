-- Signtext database schema
-- Run this once in the Supabase SQL editor, before policies.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per person, created automatically when they sign up.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  preferred_language text not null default 'en',
  created_at timestamptz not null default now()
);

-- One row per saved translation.
create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 5000),
  source text not null check (source in ('live', 'upload')),
  created_at timestamptz not null default now()
);

-- Reads the history page newest first, for one person only.
create index if not exists translations_user_created_idx
  on public.translations (user_id, created_at desc);

-- One row per uploaded video file kept in the sign-videos storage bucket.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  translation_id uuid references public.translations (id) on delete set null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists videos_user_created_idx
  on public.videos (user_id, created_at desc);

create index if not exists videos_translation_idx
  on public.videos (translation_id);

-- ---------------------------------------------------------------------------
-- Create the profile row on sign up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user ();