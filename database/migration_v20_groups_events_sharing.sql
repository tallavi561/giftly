-- v20: event sharing / groups / distribution links (spec §14) — a feature
-- area independent of the recommendation engine itself (no scoring impact).
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md §11 Phase 5.

alter table public.user_profiles
  add column if not exists require_approval_for_group_invites boolean not null default false;

-- hosted_events (spec §2.14) — the reverse of `events`: the owner is the one
-- being celebrated, and chooses who gets to see it. No schema link to
-- `events` (spec §14.1) — different flow entirely.
create table if not exists public.hosted_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  date text not null,
  date_type text not null default 'gregorian' check (date_type in ('gregorian', 'hebrew')),
  description text,
  created_at timestamptz default now()
);

alter table public.hosted_events enable row level security;
create policy "owner manages own hosted_events" on public.hosted_events
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create index if not exists hosted_events_owner_btree on public.hosted_events (owner_user_id);

-- groups (spec §2.15)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

alter table public.groups enable row level security;
create policy "owner manages own groups" on public.groups
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
-- Members need to be able to see the group they belong to (e.g. its name).
create policy "members can read their groups" on public.groups
  for select using (
    exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
  );

create index if not exists groups_owner_btree on public.groups (owner_user_id);

-- group_members (spec §2.16) — always a registered user, never a bare `contacts` row.
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'INVITED' check (status in ('INVITED', 'MEMBER', 'DECLINED')),
  joined_via text not null check (joined_via in ('DIRECT_INVITE', 'LINK')),
  initiated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique (group_id, user_id)
);

alter table public.group_members enable row level security;
create policy "member sees and updates own membership" on public.group_members
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "group owner manages memberships" on public.group_members
  for all using (
    exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_user_id = auth.uid())
  );

create index if not exists group_members_group_user_btree on public.group_members (group_id, user_id);
create index if not exists group_members_user_status_btree on public.group_members (user_id, status);

-- invite_links (spec §2.17) — one shape for both "join this group" and
-- "add me to your distribution list" links.
create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('GROUP', 'CONTACT_LIST')),
  group_id uuid references public.groups(id) on delete cascade,
  created_at timestamptz default now(),
  constraint invite_links_group_id_required check (
    (target_type = 'GROUP' and group_id is not null) or (target_type = 'CONTACT_LIST' and group_id is null)
  )
);

alter table public.invite_links enable row level security;
create policy "owner manages own invite_links" on public.invite_links
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create index if not exists invite_links_token_btree on public.invite_links (token);

-- event_audience (spec §2.18) — target set for a hosted_event; the visible
-- audience is the UNION of all rows, not a single choice.
create table if not exists public.event_audience (
  id uuid primary key default gen_random_uuid(),
  hosted_event_id uuid not null references public.hosted_events(id) on delete cascade,
  target_type text not null check (target_type in ('GROUP', 'CONTACT', 'ALL_CONTACTS')),
  target_group_id uuid references public.groups(id) on delete cascade,
  target_contact_id uuid references public.contacts(id) on delete cascade,
  created_at timestamptz default now(),
  constraint event_audience_target_shape check (
    (target_type = 'GROUP' and target_group_id is not null and target_contact_id is null) or
    (target_type = 'CONTACT' and target_contact_id is not null and target_group_id is null) or
    (target_type = 'ALL_CONTACTS' and target_group_id is null and target_contact_id is null)
  )
);

alter table public.event_audience enable row level security;
create policy "hosted_event owner manages its audience" on public.event_audience
  for all using (
    exists (select 1 from public.hosted_events he where he.id = event_audience.hosted_event_id and he.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.hosted_events he where he.id = hosted_event_id and he.owner_user_id = auth.uid())
  );

create index if not exists event_audience_hosted_event_btree on public.event_audience (hosted_event_id);
create index if not exists event_audience_target_group_btree on public.event_audience (target_group_id);
create index if not exists event_audience_target_contact_btree on public.event_audience (target_contact_id);
