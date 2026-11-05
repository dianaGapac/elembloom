import {
  academicCategories,
  gradeLevelLabel,
  gradingPeriodsForGrade,
  periodKeyForSchoolYear,
} from "@/lib/academic-structure"
import { createClient } from "@/lib/supabase/client"

const demoBatchId = "academic-activities-sample-v1"

type ClassRecord = {
  id: string
  grade_level: number
  section_name: string
  school_year: string
}
type Period = {
  school_year: string
  quarter_number: number
  short_label: string
  display_name: string
  start_date: string
  end_date: string
}
type SubjectOffering = { id: string; class_id: string; subject_name: string }
type Student = { id: string; class_id: string }
type Enrollment = { class_id: string; student_id: string }
type Activity = { id: string; title: string }
type Assessment = { id: string; activity_id: string; class_id: string }
type Assignment = {
  id: string
  activity_id: string
  class_id: string
  subject_offering_id: string | null
  assessment_id: string | null
}
type AssignmentWrite = {
  id?: string
  activity_id: string
  teacher_id: string
  class_id: string
  subject_offering_id: string | null
  grading_period: string
  school_year: string
  assessment_id: string | null
  demo_batch_id: string
}
type Score = { assessment_id: string; student_id: string }
type ExistingAttendance = { class_id: string; student_id: string; attendance_date: string }
type AttendanceSeed = {
  teacher_id: string
  class_id: string
  student_id: string
  attendance_date: string
  status: "present"
  demo_batch_id: string
}
type ActivitySeed = {
  title: string
  description: string
  activity_type: string
  grading_category: string
  class_id: string
  subject_offering_id: string | null
  subject_name: string
  school_year: string
  grading_period: string
  assessment_date: string
  total_points: number
}

function throwOnError(label: string, error: { message: string } | null) {
  if (!error) return
  const migrationHint = error.message.includes("demo_batch_id")
    ? " Apply supabase/migrations/20261105000000_demo_batch_tracking.sql in the Supabase SQL Editor, then try again."
    : ""
  throw new Error(`${label}: ${error.message}.${migrationHint}`)
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

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index++) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}

function randomInt(seed: string, minimum: number, maximum: number) {
  return minimum + (hash(seed) % (maximum - minimum + 1))
}

function sampleDate(seed: string, startDate: string, endDate: string) {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error(`The configured term date range is invalid (${startDate} – ${endDate}).`)
  }
  const dayCount = Math.floor((end - start) / 86400000)
  return new Date(start + randomInt(seed, 0, dayCount) * 86400000).toISOString().slice(0, 10)
}

function scoreFor(seed: string, totalPoints: number) {
  const percent = randomInt(`${seed}:percentage`, 55, 100)
  return Math.round((totalPoints * percent) / 100)
}

