-- Wipes the current good_gifts_catalog before re-seeding it with a properly
-- curated set. Safe: gift_stats_<tag>/gift_country_stats/gift_neighbors are
-- ON DELETE CASCADE (auto-removed), and recommendations.gift_id /
-- self_gift_suggestions.gift_id are ON DELETE SET NULL — existing user
-- recommendation/rating history is preserved, only the dangling reference
-- to a since-removed catalog item is cleared.
delete from public.good_gifts_catalog;
