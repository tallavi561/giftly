alter table public.user_profiles
  add column if not exists gender text check (gender in ('male', 'female', 'other'));

alter table public.contacts
  add column if not exists gender text check (gender in ('male', 'female', 'other'));
