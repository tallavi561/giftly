-- =========================================
-- Giftly - Supabase Schema + RLS Policies
-- הרץ את זה ב-SQL Editor של Supabase
-- =========================================

-- PROFILES
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  interests text[] default '{}',
  free_text text,
  budget_min integer,
  budget_max integer,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "users manage own profiles"
  on public.profiles for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
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
    exists (
      select 1 from public.profiles p
      where p.id = events.profile_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = auth.uid()
    )
  );


-- GIFT HISTORY
create table public.gift_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
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
    exists (
      select 1 from public.profiles p
      where p.id = gift_history.profile_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = auth.uid()
    )
  );


-- RECOMMENDATIONS
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
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
    exists (
      select 1 from public.profiles p
      where p.id = recommendations.profile_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = auth.uid()
    )
  );
