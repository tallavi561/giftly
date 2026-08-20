
-- ========================================================
-- migration_v15_negative_prefs.sql
-- ========================================================
-- v15: negative_prefs — tags a person (or a contact's owner, on their behalf)
-- has explicitly ruled out. Feeds the recommendation-engine backoff/scoring
-- (see Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §2, spec §7.2/§7.5).
--
-- user_profiles.negative_prefs is written ONLY from a person's own feedback
-- on their self-recommendations flow (self_gift_suggestions rating WRONG_CONCEPT).
-- contacts.negative_prefs is written ONLY from that contact's owner rating a
-- recommendation for them — it is local to the owner and never propagates to
-- the linked user's own user_profiles row (spec §7.5).

alter table public.user_profiles
  add column if not exists negative_prefs text[] default '{}';

alter table public.contacts
  add column if not exists negative_prefs text[] default '{}';


-- ========================================================
-- migration_v16_recommendation_engine_core.sql
-- ========================================================
-- v16: recommendation-engine core — internal gift catalog + segment statistics
-- + item-based collaborative filtering neighbors.
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §2-3 (spec §2.6-2.13).
--
-- These tables are global/shared aggregate data, not owned by any single user
-- (unlike contacts/events/recommendations). RLS is enabled with a read policy
-- for any authenticated user (needed by the scoring engine, which runs under
-- the requesting user's session); writes happen only from backend code using
-- the service-role client — no insert/update/delete policy is defined here,
-- same convention as api_usage (migration_v13).

-- =========================================
-- Master Tag List (spec §2.7) — 11 fixed interest tags + 'general' catch-all.
-- Table names below use these exact slugs: gift_stats_<slug>.
--   sports        ספורט
--   music         נגינה
--   performances  הופעות/סטנדאפ
--   art           ציור/אומנות
--   culinary      קפה/קולינריה
--   travel        טיולים/טבע
--   extreme       אקסטרים
--   workshops     סדנאות/זוגיות
--   tech          טכנולוגיה/גאדטים
--   books         ספרים/ידע
--   gaming        גיימינג
--   general       כללי — not user-selectable; catch-all bucket for gifts that
--                 don't fall under any specific interest tag
-- This exact list must stay in sync with MASTER_TAG_LIST in
-- backend/src/services/recommendationEngine.ts.
-- =========================================

-- good_gifts_catalog (spec §2.6)
create table if not exists public.good_gifts_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  estimated_price numeric,
  category text,
  search_query text,
  tags text[] not null default '{}',
  global_shown int not null default 0,
  global_liked int not null default 0,
  last_verified_at timestamptz,
  is_seed boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists good_gifts_catalog_tags_gin on public.good_gifts_catalog using gin (tags);
create index if not exists good_gifts_catalog_price_btree on public.good_gifts_catalog (estimated_price);

alter table public.good_gifts_catalog enable row level security;
drop policy if exists "authenticated users can read catalog" on public.good_gifts_catalog;
create policy "authenticated users can read catalog"
  on public.good_gifts_catalog for select
  using (auth.role() = 'authenticated');

-- gift_stats_<tag> — one physical table per Master Tag List entry (spec §2.8).
-- Wide age/gender columns (small fixed domain); country stays in a separate
-- narrow shared table (gift_country_stats) since country is an open domain.
do $$
declare
  tag text;
  tags text[] := array['sports','music','performances','art','culinary','travel',
                        'extreme','workshops','tech','books','gaming','general'];
begin
  foreach tag in array tags loop
    execute format($f$
      create table if not exists public.gift_stats_%1$s (
        gift_id uuid primary key references public.good_gifts_catalog(id) on delete cascade,
        overall_shown int not null default 0, overall_liked int not null default 0,
        age_18_24_shown int not null default 0, age_18_24_liked int not null default 0,
        age_25_34_shown int not null default 0, age_25_34_liked int not null default 0,
        age_35_44_shown int not null default 0, age_35_44_liked int not null default 0,
        age_45_54_shown int not null default 0, age_45_54_liked int not null default 0,
        age_55_64_shown int not null default 0, age_55_64_liked int not null default 0,
        age_65p_shown   int not null default 0, age_65p_liked   int not null default 0,
        gender_male_shown   int not null default 0, gender_male_liked   int not null default 0,
        gender_female_shown int not null default 0, gender_female_liked int not null default 0
      );
      alter table public.gift_stats_%1$s enable row level security;
      drop policy if exists "authenticated users can read stats" on public.gift_stats_%1$s;
      create policy "authenticated users can read stats"
        on public.gift_stats_%1$s for select
        using (auth.role() = 'authenticated');
    $f$, tag);
  end loop;
end $$;

-- gift_country_stats (spec §2.9) — narrow shared table, open country domain
create table if not exists public.gift_country_stats (
  gift_id uuid not null references public.good_gifts_catalog(id) on delete cascade,
  tag text not null,
  country text not null,
  shown int not null default 0,
  liked int not null default 0,
  primary key (gift_id, tag, country)
);

alter table public.gift_country_stats enable row level security;
drop policy if exists "authenticated users can read country stats" on public.gift_country_stats;
create policy "authenticated users can read country stats"
  on public.gift_country_stats for select
  using (auth.role() = 'authenticated');

-- gift_neighbors (spec §2.10) — item-based collaborative filtering,
-- recomputed by a scheduled batch job (see cron.ts, "chance" job)
create table if not exists public.gift_neighbors (
  gift_id uuid not null references public.good_gifts_catalog(id) on delete cascade,
  neighbor_gift_id uuid not null references public.good_gifts_catalog(id) on delete cascade,
  similarity numeric not null,
  computed_at timestamptz not null default now(),
  primary key (gift_id, neighbor_gift_id)
);

create index if not exists gift_neighbors_gift_id_btree on public.gift_neighbors (gift_id);

alter table public.gift_neighbors enable row level security;
drop policy if exists "authenticated users can read neighbors" on public.gift_neighbors;
create policy "authenticated users can read neighbors"
  on public.gift_neighbors for select
  using (auth.role() = 'authenticated');


-- ========================================================
-- migration_v17_recommendations_fields.sql
-- ========================================================
-- v17: extend recommendations (per-contact flow) with the fields the new
-- scoring engine needs. score/created_at already existed (schema_v2.sql);
-- rating did NOT — that was a mistaken assumption when this file was first
-- written (confused with self_gift_suggestions.rating, added back in v7).
-- Caught when running this migration for the first time: without it, the
-- binary rate endpoint (PATCH /recommendations/:id/rate) would fail at
-- runtime with "column rating does not exist".
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §2 (spec §2.5).

alter table public.recommendations
  add column if not exists rating integer check (rating >= 1 and rating <= 5),
  add column if not exists gift_id uuid references public.good_gifts_catalog(id) on delete set null,
  add column if not exists category_tag text,
  add column if not exists batch_id uuid,
  add column if not exists feedback_reason text
    check (feedback_reason in ('WRONG_CONCEPT', 'WRONG_PRODUCT', 'TOO_GENERIC')),
  add column if not exists source text not null default 'gemini'
    check (source in ('gemini', 'compute'));

create index if not exists recommendations_contact_created_btree
  on public.recommendations (contact_id, created_at);
create index if not exists recommendations_batch_id_btree
  on public.recommendations (batch_id);
create index if not exists recommendations_contact_rating_created_btree
  on public.recommendations (contact_id, rating, created_at);


-- ========================================================
-- migration_v18_self_suggestions_fields.sql
-- ========================================================
-- v18: extend self_gift_suggestions (self-facing flow) with the fields the
-- new scoring engine needs. batch_id/rating already exist.
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §2 (spec §2.4).

alter table public.self_gift_suggestions
  add column if not exists gift_id uuid references public.good_gifts_catalog(id) on delete set null,
  add column if not exists category_tag text,
  add column if not exists feedback_reason text
    check (feedback_reason in ('WRONG_CONCEPT', 'WRONG_PRODUCT', 'TOO_GENERIC'));

create index if not exists self_gift_suggestions_user_rating_btree
  on public.self_gift_suggestions (user_id, rating);
create index if not exists self_gift_suggestions_user_batch_btree
  on public.self_gift_suggestions (user_id, batch_id);


-- ========================================================
-- migration_v19_second_chance.sql
-- ========================================================
-- v19: "second chance" tracking for the contact-flow feedback loop (spec §7.4).
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md, spec §7.4.
--
-- A recommendation that sits unrated is re-shown once (exempted one time
-- from the normal 30-day dedup window), then, if still unrated after
-- another window, auto-marked rating=2 (treated like an explicit "not fit").
-- second_chance_shown_at tracks the single re-exposure; NULL means it
-- hasn't happened yet.

alter table public.recommendations
  add column if not exists second_chance_shown_at timestamptz;

create index if not exists recommendations_second_chance_btree
  on public.recommendations (second_chance_shown_at)
  where rating is null;

-- Generic once-per-day tracking for cron jobs, keyed by job name — the
-- existing cron_runs table (migration_v12) has no job_name column, so it can
-- only ever track one job (reminders). New jobs (second-chance, CF neighbors)
-- use this table instead of colliding with it.
create table if not exists public.cron_job_runs (
  job_name text not null,
  run_date date not null,
  ran_at   timestamptz not null default now(),
  stats    jsonb not null default '{}',
  primary key (job_name, run_date)
);


-- ========================================================
-- migration_v20_groups_events_sharing.sql
-- ========================================================
-- v20: event sharing / groups / distribution links (spec §14) — a feature
-- area independent of the recommendation engine itself (no scoring impact).
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §11 Phase 5.

alter table public.user_profiles
  add column if not exists require_approval_for_group_invites boolean not null default false;

-- hosted_events (spec §2.14) — the reverse of `events`: the owner is the one
-- being celebrated, and chooses who gets to see it. No schema link to
-- `events` (spec §14.1) — different flow entirely.
create table if not exists public.hosted_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  date text not null,
  date_type text not null default 'gregorian' check (date_type in ('gregorian', 'hebrew')),
  description text,
  created_at timestamptz default now()
);

alter table public.hosted_events enable row level security;
drop policy if exists "owner manages own hosted_events" on public.hosted_events;
create policy "owner manages own hosted_events" on public.hosted_events
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create index if not exists hosted_events_owner_btree on public.hosted_events (owner_user_id);

-- groups (spec §2.15)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

alter table public.groups enable row level security;
drop policy if exists "owner manages own groups" on public.groups;
create policy "owner manages own groups" on public.groups
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
-- Members need to be able to see the group they belong to (e.g. its name).
drop policy if exists "members can read their groups" on public.groups;
create policy "members can read their groups" on public.groups
  for select using (
    exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
  );

create index if not exists groups_owner_btree on public.groups (owner_user_id);

-- group_members (spec §2.16) — always a registered user, never a bare `contacts` row.
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'INVITED' check (status in ('INVITED', 'MEMBER', 'DECLINED')),
  joined_via text not null check (joined_via in ('DIRECT_INVITE', 'LINK')),
  initiated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique (group_id, user_id)
);

