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
