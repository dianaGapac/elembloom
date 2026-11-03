alter table public.students
  add column if not exists parent_guardian_name text,
  add column if not exists parent_guardian_email text,
  add column if not exists email_notifications_enabled boolean not null default true;
