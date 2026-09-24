-- Adds real product images (hotlinked from the retailer — never downloaded/
-- stored by us) to the two recommendation feeds that had neither an image
-- nor a real product link yet: personal suggestions (self_gift_suggestions)
-- and per-contact recommendations (recommendations). good_gifts_catalog
-- gets image_url too, since it's the shared source both feeds copy from
-- when a recommendation is catalog-backed (gift_id is set).
--
-- deal_alerts already has both image_url and source_url (migration_v21) —
-- no schema change needed there, only the sourcing/serving code.
--
-- Rationale (copyright): an image is only ever stored/shown alongside the
-- live source_url it was found on — never on its own — so it always reads
-- as a link-out to the real product page, not standalone content.
alter table public.good_gifts_catalog add column if not exists image_url text;

alter table public.recommendations add column if not exists image_url text;
alter table public.recommendations add column if not exists source_url text;

alter table public.self_gift_suggestions add column if not exists image_url text;
alter table public.self_gift_suggestions add column if not exists source_url text;
