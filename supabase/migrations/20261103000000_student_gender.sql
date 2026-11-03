alter table public.students
  add column if not exists gender text;

alter table public.students
  drop constraint if exists students_gender_check;

alter table public.students
  add constraint students_gender_check
  check (gender is null or gender in ('male', 'female'));
