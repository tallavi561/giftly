-- Migration v4: budget per event + notes on contacts
-- הרץ ב-SQL Editor של Supabase

-- תקציב עובר לאירועים
alter table public.events
  add column if not exists budget_min integer,
  add column if not exists budget_max integer;

-- הערות אישיות על איש קשר (נפרד מ-free_text שהוא תיאור הפרופיל)
alter table public.contacts
  add column if not exists notes text;

-- הסרת budget מ-contacts (לא חובה — רק מנקה)
alter table public.contacts
  drop column if exists budget_min,
  drop column if exists budget_max;