function todayInManila() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function weekdayDates(startDate: string, endDate: string) {
  const start = startDate.slice(0, 10)
  const end = endDate.slice(0, 10)
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(last.getTime())) {
    throw new Error(`The configured Term 1 attendance dates are invalid (${startDate} – ${endDate}).`)
  }
  const dates: string[] = []
  while (cursor <= last) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function makeSeeds(classes: ClassRecord[], subjects: SubjectOffering[], periods: Period[]) {
  const seeds: ActivitySeed[] = []
  const categoryDefinitions = [
    { category: academicCategories[0], activityType: "Written Work", count: 5, randomPoints: true },
    { category: academicCategories[1], activityType: "Performance Task", count: 3, randomPoints: false },
    { category: academicCategories[2], activityType: "Quarterly Examination", count: 1, randomPoints: false },
  ]

  for (const classRecord of classes) {
    const classPeriods = periods.filter((period) => period.school_year === classRecord.school_year)
    const periodOptions = gradingPeriodsForGrade(
      classRecord.grade_level,
      classRecord.school_year,
      classPeriods,
    )
    const termRows = periodOptions.flatMap((option) => {
      const periodKey = periodKeyForSchoolYear(option.short_label, classRecord.school_year)
      const period = classPeriods.find(
        (item) => periodKeyForSchoolYear(item.short_label, classRecord.school_year) === periodKey,
      )
      return period && period.start_date && period.end_date && periodKey
        ? [{ option, period, periodKey }]
        : []
    })
    if (!termRows.length) continue

    const classSubjects = subjects.filter((item) => item.class_id === classRecord.id)
    const offerings = classSubjects.length
      ? classSubjects.map((subject) => ({
          id: subject.id as string | null,
          name: subject.subject_name,
        }))
      : [{ id: null, name: classRecord.section_name || "General" }]

    for (const offering of offerings) {
      for (const { option, period, periodKey } of termRows) {
        for (const definition of categoryDefinitions) {
          for (let index = 0; index < definition.count; index++) {
            const seed = [
              classRecord.id,
              offering.id ?? "general",
              classRecord.school_year,
              periodKey,
              definition.category,
              index + 1,
            ].join(":")
            const totalPoints = definition.randomPoints ? randomInt(`${seed}:points`, 10, 50) : 100
            const classLabel = `${gradeLevelLabel(classRecord.grade_level)} ${classRecord.section_name}`
            const title = `${classLabel} ${offering.name} ${classRecord.school_year} ${option.short_label} ${definition.category} ${index + 1}`
            const activityDate = sampleDate(seed, period.start_date, period.end_date)
            seeds.push({
              title,
              description: `Sample ${definition.category} activity for ${offering.name} in ${option.display_name}.`,
              activity_type: definition.activityType,
              grading_category: definition.category,
              class_id: classRecord.id,
              subject_offering_id: offering.id,
              subject_name: offering.name,
              school_year: classRecord.school_year,
              grading_period: periodKey,
              assessment_date: activityDate,
              total_points: totalPoints,
            })
          }
        }
      }
    }
  }
  return seeds
}

