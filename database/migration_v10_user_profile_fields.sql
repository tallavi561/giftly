-- v10: relationship status, children, and religion on user_profiles

alter table public.user_profiles
  add column if not exists relationship_status text
    check (relationship_status in ('single','married','divorced','widowed','cohabiting')),
  add column if not exists has_children boolean,
  add column if not exists religion text
    check (religion in ('jewish','muslim','christian','druze','secular','other'));
