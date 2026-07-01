-- =========================================
-- Giftly Schema v2 — הרץ אחרי DROP הכל
-- =========================================

-- 1. פרופילים ציבוריים של משתמשים רשומים
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

create policy "user manages own user_profile"
  on public.user_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "authenticated users can read user_profiles"
  on public.user_profiles for select
  using (auth.role() = 'authenticated');


-- 2. אנשי קשר אישיים
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  linked_user_id uuid references public.user_profiles(user_id) on delete set null,
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


-- 3. אירועים
create table public.events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null,
  date date not null,
  reminder_days integer not null default 14,
  reminder_sent boolean default false,
  created_at timestamptz default now()
);

alter table public.events enable row level security;

create policy "users manage own events"
  on public.events for all
  using (
    exists (select 1 from public.contacts c where c.id = events.contact_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );


-- 4. היסטוריית מתנות
create table public.gift_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  url text,
  price integer,
  source text,
  given_at date,
  created_at timestamptz default now()
);

alter table public.gift_history enable row level security;

create policy "users manage own gift history"
  on public.gift_history for all
  using (
    exists (select 1 from public.contacts c where c.id = gift_history.contact_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );


-- 5. המלצות
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  title text not null,
  description text,
  estimated_price integer,
  category text,
  search_query text,
  score numeric,
  created_at timestamptz default now()
);

alter table public.recommendations enable row level security;

create policy "users manage own recommendations"
  on public.recommendations for all
  using (
    exists (select 1 from public.contacts c where c.id = recommendations.contact_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );
