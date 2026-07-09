-- Privacy level on user profiles
alter table public.user_profiles
  add column if not exists privacy_level text not null default 'approval'
    check (privacy_level in ('public', 'approval', 'password')),
  add column if not exists privacy_password_hash text;

-- Contact requests table (for approval flow)
create table if not exists public.contact_requests (
  id          uuid primary key default gen_random_uuid(),
  requester_id    uuid references auth.users(id) on delete cascade not null,
  requester_name  text,
  target_user_id  uuid references public.user_profiles(user_id) on delete cascade not null,
  status      text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz default now(),
  unique(requester_id, target_user_id)
);

alter table public.contact_requests enable row level security;

drop policy if exists "users_see_relevant_requests" on public.contact_requests;
drop policy if exists "requester_can_insert" on public.contact_requests;
drop policy if exists "target_can_update" on public.contact_requests;
drop policy if exists "requester_can_delete" on public.contact_requests;

create policy "users_see_relevant_requests" on public.contact_requests
  for select using (auth.uid() = requester_id or auth.uid() = target_user_id);

create policy "requester_can_insert" on public.contact_requests
  for insert with check (auth.uid() = requester_id);

create policy "target_can_update" on public.contact_requests
  for update using (auth.uid() = target_user_id);

create policy "requester_can_delete" on public.contact_requests
  for delete using (auth.uid() = requester_id);
