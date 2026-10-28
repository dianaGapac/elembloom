-- ElemBloom profile and class management schema
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists school_name text;
alter table public.profiles add column if not exists school_year text;
alter table public.profiles alter column email drop not null;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  grade_level smallint not null check (grade_level between 1 and 6),
  section_name text not null,
  school_year text not null,
  subject_name text,
  room text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists classes_teacher_assignment_unique on public.classes(teacher_id, grade_level, lower(section_name), school_year) where is_active;

create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  subject_name text,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_times_valid check (end_time > start_time)
);
create index if not exists classes_teacher_id_idx on public.classes(teacher_id);
create index if not exists schedules_class_id_idx on public.class_schedules(class_id);
create index if not exists schedules_teacher_id_idx on public.class_schedules(teacher_id);

alter table public.classes enable row level security;
alter table public.class_schedules enable row level security;
drop policy if exists classes_owner_all on public.classes;
create policy classes_owner_all on public.classes for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
drop policy if exists schedules_owner_all on public.class_schedules;
create policy schedules_owner_all on public.class_schedules for all to authenticated using (auth.uid() = teacher_id and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())) with check (auth.uid() = teacher_id and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-avatars', 'teacher-avatars', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists teacher_avatar_select on storage.objects;
create policy teacher_avatar_select on storage.objects for select to authenticated using (bucket_id = 'teacher-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists teacher_avatar_insert on storage.objects;
create policy teacher_avatar_insert on storage.objects for insert to authenticated with check (bucket_id = 'teacher-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists teacher_avatar_update on storage.objects;
create policy teacher_avatar_update on storage.objects for update to authenticated using (bucket_id = 'teacher-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists teacher_avatar_delete on storage.objects;
create policy teacher_avatar_delete on storage.objects for delete to authenticated using (bucket_id = 'teacher-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
