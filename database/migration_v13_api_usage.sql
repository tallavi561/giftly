create table if not exists public.api_usage (
  date          date primary key,
  gemini_calls  int not null default 0
);

-- Returns true if the call is allowed (under the limit), false if the limit was reached.
-- The increment happens atomically only when allowed.
create or replace function try_increment_gemini(max_calls int)
returns boolean language plpgsql security definer as $$
declare
  new_count int;
begin
  insert into public.api_usage (date, gemini_calls)
    values (current_date, 1)
  on conflict (date) do update
    set gemini_calls = api_usage.gemini_calls + 1
    where api_usage.gemini_calls < max_calls
  returning gemini_calls into new_count;

  return new_count is not null;
end;
$$;
