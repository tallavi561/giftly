-- =========================================
-- Migration v2: user_profiles + contacts
-- הרץ ב-SQL Editor של Supabase
-- =========================================

-- 1. טבלת פרופילים ציבוריים של משתמשים רשומים
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  nickname text not null unique,
  email text not null unique,
  interests text[] default '{}',
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

-- כל משתמש מנהל את הפרופיל שלו
create policy "user manages own user_profile"
  on public.user_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- כל משתמש מחובר יכול לקרוא פרופילים (לצורך חיפוש)
create policy "authenticated users can read user_profiles"
  on public.user_profiles for select
  using (auth.role() = 'authenticated');


-- 2. טבלת אנשי קשר אישיים (מחליפה את profiles)
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  linked_user_id uuid references public.user_profiles(user_id) on delete set null,
  -- שדות ידניים — בשימוש כשאין linked_user_id
  interests text[] default '{}',
  free_text text,
  budget_min integer,
  budget_max integer,
  created_at timestamptz default now()
);

alter table public.contacts enable row level security;

create policy "users manage own contacts"
  on public.contacts for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- 3. הורדת policies תלויות לפני שינוי עמודות
drop policy if exists "users manage own events" on public.events;
drop policy if exists "users manage own gift history" on public.gift_history;
drop policy if exists "users manage own recommendations" on public.recommendations;


-- 4. עדכון טבלאות תלויות: events, gift_history, recommendations
--    מחליפים profile_id → contact_id

alter table public.events
  add column contact_id uuid references public.contacts(id) on delete cascade;

update public.events e
  set contact_id = e.profile_id
  where exists (select 1 from public.contacts c where c.id = e.profile_id);

-- מחיקת שורות יתומות (ללא התאמה ב-contacts) לפני NOT NULL
delete from public.events where contact_id is null;
alter table public.events drop column profile_id;
alter table public.events alter column contact_id set not null;

-- gift_history
alter table public.gift_history
  add column contact_id uuid references public.contacts(id) on delete cascade;

update public.gift_history g
  set contact_id = g.profile_id
  where exists (select 1 from public.contacts c where c.id = g.profile_id);

delete from public.gift_history where contact_id is null;
alter table public.gift_history drop column profile_id;
alter table public.gift_history alter column contact_id set not null;

-- recommendations
alter table public.recommendations
  add column contact_id uuid references public.contacts(id) on delete cascade;

update public.recommendations r
  set contact_id = r.profile_id
  where exists (select 1 from public.contacts c where c.id = r.profile_id);

delete from public.recommendations where contact_id is null;
alter table public.recommendations drop column profile_id;
alter table public.recommendations alter column contact_id set not null;


-- 5. יצירה מחדש של policies על הטבלאות המעודכנות
create policy "users manage own events"
  on public.events for all
  using (
    exists (select 1 from public.contacts c where c.id = events.contact_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );

create policy "users manage own gift history"
  on public.gift_history for all
  using (
    exists (select 1 from public.contacts c where c.id = gift_history.contact_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );

create policy "users manage own recommendations"
  on public.recommendations for all
  using (
    exists (select 1 from public.contacts c where c.id = recommendations.contact_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );


-- 6. הסרת טבלת profiles הישנה
drop table if exists public.profiles;
