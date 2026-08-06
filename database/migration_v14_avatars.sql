-- v14: avatar mode/photo support for self profiles and contacts,
-- plus a storage bucket for the uploaded photos.

alter table public.user_profiles
  add column if not exists avatar_mode text not null default 'illustrated'
    check (avatar_mode in ('illustrated', 'silhouette', 'photo')),
  add column if not exists avatar_url text;

alter table public.contacts
  add column if not exists avatar_mode text not null default 'illustrated'
    check (avatar_mode in ('illustrated', 'silhouette', 'photo')),
  add column if not exists avatar_url text;

-- Public bucket: avatar photos are shown to anyone who can see the profile/
-- contact (including linked users), so public read is appropriate; writes
-- are restricted below to the owning user's own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload avatars into their own folder" on storage.objects;
create policy "Users can upload avatars into their own folder"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can update avatars in their own folder" on storage.objects;
create policy "Users can update avatars in their own folder"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete avatars in their own folder" on storage.objects;
create policy "Users can delete avatars in their own folder"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