alter table public.group_members enable row level security;
drop policy if exists "member sees and updates own membership" on public.group_members;
create policy "member sees and updates own membership" on public.group_members
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "group owner manages memberships" on public.group_members;
create policy "group owner manages memberships" on public.group_members
  for all using (
    exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_user_id = auth.uid())
  );

create index if not exists group_members_group_user_btree on public.group_members (group_id, user_id);
create index if not exists group_members_user_status_btree on public.group_members (user_id, status);

-- invite_links (spec §2.17) — one shape for both "join this group" and
-- "add me to your distribution list" links.
create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('GROUP', 'CONTACT_LIST')),
  group_id uuid references public.groups(id) on delete cascade,
  created_at timestamptz default now(),
  constraint invite_links_group_id_required check (
    (target_type = 'GROUP' and group_id is not null) or (target_type = 'CONTACT_LIST' and group_id is null)
  )
);

alter table public.invite_links enable row level security;
drop policy if exists "owner manages own invite_links" on public.invite_links;
create policy "owner manages own invite_links" on public.invite_links
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create index if not exists invite_links_token_btree on public.invite_links (token);

-- event_audience (spec §2.18) — target set for a hosted_event; the visible
-- audience is the UNION of all rows, not a single choice.
create table if not exists public.event_audience (
  id uuid primary key default gen_random_uuid(),
  hosted_event_id uuid not null references public.hosted_events(id) on delete cascade,
  target_type text not null check (target_type in ('GROUP', 'CONTACT', 'ALL_CONTACTS')),
  target_group_id uuid references public.groups(id) on delete cascade,
  target_contact_id uuid references public.contacts(id) on delete cascade,
  created_at timestamptz default now(),
  constraint event_audience_target_shape check (
    (target_type = 'GROUP' and target_group_id is not null and target_contact_id is null) or
    (target_type = 'CONTACT' and target_contact_id is not null and target_group_id is null) or
    (target_type = 'ALL_CONTACTS' and target_group_id is null and target_contact_id is null)
  )
);

