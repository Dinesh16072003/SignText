-- Signtext access rules
-- Run this after schema.sql, in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Row level security
-- Signed-in people can only touch their own rows. Nobody else can read them,
-- and nobody can insert a row that belongs to somebody else.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.translations enable row level security;
alter table public.videos enable row level security;

-- profiles ------------------------------------------------------------------

drop policy if exists "Profiles are readable by their owner" on public.profiles;
create policy "Profiles are readable by their owner"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid ()) = id);

drop policy if exists "Profiles can be created by their owner" on public.profiles;
create policy "Profiles can be created by their owner"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid ()) = id);

drop policy if exists "Profiles can be deleted by their owner" on public.profiles;
create policy "Profiles can be deleted by their owner"
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid ()) = id);

-- translations --------------------------------------------------------------

drop policy if exists "Translations are readable by their owner" on public.translations;
create policy "Translations are readable by their owner"
  on public.translations
  for select
  to authenticated
  using ((select auth.uid ()) = user_id);

drop policy if exists "Translations can be created by their owner" on public.translations;
create policy "Translations can be created by their owner"
  on public.translations
  for insert
  to authenticated
  with check ((select auth.uid ()) = user_id);

drop policy if exists "Translations can be deleted by their owner" on public.translations;
create policy "Translations can be deleted by their owner"
  on public.translations
  for delete
  to authenticated
  using ((select auth.uid ()) = user_id);

-- videos --------------------------------------------------------------------

drop policy if exists "Videos are readable by their owner" on public.videos;
create policy "Videos are readable by their owner"
  on public.videos
  for select
  to authenticated
  using ((select auth.uid ()) = user_id);

drop policy if exists "Videos can be created by their owner" on public.videos;
create policy "Videos can be created by their owner"
  on public.videos
  for insert
  to authenticated
  with check ((select auth.uid ()) = user_id);

drop policy if exists "Videos can be deleted by their owner" on public.videos;
create policy "Videos can be deleted by their owner"
  on public.videos
  for delete
  to authenticated
  using ((select auth.uid ()) = user_id);

-- ---------------------------------------------------------------------------
-- Private storage bucket for uploaded videos
-- Every file lives in a folder named after the owner's user id, for example
-- <user id>/clip-2026-05-04.webm, and the folder name is checked against the
-- signed-in person on every request.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('sign-videos', 'sign-videos', false)
on conflict (id) do update
  set public = excluded.public;

drop policy if exists "Videos storage is readable by their owner" on storage.objects;
create policy "Videos storage is readable by their owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'sign-videos'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

drop policy if exists "Videos storage can be written by their owner" on storage.objects;
create policy "Videos storage can be written by their owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'sign-videos'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

drop policy if exists "Videos storage can be deleted by their owner" on storage.objects;
create policy "Videos storage can be deleted by their owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'sign-videos'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );