-- Per-site, per-category search history for the deal-finder job (dealFinder.ts).
-- Lets us see over time which sites in ALLOWED_SITES/CATEGORY_SITES actually
-- yield results vs. which consistently fail/return nothing, so dead weight
-- can be pruned instead of wasting Gemini quota searching them forever.

create table if not exists public.deal_site_search_log (
  id uuid primary key default gen_random_uuid(),
  site_domain text not null,
  category text not null, -- CatalogTag (one of MASTER_TAG_LIST, or 'general')
  run_at timestamptz not null default now(),
  found_count int not null default 0,
  inserted_count int not null default 0, -- after domain-check + gift-appropriateness gate
  error text -- null if the search itself succeeded (even if found_count=0)
);

create index if not exists deal_site_search_log_site_btree on public.deal_site_search_log (site_domain, run_at desc);
create index if not exists deal_site_search_log_category_btree on public.deal_site_search_log (category, run_at desc);

alter table public.deal_site_search_log enable row level security;
drop policy if exists "authenticated users can read site search log" on public.deal_site_search_log;
create policy "authenticated users can read site search log"
  on public.deal_site_search_log for select
  using (auth.role() = 'authenticated');
