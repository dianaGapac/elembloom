import {
  gradeOnePaceCompetenciesForSubject,
  kinderCompetencyList,
  normalizePeriod,
} from "@/lib/academic-structure"
import { createClient } from "@/lib/supabase/client"

type EarlyClass = {
  id: string
  grade_level: number
  section_name: string
  school_year: string
}
type Period = {
  school_year: string
  quarter_number: number
  short_label: string
  start_date: string
  end_date: string
}
type Pupil = { id: string; class_id: string }
type SubjectOffering = { id: string; class_id: string; subject_name: string }
type CompetencyEntry = {
  class_id: string
  student_id: string
  subject_offering_id: string
  grading_period: string
  competency: string
  rating: string
}
type AttendanceEntry = {
  teacher_id: string
  class_id: string
  student_id: string
  attendance_date: string
  status: "present" | "late" | "absent" | "excused"
}

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

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index++) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function periodsThroughCurrentTerm(
  schoolYear: string,
  periods: Period[],
  today: string,
) {
  const ordered = periods
    .filter((period) => period.school_year === schoolYear)
    .map((period) => ({
      ...period,
      start_date: period.start_date.slice(0, 10),
      end_date: period.end_date.slice(0, 10),
      key: normalizePeriod(period.short_label)?.replace(/^Q/, "T"),
    }))
    .filter((period) => period.key && /^T[1-3]$/.test(period.key))
    .sort((a, b) => a.quarter_number - b.quarter_number)
  const current =
    ordered.find((period) => period.start_date <= today && period.end_date >= today) ??
    ordered.filter((period) => period.start_date <= today).at(-1)
  if (!current) return []
  return ordered.filter(
    (period) => period.quarter_number <= current.quarter_number && period.start_date <= today,
  )
}

function weekdayDates(startDate: string, endDate: string) {
  const dates: string[] = []
  const cursor = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cursor <= end) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function sampleRating(seed: string, gradeLevel: number) {
  const value = hash(seed) % 100
  if (gradeLevel === 0) return value < 60 ? "CO" : value < 88 ? "DV" : "BG"
  return value < 12 ? "A" : value < 38 ? "B" : value < 72 ? "C" : value < 92 ? "D" : "E"
}

function sampleNarrative(studentId: string, termNumber: number) {
  const learner = hash(studentId) % 3
  const strengths = [
    "participates in guided activities and is building confidence when sharing ideas",
    "shows curiosity during classroom tasks and responds well to clear examples",
    "is developing steady routines and benefits from opportunities to practise independently",
  ]
  const nextSteps = [
    "continue practising the term's key skills through short, regular activities",
    "strengthen independence by reviewing instructions and checking work step by step",
    "build confidence by explaining ideas and trying a second strategy when needed",
  ]
  return {
    what_child_can_do: `Sample progress note: The pupil ${strengths[(learner + termNumber) % strengths.length]}.`,
    learning_to_improve: `Sample next step: ${nextSteps[(learner + termNumber * 2) % nextSteps.length]}.`,
    teacher_comments: "Sample seeded narrative. Review and personalize before sharing with families.",
  }
}

