-- v11: support Hebrew (and future) calendar types on events

alter table public.events
  add column if not exists date_type text not null default 'gregorian'
    check (date_type in ('gregorian', 'hebrew'));
