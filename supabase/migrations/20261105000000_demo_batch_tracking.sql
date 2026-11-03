alter table public.classes add column if not exists demo_batch_id text;
alter table public.class_subjects add column if not exists demo_batch_id text;
alter table public.class_enrollments add column if not exists demo_batch_id text;
alter table public.students add column if not exists demo_batch_id text;
alter table public.class_grading_configurations add column if not exists demo_batch_id text;
alter table public.academic_activities add column if not exists demo_batch_id text;
alter table public.academic_activity_assignments add column if not exists demo_batch_id text;
alter table public.assessments add column if not exists demo_batch_id text;
alter table public.assessment_scores add column if not exists demo_batch_id text;
alter table public.attendance add column if not exists demo_batch_id text;

create index if not exists classes_demo_batch_idx
  on public.classes(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists class_subjects_demo_batch_idx
  on public.class_subjects(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists class_enrollments_demo_batch_idx
  on public.class_enrollments(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists students_demo_batch_idx
  on public.students(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists class_grading_configurations_demo_batch_idx
  on public.class_grading_configurations(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists academic_activities_demo_batch_idx
  on public.academic_activities(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists academic_activity_assignments_demo_batch_idx
  on public.academic_activity_assignments(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists assessments_demo_batch_idx
  on public.assessments(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists assessment_scores_demo_batch_idx
  on public.assessment_scores(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create index if not exists attendance_demo_batch_idx
  on public.attendance(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create unique index if not exists classes_teacher_demo_batch_unique
  on public.classes(teacher_id, demo_batch_id)
  where demo_batch_id is not null;

create unique index if not exists class_subjects_teacher_demo_batch_unique
  on public.class_subjects(teacher_id, demo_batch_id, subject_name)
  where demo_batch_id is not null;

create unique index if not exists class_enrollments_teacher_demo_batch_unique
  on public.class_enrollments(teacher_id, demo_batch_id, class_id, student_id)
  where demo_batch_id is not null;

create unique index if not exists students_teacher_demo_batch_unique
  on public.students(teacher_id, demo_batch_id, student_number)
  where demo_batch_id is not null;

create unique index if not exists class_grading_configs_teacher_demo_batch_unique
  on public.class_grading_configurations(teacher_id, demo_batch_id, class_subject_id, school_year, grading_period)
  where demo_batch_id is not null;

create unique index if not exists academic_activities_teacher_demo_batch_unique
  on public.academic_activities(teacher_id, demo_batch_id, title)
  where demo_batch_id is not null;

create unique index if not exists activity_assignments_teacher_demo_batch_unique
  on public.academic_activity_assignments(teacher_id, demo_batch_id, activity_id, class_id)
  where demo_batch_id is not null;

create unique index if not exists assessments_teacher_demo_batch_unique
  on public.assessments(teacher_id, demo_batch_id, activity_id, class_id)
  where demo_batch_id is not null;

create unique index if not exists assessment_scores_teacher_demo_batch_unique
  on public.assessment_scores(teacher_id, demo_batch_id, assessment_id, student_id)
  where demo_batch_id is not null;

create unique index if not exists attendance_teacher_demo_batch_unique
  on public.attendance(teacher_id, demo_batch_id, student_id, attendance_date)
  where demo_batch_id is not null;
