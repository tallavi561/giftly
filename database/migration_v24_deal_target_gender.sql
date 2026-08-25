-- Deals were matched to contacts by interest-tag overlap only (deals.ts
-- /for-me) — nothing checked whether the product itself is gendered (e.g.
-- women's clothing), so it could get matched to a contact of the opposite
-- gender purely because the tags lined up. Adds a target_gender
-- classification to deal_alerts, set at insert time by the existing
-- gift-appropriateness Gemini call (giftAppropriateness.ts). 'unisex' is a
-- real classification (not "unknown") for products with no clear gender —
-- those keep matching every contact regardless of gender.

alter table public.deal_alerts
  add column if not exists target_gender text not null default 'unisex'
  check (target_gender in ('male', 'female', 'unisex'));
