-- הרץ אחרי schema.sql
-- מוסיף תמיכה בפרופיל עצמי של המשתמש

alter table public.profiles add column if not exists is_self boolean not null default false;

-- מבטיח שלכל משתמש יש לכל היותר פרופיל עצמי אחד
create unique index if not exists profiles_one_self_per_user
  on public.profiles (owner_id)
  where is_self = true;
