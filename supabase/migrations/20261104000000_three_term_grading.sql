alter table public.classes
  drop constraint if exists classes_grade_level_check;

alter table public.classes
  add constraint classes_grade_level_check
  check (grade_level between 0 and 6) not valid;

alter table public.classes
  validate constraint classes_grade_level_check;

create table if not exists public.competency_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_offering_id uuid not null references public.class_subjects(id) on delete cascade,
  grading_period text not null check (grading_period in ('T1', 'T2', 'T3', 'Q1', 'Q2', 'Q3', 'Q4')),
  competency text not null,
  rating text not null check (rating in ('CO', 'DV', 'BG', 'A', 'B', 'D', 'E')),
  notes text,
  observed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, class_id, student_id, subject_offering_id, grading_period, competency)
);

create index if not exists competency_records_class_period_idx
  on public.competency_records(class_id, subject_offering_id, grading_period);

grant select, insert, update, delete on public.competency_records to authenticated;

alter table public.competency_records enable row level security;

drop policy if exists competency_records_teacher_all on public.competency_records;
create policy competency_records_teacher_all
  on public.competency_records
  for all
  to authenticated
  using (
    auth.uid() = teacher_id
    and exists (
      select 1
      from public.classes c
      where c.id = competency_records.class_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    auth.uid() = teacher_id
    and exists (
      select 1
      from public.classes c
      join public.class_subjects cs on cs.class_id = c.id
      where c.id = competency_records.class_id
        and c.teacher_id = auth.uid()
        and cs.id = competency_records.subject_offering_id
    )
    and exists (
      select 1
      from public.students s
      where s.id = competency_records.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1
      from public.class_enrollments ce
      where ce.class_id = competency_records.class_id
        and ce.student_id = competency_records.student_id
        and ce.status = 'active'
    )
  );
