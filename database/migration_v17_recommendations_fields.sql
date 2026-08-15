-- v17: extend recommendations (per-contact flow) with the fields the new
-- scoring engine needs. score/rating/created_at already exist.
-- See Architecture/BACKEND_RECOMMENDATION_ARCHITECTURE.md §2 (spec §2.5).

alter table public.recommendations
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
