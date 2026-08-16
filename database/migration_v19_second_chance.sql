-- v19: "second chance" tracking for the contact-flow feedback loop (spec §7.4).
-- See Specs/Back/BACKEND_RECOMMENDATION_ARCHITECTURE.md, spec §7.4.
--
-- A recommendation that sits unrated is re-shown once (exempted one time
-- from the normal 30-day dedup window), then, if still unrated after
-- another window, auto-marked rating=2 (treated like an explicit "not fit").
-- second_chance_shown_at tracks the single re-exposure; NULL means it
-- hasn't happened yet.

alter table public.recommendations
  add column if not exists second_chance_shown_at timestamptz;

create index if not exists recommendations_second_chance_btree
  on public.recommendations (second_chance_shown_at)
  where rating is null;

-- Generic once-per-day tracking for cron jobs, keyed by job name — the
-- existing cron_runs table (migration_v12) has no job_name column, so it can
-- only ever track one job (reminders). New jobs (second-chance, CF neighbors)
-- use this table instead of colliding with it.
create table if not exists public.cron_job_runs (
  job_name text not null,
  run_date date not null,
  ran_at   timestamptz not null default now(),
  stats    jsonb not null default '{}',
  primary key (job_name, run_date)
);