export async function seedEarlyLearningSampleData() {
  const supabase = createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.")

  const today = todayInManila()
  const [classResult, periodResult] = await Promise.all([
    supabase
      .from("classes")
      .select("id,grade_level,section_name,school_year")
      .eq("teacher_id", auth.user.id)
      .eq("is_active", true)
      .in("grade_level", [0, 1])
      .order("grade_level")
      .order("section_name"),
    supabase
      .from("grading_periods")
      .select("school_year,quarter_number,short_label,start_date,end_date")
      .eq("teacher_id", auth.user.id)
      .order("quarter_number"),
  ])
  throwOnError("Could not load Kinder and Grade 1 classes", classResult.error)
  throwOnError("Could not load configured grading periods", periodResult.error)
  const classes = (classResult.data ?? []) as EarlyClass[]
  if (!classes.length) {
    throw new Error("No active Kinder or Grade 1 classes were found.")
  }

  const classIds = classes.map((item) => item.id)
  const [subjectResult, enrollmentResult, studentResult] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id,class_id,subject_name")
      .eq("teacher_id", auth.user.id)
      .eq("is_active", true)
      .in("class_id", classIds),
    supabase
      .from("class_enrollments")
      .select("class_id,student_id")
      .eq("teacher_id", auth.user.id)
      .eq("status", "active")
      .in("class_id", classIds),
    supabase
      .from("students")
      .select("id,class_id")
      .eq("teacher_id", auth.user.id)
      .eq("is_active", true)
      .in("class_id", classIds),
  ])
  throwOnError("Could not load early-learning subject offerings", subjectResult.error)
  throwOnError("Could not load enrolled pupils", enrollmentResult.error)
  throwOnError("Could not load pupil records", studentResult.error)

  const subjects = (subjectResult.data ?? []) as SubjectOffering[]
  const students = (studentResult.data ?? []) as Pupil[]
  const enrolled = new Set(
    (enrollmentResult.data ?? []).map((item) => `${item.class_id}:${item.student_id}`),
  )
  const pupils = students.filter((student) => enrolled.has(`${student.class_id}:${student.id}`))
  if (!pupils.length) {
    throw new Error("No active pupils enrolled in the active Kinder or Grade 1 classes were found.")
  }

  const classPeriods = new Map(
    classes.map((classRecord) => [
      classRecord.id,
      periodsThroughCurrentTerm(
        classRecord.school_year,
        (periodResult.data ?? []) as Period[],
        today,
      ),
    ]),
  )
  const eligibleClassIds = classes
    .filter((classRecord) => (classPeriods.get(classRecord.id)?.length ?? 0) > 0)
    .map((classRecord) => classRecord.id)
  if (!eligibleClassIds.length) {
    throw new Error("No configured term has started for the active Kinder or Grade 1 classes. Check term dates in Settings.")
  }

  const ratings: CompetencyEntry[] = []
  for (const classRecord of classes.filter((item) => eligibleClassIds.includes(item.id))) {
    const classPupils = pupils.filter((student) => student.class_id === classRecord.id)
    const classSubjects = subjects.filter((subject) => subject.class_id === classRecord.id)
    for (const term of classPeriods.get(classRecord.id) ?? []) {
      for (const subject of classSubjects) {
        const competencyNames = classRecord.grade_level === 0
          ? kinderCompetencyList().map((item) => item.key)
          : gradeOnePaceCompetenciesForSubject(subject.subject_name, term.key)
        for (const pupil of classPupils) {
          for (const competency of competencyNames) {
            ratings.push({
              class_id: classRecord.id,
              student_id: pupil.id,
              subject_offering_id: subject.id,
              grading_period: term.key!,
              competency,
              rating: sampleRating(
                `${classRecord.id}:${pupil.id}:${subject.id}:${term.key}:${competency}`,
                classRecord.grade_level,
              ),
            })
          }
        }
      }
    }
  }

  const eligiblePeriodKeys = [...new Set(ratings.map((item) => item.grading_period))]
  const [existingRatings, existingReports] = await Promise.all([
    eligiblePeriodKeys.length
      ? loadPaged(
          (from, to) => supabase
          .from("competency_records")
          .select("class_id,student_id,subject_offering_id,grading_period,competency")
          .eq("teacher_id", auth.user.id)
          .in("class_id", eligibleClassIds)
          .in("grading_period", eligiblePeriodKeys)
          .order("class_id")
          .order("student_id")
          .order("subject_offering_id")
          .order("grading_period")
          .order("competency")
          .range(from, to),
          "Could not check existing competency ratings",
        )
      : Promise.resolve([]),
    loadPaged(
      (from, to) => supabase
      .from("early_learning_reports")
      .select("class_id,student_id,school_year,grading_period")
      .eq("teacher_id", auth.user.id)
      .in("class_id", eligibleClassIds)
      .order("class_id")
      .order("student_id")
      .order("school_year")
      .order("grading_period")
      .range(from, to),
      "Could not check existing term reports",
    ),
  ])

  const ratingKeys = new Set(
    existingRatings.map((item) =>
      `${item.class_id}:${item.student_id}:${item.subject_offering_id}:${item.grading_period}:${item.competency}`,
    ),
  )
  const missingRatings = ratings.filter(
    (item) =>
      !ratingKeys.has(
        `${item.class_id}:${item.student_id}:${item.subject_offering_id}:${item.grading_period}:${item.competency}`,
      ),
  )
  for (const batch of chunks(missingRatings, 500)) {
    const { error } = await supabase.from("competency_records").insert(
      batch.map((item) => ({ ...item, teacher_id: auth.user.id, notes: "Sample seeded rating." })),
    )
    throwOnError("Could not seed competency ratings", error)
  }

  const reportKeys = new Set(
    existingReports.map((item) =>
      `${item.class_id}:${item.student_id}:${item.school_year}:${item.grading_period}`,
    ),
  )
  const missingReports = classes
    .filter((classRecord) => eligibleClassIds.includes(classRecord.id))
    .flatMap((classRecord) =>
      (classPeriods.get(classRecord.id) ?? []).flatMap((term) =>
        pupils
          .filter((student) => student.class_id === classRecord.id)
          .filter(
            (student) =>
              !reportKeys.has(
                `${classRecord.id}:${student.id}:${classRecord.school_year}:${term.key}`,
              ),
          )
          .map((student) => ({
            teacher_id: auth.user.id,
            class_id: classRecord.id,
            student_id: student.id,
            school_year: classRecord.school_year,
            grading_period: term.key!,
            ...sampleNarrative(student.id, term.quarter_number),
          })),
      ),
    )
  for (const batch of chunks(missingReports, 500)) {
    const { error } = await supabase.from("early_learning_reports").insert(batch)
    throwOnError("Could not seed term progress reports", error)
  }

  let attendanceAdded = 0
  for (const classRecord of classes.filter((item) => eligibleClassIds.includes(item.id))) {
    const classPupils = pupils.filter((student) => student.class_id === classRecord.id)
    if (!classPupils.length) continue
    const firstTermStart = classPeriods.get(classRecord.id)?.find((term) => term.key === "T1")?.start_date
    if (!firstTermStart || firstTermStart > today) continue
    const existingAttendance = await loadPaged(
      (from, to) => supabase
        .from("attendance")
        .select("class_id,student_id,attendance_date")
        .eq("teacher_id", auth.user.id)
        .in("student_id", classPupils.map((student) => student.id))
        .gte("attendance_date", firstTermStart)
        .lte("attendance_date", today)
        .order("class_id")
        .order("student_id")
        .order("attendance_date")
        .range(from, to),
      "Could not check existing attendance",
    )
    const attendanceKeys = new Set(
      existingAttendance.map((item) => `${item.class_id}:${item.student_id}:${item.attendance_date}`),
    )
    const attendanceRows: AttendanceEntry[] = weekdayDates(firstTermStart, today).flatMap((date) =>
      classPupils
        .filter((student) => !attendanceKeys.has(`${classRecord.id}:${student.id}:${date}`))
        .map((student) => ({
          teacher_id: auth.user.id,
          class_id: classRecord.id,
          student_id: student.id,
          attendance_date: date,
          status: "present",
        })),
    )
    for (const batch of chunks(attendanceRows, 500)) {
      const { error } = await supabase.from("attendance").insert(batch)
      throwOnError("Could not seed attendance records", error)
      attendanceAdded += batch.length
    }
  }

  return {
    classesSeeded: eligibleClassIds.length,
    pupilsSeeded: pupils.filter((pupil) => eligibleClassIds.includes(pupil.class_id)).length,
    termsSeeded: classes
      .filter((classRecord) => eligibleClassIds.includes(classRecord.id))
      .reduce((sum, classRecord) => sum + (classPeriods.get(classRecord.id)?.length ?? 0), 0),
    ratingsAdded: missingRatings.length,
    reportsAdded: missingReports.length,
    attendanceAdded,
  }
}
