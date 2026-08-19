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