export async function seedAcademicActivitiesSampleData() {
  const supabase = createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.")
  const teacherId = auth.user.id

  const classResult = await supabase
    .from("classes")
    .select("id,grade_level,section_name,school_year")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .gt("grade_level", 1)
    .order("grade_level")
    .order("section_name")
  throwOnError("Could not load active Grade 2 and above classes", classResult.error)
  const classes = (classResult.data ?? []) as ClassRecord[]
  if (!classes.length) {
    throw new Error("No active Grade 2 and above classes were found. Kinder and Grade 1 do not use numeric academic activities.")
  }

  const classIds = classes.map((item) => item.id)
  const [periodResult, subjectResult, enrollmentRows, studentRows] = await Promise.all([
    supabase
      .from("grading_periods")
      .select("school_year,quarter_number,short_label,display_name,start_date,end_date")
      .eq("teacher_id", teacherId)
      .order("quarter_number"),
    supabase
      .from("class_subjects")
      .select("id,class_id,subject_name")
      .eq("teacher_id", teacherId)
      .eq("is_active", true)
      .in("class_id", classIds),
    loadPaged(
      (from, to) => supabase
        .from("class_enrollments")
        .select("class_id,student_id")
        .eq("teacher_id", teacherId)
        .eq("status", "active")
        .in("class_id", classIds)
        .order("class_id")
        .order("student_id")
        .range(from, to),
      "Could not load active class enrollments",
    ),
    loadPaged(
      (from, to) => supabase
        .from("students")
        .select("id,class_id")
        .eq("teacher_id", teacherId)
        .eq("is_active", true)
        .in("class_id", classIds)
        .order("class_id")
        .order("id")
        .range(from, to),
      "Could not load active pupils",
    ),
  ])
  throwOnError("Could not load configured grading periods", periodResult.error)
  throwOnError("Could not load active subject offerings", subjectResult.error)

  const periods = (periodResult.data ?? []) as Period[]
  const subjects = (subjectResult.data ?? []) as SubjectOffering[]
  const seeds = makeSeeds(classes, subjects, periods)
  if (!seeds.length) {
    throw new Error("No configured grading terms were found for active Grade 2 and above classes.")
  }

  const titles = seeds.map((item) => item.title)
  const existingActivities = await loadPaged(
    (from, to) => supabase
      .from("academic_activities")
      .select("id,title")
      .eq("teacher_id", teacherId)
      .eq("demo_batch_id", demoBatchId)
      .order("title")
      .range(from, to),
    "Could not check existing sample activities",
  ) as Activity[]
  const activitiesByTitle = new Map(
    existingActivities.filter((item) => titles.includes(item.title)).map((item) => [item.title, item.id]),
  )
  const missingSeeds = seeds.filter((item) => !activitiesByTitle.has(item.title))
  let activitiesCreated = 0
  for (const batch of chunks(missingSeeds, 500)) {
    const { data, error } = await supabase
      .from("academic_activities")
      .insert(batch.map((item) => ({
        teacher_id: teacherId,
        title: item.title,
        description: item.description,
        instructions: "Complete the activity and review your result with your teacher.",
        activity_type: item.activity_type,
        total_points: item.total_points,
        passing_percentage: 75,
        due_date: item.assessment_date,
        demo_batch_id: demoBatchId,
      })))
      .select("id,title")
    throwOnError("Could not create sample academic activities", error)
    for (const activity of (data ?? []) as Activity[]) activitiesByTitle.set(activity.title, activity.id)
    activitiesCreated += data?.length ?? 0
  }
  if (seeds.some((item) => !activitiesByTitle.has(item.title))) {
    throw new Error("Some sample activities were not returned after creation.")
  }

  const seedByActivityId = new Map(
    seeds.map((item) => [activitiesByTitle.get(item.title)!, item]),
  )
  const activityIds = [...seedByActivityId.keys()]
  const assignments = await loadPaged(
    (from, to) => supabase
      .from("academic_activity_assignments")
      .select("id,activity_id,class_id,subject_offering_id,assessment_id")
      .eq("teacher_id", teacherId)
      .eq("demo_batch_id", demoBatchId)
      .in("activity_id", activityIds)
      .order("activity_id")
      .range(from, to),
    "Could not check sample class assignments",
  ) as Assignment[]
  const assignmentsByActivityId = new Map(assignments.map((item) => [item.activity_id, item]))

  const existingAssessments = await loadPaged(
    (from, to) => supabase
      .from("assessments")
      .select("id,activity_id,class_id")
      .eq("teacher_id", teacherId)
      .eq("demo_batch_id", demoBatchId)
      .in("activity_id", activityIds)
      .order("activity_id")
      .range(from, to),
    "Could not check sample assessments",
  ) as Assessment[]
  const assessmentsByActivityId = new Map(existingAssessments.map((item) => [item.activity_id, item]))
  const missingAssessments = activityIds.filter((activityId) => !assessmentsByActivityId.has(activityId))
  let assessmentsCreated = 0
  for (const batch of chunks(missingAssessments, 500)) {
    const { data, error } = await supabase
      .from("assessments")
      .insert(batch.map((activityId) => {
        const seed = seedByActivityId.get(activityId)!
        return {
          teacher_id: teacherId,
          class_id: seed.class_id,
          title: seed.title,
          assessment_type: seed.activity_type,
          grading_category: seed.grading_category,
          subject: seed.subject_name,
          subject_offering_id: seed.subject_offering_id,
          school_year: seed.school_year,
          grading_period: seed.grading_period,
          assessment_date: seed.assessment_date,
          activity_date: seed.assessment_date,
          due_date: seed.assessment_date,
          total_points: seed.total_points,
          passing_percentage: 75,
          activity_id: activityId,
          status: "published",
          demo_batch_id: demoBatchId,
        }
      }))
      .select("id,activity_id,class_id")
    throwOnError("Could not create sample assessments", error)
    for (const assessment of (data ?? []) as Assessment[]) assessmentsByActivityId.set(assessment.activity_id, assessment)
    assessmentsCreated += data?.length ?? 0
  }

  const assignmentRows: AssignmentWrite[] = []
  for (const activityId of activityIds) {
    const seed = seedByActivityId.get(activityId)!
    const assessmentId = assessmentsByActivityId.get(activityId)?.id
    const existing = assignmentsByActivityId.get(activityId)
    const assignment: AssignmentWrite = {
      ...(existing ? { id: existing.id } : {}),
      activity_id: activityId,
      teacher_id: teacherId,
      class_id: seed.class_id,
      subject_offering_id: seed.subject_offering_id,
      grading_period: seed.grading_period,
      school_year: seed.school_year,
      assessment_id: assessmentId ?? null,
      demo_batch_id: demoBatchId,
    }
    if (!existing || !existing.assessment_id) assignmentRows.push(assignment)
  }
  let assignmentsCreated = 0
  for (const batch of chunks(assignmentRows.filter((item) => !item.id), 500)) {
    const { error } = await supabase.from("academic_activity_assignments").insert(batch)
    throwOnError("Could not assign sample activities to classes", error)
    assignmentsCreated += batch.length
  }
  for (const assignment of assignmentRows.filter((item) => item.id)) {
    const { error } = await supabase
      .from("academic_activity_assignments")
      .update({ assessment_id: assignment.assessment_id })
      .eq("teacher_id", teacherId)
      .eq("id", assignment.id)
    throwOnError("Could not link a sample assessment to its class assignment", error)
  }

  const assessmentsById = new Map(
    [...assessmentsByActivityId.values()].map((item) => [item.id, item]),
  )
  const pupils = (studentRows as Student[])
  const enrollmentSet = new Set(
    (enrollmentRows as Enrollment[]).map((item) => `${item.class_id}:${item.student_id}`),
  )
  const activePupilsByClass = new Map<string, Student[]>()
  for (const pupil of pupils) {
    if (!enrollmentSet.has(`${pupil.class_id}:${pupil.id}`)) continue
    activePupilsByClass.set(pupil.class_id, [...(activePupilsByClass.get(pupil.class_id) ?? []), pupil])
  }
  const pupilIds = pupils.map((item) => item.id)
  const existingScores = pupilIds.length
    ? await loadPaged(
        (from, to) => supabase
          .from("assessment_scores")
          .select("assessment_id,student_id")
          .eq("teacher_id", teacherId)
          .eq("demo_batch_id", demoBatchId)
          .in("assessment_id", [...assessmentsById.keys()])
          .in("student_id", pupilIds)
          .order("assessment_id")
          .order("student_id")
          .range(from, to),
        "Could not check existing sample pupil scores",
      ) as Score[]
    : []
  const scoreKeys = new Set(existingScores.map((item) => `${item.assessment_id}:${item.student_id}`))
  const scoreRows = [...assessmentsById.values()].flatMap((assessment) => {
    const seed = seedByActivityId.get(assessment.activity_id)!
    return (activePupilsByClass.get(seed.class_id) ?? [])
      .filter((pupil) => !scoreKeys.has(`${assessment.id}:${pupil.id}`))
      .map((pupil) => ({
        teacher_id: teacherId,
        assessment_id: assessment.id,
        student_id: pupil.id,
        score: scoreFor(`${assessment.id}:${pupil.id}`, seed.total_points),
        remarks: "Generated sample score",
        demo_batch_id: demoBatchId,
      }))
  })
  for (const batch of chunks(scoreRows, 500)) {
    const { error } = await supabase.from("assessment_scores").insert(batch)
    throwOnError("Could not create sample pupil scores", error)
  }

  const today = todayInManila()
  const gradeThreeClasses = classes.filter((item) => item.grade_level === 3)
  const attendanceStarts = new Map<string, string>()
  for (const classRecord of gradeThreeClasses) {
    const classPeriods = periods
      .filter((period) => period.school_year === classRecord.school_year)
      .sort((a, b) => a.quarter_number - b.quarter_number)
    const firstPeriod = gradingPeriodsForGrade(
      classRecord.grade_level,
      classRecord.school_year,
      classPeriods,
    )[0]
    const termOne = classPeriods.find(
      (period) =>
        periodKeyForSchoolYear(period.short_label, classRecord.school_year) ===
        periodKeyForSchoolYear(firstPeriod?.short_label, classRecord.school_year),
    )
    if (!termOne?.start_date) {
      throw new Error(`Term 1 start date is not configured for Grade 3 ${classRecord.section_name} (${classRecord.school_year}).`)
    }
    const startDate = termOne.start_date.slice(0, 10)
    if (startDate > today) continue
    attendanceStarts.set(classRecord.id, startDate)
  }
  const gradeThreeClassIds = new Set(attendanceStarts.keys())
  const gradeThreePupilsByClass = new Map<string, Student[]>()
  for (const pupil of pupils) {
    if (!gradeThreeClassIds.has(pupil.class_id) || !enrollmentSet.has(`${pupil.class_id}:${pupil.id}`)) continue
    gradeThreePupilsByClass.set(
      pupil.class_id,
      [...(gradeThreePupilsByClass.get(pupil.class_id) ?? []), pupil],
    )
  }
  const gradeThreePupilIds = [...new Set(
    [...gradeThreePupilsByClass.values()].flat().map((pupil) => pupil.id),
  )]
  const attendanceStartDate = [...attendanceStarts.values()].sort()[0]
  const existingAttendance = gradeThreePupilIds.length && attendanceStartDate
    ? await loadPaged(
        (from, to) => supabase
          .from("attendance")
          .select("class_id,student_id,attendance_date")
          .eq("teacher_id", teacherId)
          .in("class_id", [...gradeThreeClassIds])
          .in("student_id", gradeThreePupilIds)
          .gte("attendance_date", attendanceStartDate)
          .lte("attendance_date", today)
          .order("class_id")
          .order("student_id")
          .order("attendance_date")
          .range(from, to),
        "Could not check existing Grade 3 attendance records",
      ) as ExistingAttendance[]
    : []
  const attendanceKeys = new Set(
    existingAttendance.map((item) => `${item.class_id}:${item.student_id}:${item.attendance_date}`),
  )
  const attendanceRows: AttendanceSeed[] = []
  for (const [classId, classPupils] of gradeThreePupilsByClass) {
    const startDate = attendanceStarts.get(classId)
    if (!startDate) continue
    for (const date of weekdayDates(startDate, today)) {
      for (const pupil of classPupils) {
        if (attendanceKeys.has(`${classId}:${pupil.id}:${date}`)) continue
        attendanceRows.push({
          teacher_id: teacherId,
          class_id: classId,
          student_id: pupil.id,
          attendance_date: date,
          status: "present",
          demo_batch_id: demoBatchId,
        })
      }
    }
  }
  for (const batch of chunks(attendanceRows, 500)) {
    const { error } = await supabase.from("attendance").insert(batch)
    throwOnError("Could not add missing Grade 3 attendance records", error)
  }

  const seededClassIds = new Set(seeds.map((item) => item.class_id))
  const subjectKeys = new Set(seeds.map((item) => `${item.class_id}:${item.subject_offering_id ?? "general"}`))
  const termKeys = new Set(seeds.map((item) => `${item.class_id}:${item.school_year}:${item.grading_period}`))
  return {
    classesSeeded: seededClassIds.size,
    subjectOfferingsSeeded: subjectKeys.size,
    termsSeeded: termKeys.size,
    activitiesCreated,
    assessmentsCreated,
    assignmentsCreated,
    scoresCreated: scoreRows.length,
    gradeThreeAttendanceAdded: attendanceRows.length,
    totalActivities: seeds.length,
  }
}
