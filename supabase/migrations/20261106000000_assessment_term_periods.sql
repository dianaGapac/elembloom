alter table public.assessments
  drop constraint if exists assessments_grading_period_check;

alter table public.assessments
  add constraint assessments_grading_period_check
  check (
    grading_period in (
      'T1', 'T2', 'T3',
      'Q1', 'Q2', 'Q3', 'Q4',
      'First Term', 'Second Term', 'Third Term',
      'First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter',
      'Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'
    )
  ) not valid;