alter table public.event_audience enable row level security;
drop policy if exists "hosted_event owner manages its audience" on public.event_audience;
create policy "hosted_event owner manages its audience" on public.event_audience
  for all using (
    exists (select 1 from public.hosted_events he where he.id = event_audience.hosted_event_id and he.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.hosted_events he where he.id = hosted_event_id and he.owner_user_id = auth.uid())
  );

create index if not exists event_audience_hosted_event_btree on public.event_audience (hosted_event_id);
create index if not exists event_audience_target_group_btree on public.event_audience (target_group_id);
create index if not exists event_audience_target_contact_btree on public.event_audience (target_contact_id);


-- ========================================================
-- migration_v21_deal_alerts.sql
-- ========================================================
-- v21: deal_alerts — real-world discounted products found on the web,
-- matched to contacts by interest tag (spec: Specs/Front/FRONTEND_SPEC2.md
-- §10, "שידוך מבצעים"). Populated by a scheduled job (see
-- backend/src/services/dealFinder.ts), not user-generated.
--
-- Same convention as good_gifts_catalog (migration_v16): global/shared data,
-- RLS enabled with an authenticated-read policy, writes only via the
-- service-role client.

create table if not exists public.deal_alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source_site text not null,   -- domain the deal was found on, e.g. 'castro.co.il'
  source_url text not null,
  image_url text,
  current_price numeric,
  original_price numeric,
  discount_pct numeric,        -- derived at insert time, cached for sorting/display
  tags text[] not null default '{}', -- Master Tag List (spec §2.7)
  found_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_active boolean not null default true -- manual kill-switch (e.g. dead link reported)
);

create index if not exists deal_alerts_tags_gin on public.deal_alerts using gin (tags);
create index if not exists deal_alerts_expires_at_btree on public.deal_alerts (expires_at);
create index if not exists deal_alerts_source_site_btree on public.deal_alerts (source_site);

alter table public.deal_alerts enable row level security;
drop policy if exists "authenticated users can read deals" on public.deal_alerts;
create policy "authenticated users can read deals"
  on public.deal_alerts for select
  using (auth.role() = 'authenticated');


-- ========================================================
-- migration_v22_catalog_source_url.sql
-- ========================================================
-- v22: source_url on good_gifts_catalog — a real purchase link, when known,
-- distinct from search_query (which only ever builds a Google search link).
-- Needed for manually-curated catalog items (e.g. from a WhatsApp deals
-- channel) that come with an actual product link worth preserving.
--
-- Nullable and purely additive — existing rows (LLM-seeded via
-- scripts/seedCatalog.ts) have no direct link and keep using search_query
-- as before. The frontend does not read this column yet (still shows the
-- Google-search fallback everywhere); wiring "prefer source_url when
-- present" into the UI is a separate follow-up.

alter table public.good_gifts_catalog
  add column if not exists source_url text;

