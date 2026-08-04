create table if not exists public.cron_runs (
  run_date date primary key,
  ran_at   timestamptz not null default now(),
  sent     int not null default 0,
  skipped  int not null default 0
);
