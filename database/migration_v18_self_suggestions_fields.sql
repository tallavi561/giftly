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
