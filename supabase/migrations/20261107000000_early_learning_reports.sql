create table if not exists public.early_learning_reports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  school_year text not null,
  grading_period text not null check (grading_period in ('T1', 'T2', 'T3')),
  what_child_can_do text not null default '',
  learning_to_improve text not null default '',
  teacher_comments text not null default '',
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, school_year, grading_period)
);

create index if not exists early_learning_reports_class_period_idx
  on public.early_learning_reports(class_id, grading_period);

alter table public.competency_records
  drop constraint if exists competency_records_rating_check;

alter table public.competency_records
  add constraint competency_records_rating_check
  check (rating in ('CO', 'DV', 'BG', 'A', 'B', 'C', 'D', 'E'));

grant select, insert, update, delete on public.early_learning_reports to authenticated;

alter table public.early_learning_reports enable row level security;

drop policy if exists early_learning_reports_teacher_all on public.early_learning_reports;
create policy early_learning_reports_teacher_all
  on public.early_learning_reports
  for all
  to authenticated
  using (
    auth.uid() = teacher_id
    and exists (
      select 1
      from public.classes c
      where c.id = early_learning_reports.class_id
        and c.teacher_id = auth.uid()
    )
  )
  with check (
    auth.uid() = teacher_id
    and exists (
      select 1
      from public.classes c
      where c.id = early_learning_reports.class_id
        and c.teacher_id = auth.uid()
        and c.grade_level in (0, 1)
    )
    and exists (
      select 1
      from public.students s
      where s.id = early_learning_reports.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1
      from public.class_enrollments ce
      where ce.class_id = early_learning_reports.class_id
        and ce.student_id = early_learning_reports.student_id
        and ce.status = 'active'
    )
  );
