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
