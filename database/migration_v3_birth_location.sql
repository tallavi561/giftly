-- Migration v3: birth_date + location
-- הרץ ב-SQL Editor של Supabase

alter table public.user_profiles
  add column if not exists birth_date date,
  add column if not exists city text,
  add column if not exists country text;

alter table public.contacts
  add column if not exists birth_date date,
  add column if not exists city text,
  add column if not exists country text;
