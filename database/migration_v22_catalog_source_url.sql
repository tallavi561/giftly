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
