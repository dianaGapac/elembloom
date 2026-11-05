import {
  gradeOnePaceCompetenciesForSubject,
  normalizePeriod,
} from "@/lib/academic-structure"
import { createClient } from "@/lib/supabase/client"

type GradeOneClass = {
  id: string
  school_year: string
}
type GradingPeriod = {
  school_year: string
  quarter_number: number
  short_label: string
  start_date: string
  end_date: string
}
type LanguageOffering = {
  id: string
  class_id: string
  subject_name: string
}
type Enrollment = { class_id: string; student_id: string }
type Student = { id: string; class_id: string }
type ExistingRating = {
  class_id: string
  student_id: string
  subject_offering_id: string
  grading_period: string
  competency: string
}
type Rating = ExistingRating & { rating: string }

function throwOnError(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`)
}

async function loadPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
  label: string,
) {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999)
    throwOnError(label, error)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

function todayInManila() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function currentTerms(schoolYear: string, periods: GradingPeriod[], today: string) {
  const ordered = periods
    .filter((period) => period.school_year === schoolYear)
    .map((period) => ({
      ...period,
      start_date: period.start_date.slice(0, 10),
      end_date: period.end_date.slice(0, 10),
      key: normalizePeriod(period.short_label)?.replace(/^Q/, "T"),
    }))
    .filter(
      (period): period is typeof period & { key: string } =>
        Boolean(period.key && /^T[1-3]$/.test(period.key)),
    )
    .sort((a, b) => a.quarter_number - b.quarter_number)
  const current =
    ordered.find((period) => period.start_date <= today && period.end_date >= today) ??
    ordered.filter((period) => period.start_date <= today).at(-1)
  if (!current) return []
  return ordered.filter(
    (period) => period.quarter_number <= current.quarter_number && period.start_date <= today,
  )
}

function seedHash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index++) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}

function sampleRating(seed: string) {
  const value = seedHash(seed) % 100
  return value < 12 ? "A" : value < 38 ? "B" : value < 72 ? "C" : value < 92 ? "D" : "E"
}

function ratingKey(entry: ExistingRating) {
  return [
    entry.class_id,
    entry.student_id,
    entry.subject_offering_id,
    entry.grading_period,
    entry.competency,
  ].join(":")
}

export async function seedGradeOneLanguagePaceRatings() {
  const supabase = createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.")

  const teacherId = auth.user.id
  const [classResult, periodResult] = await Promise.all([
    supabase
      .from("classes")
      .select("id,school_year")
      .eq("teacher_id", teacherId)
      .eq("is_active", true)
      .eq("grade_level", 1),
    supabase
      .from("grading_periods")
      .select("school_year,quarter_number,short_label,start_date,end_date")
      .eq("teacher_id", teacherId)
      .order("quarter_number"),
  ])
  throwOnError("Could not load active Grade 1 classes", classResult.error)
  throwOnError("Could not load configured grading periods", periodResult.error)

  const classes = (classResult.data ?? []) as GradeOneClass[]
  if (!classes.length) throw new Error("No active Grade 1 classes were found.")
  const classIds = classes.map((item) => item.id)
  const [subjectResult, enrollmentResult, studentResult] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id,class_id,subject_name")
      .eq("teacher_id", teacherId)
      .eq("is_active", true)
      .in("class_id", classIds),
    supabase
      .from("class_enrollments")
      .select("class_id,student_id")
      .eq("teacher_id", teacherId)
      .eq("status", "active")
      .in("class_id", classIds),
    supabase
      .from("students")
      .select("id,class_id")
      .eq("teacher_id", teacherId)
      .eq("is_active", true)
      .in("class_id", classIds),
  ])
  throwOnError("Could not load Grade 1 subject offerings", subjectResult.error)
  throwOnError("Could not load enrolled pupils", enrollmentResult.error)
  throwOnError("Could not load active pupil records", studentResult.error)

  const subjects = ((subjectResult.data ?? []) as LanguageOffering[]).filter((subject) =>
    subject.subject_name.trim().toLowerCase() === "language",
  )
  if (!subjects.length) {
    throw new Error("No active Language subject offering was found in the active Grade 1 classes.")
  }
  const subjectIds = subjects.map((subject) => subject.id)
  const enrolled = new Set(
    ((enrollmentResult.data ?? []) as Enrollment[]).map(
      (item) => `${item.class_id}:${item.student_id}`,
    ),
  )
  const pupils = ((studentResult.data ?? []) as Student[]).filter((student) =>
    enrolled.has(`${student.class_id}:${student.id}`),
  )
  if (!pupils.length) {
    throw new Error("No active pupils enrolled in the active Grade 1 classes were found.")
  }

  const periods = (periodResult.data ?? []) as GradingPeriod[]
  const today = todayInManila()
  const termsByClass = new Map(
    classes.map((classRecord) => [
      classRecord.id,
      currentTerms(classRecord.school_year, periods, today),
    ]),
  )
  const classesWithTerms = classes.filter((item) => (termsByClass.get(item.id)?.length ?? 0) > 0)
  if (!classesWithTerms.length) {
    throw new Error("No configured Grade 1 term has started. Check the term dates in Settings.")
  }

  const subjectClassIds = new Set(subjects.map((subject) => subject.class_id))
  const eligibleClasses = classesWithTerms.filter((item) => subjectClassIds.has(item.id))
  const eligibleClassIds = new Set(eligibleClasses.map((item) => item.id))
  const eligibleSubjects = subjects.filter((item) => eligibleClassIds.has(item.class_id))
  const eligiblePupils = pupils.filter((item) => eligibleClassIds.has(item.class_id))
  const ratings: Rating[] = []
  for (const subject of eligibleSubjects) {
    const terms = termsByClass.get(subject.class_id) ?? []
    const subjectPupils = eligiblePupils.filter((pupil) => pupil.class_id === subject.class_id)
    for (const term of terms) {
      const competencies = gradeOnePaceCompetenciesForSubject(subject.subject_name, term.key)
      for (const pupil of subjectPupils) {
        for (const competency of competencies) {
          const entry = {
            class_id: subject.class_id,
            student_id: pupil.id,
            subject_offering_id: subject.id,
            grading_period: term.key,
            competency,
          }
          ratings.push({
            ...entry,
            rating: sampleRating(`${subject.class_id}:${pupil.id}:${term.key}:${competency}`),
          })
        }
      }
    }
  }
  if (!ratings.length) {
    throw new Error("No Grade 1 Language PACE competencies are configured for the current terms.")
  }

  const existing = await loadPaged(
    (from, to) =>
      supabase
        .from("competency_records")
        .select("class_id,student_id,subject_offering_id,grading_period,competency")
        .eq("teacher_id", teacherId)
        .in("subject_offering_id", subjectIds)
        .order("class_id")
        .order("student_id")
        .order("subject_offering_id")
        .order("grading_period")
        .order("competency")
        .range(from, to),
    "Could not check existing Language PACE ratings",
  ) as ExistingRating[]
  const existingKeys = new Set(existing.map(ratingKey))
  const missingRatings = ratings.filter((item) => !existingKeys.has(ratingKey(item)))
  for (let index = 0; index < missingRatings.length; index += 500) {
    const { error } = await supabase
      .from("competency_records")
      .insert(missingRatings.slice(index, index + 500).map((item) => ({
        ...item,
        teacher_id: teacherId,
      })))
    throwOnError("Could not add Language PACE ratings", error)
  }

  return {
    classesSeeded: eligibleClasses.length,
    pupilsSeeded: new Set(eligiblePupils.map((item) => item.id)).size,
    termsSeeded: new Set(
      eligibleClasses.flatMap((item) => (termsByClass.get(item.id) ?? []).map((term) => `${item.id}:${term.key}`)),
    ).size,
    ratingsAdded: missingRatings.length,
  }
}
