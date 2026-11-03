import { categoryWeightsFor, isTrimesterSchoolYear, periodKeyForSchoolYear } from "@/lib/academic-structure"
import { createClient } from "@/lib/supabase/client"

const demoBatchId = "grade2-sampaguita-science-t1-v1"
const studentDefinitions = [
  { first_name: "Amara", last_name: "Santos", gender: "female" },
  { first_name: "Bianca", last_name: "Reyes", gender: "female" },
  { first_name: "Clarisse", last_name: "Cruz", gender: "female" },
  { first_name: "Danica", last_name: "Garcia", gender: "female" },
  { first_name: "Eliana", last_name: "Mendoza", gender: "female" },
  { first_name: "Adrian", last_name: "Dela Cruz", gender: "male" },
  { first_name: "Benjamin", last_name: "Flores", gender: "male" },
  { first_name: "Carlo", last_name: "Navarro", gender: "male" },
  { first_name: "Daniel", last_name: "Ramos", gender: "male" },
  { first_name: "Ethan", last_name: "Castillo", gender: "male" },
]

const activityDefinitions = [
  ...Array.from({ length: 5 }, (_, index) => ({
    title: `Science T1 Written/Oral Work ${String(index + 1).padStart(2, "0")}`,
    activityType: "Written Work",
    category: "Written/Oral Works",
    totalPoints: 20,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    title: `Science T1 Performance Task ${String(index + 1).padStart(2, "0")}`,
    activityType: "Performance Task",
    category: "Product/Performance Tasks",
    totalPoints: 40,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    title: `Science T1 Examination ${String(index + 1).padStart(2, "0")}`,
    activityType: "Examination",
    category: "Examinations",
    totalPoints: 40,
  })),
]

function throwOnError(label: string, error: { message: string } | null) {
  if (!error) return
  const migrationHint = error.message.includes("demo_batch_id")
    ? " Apply supabase/migrations/20261105000000_demo_batch_tracking.sql in the Supabase SQL Editor, then try again."
    : ""
  throw new Error(`${label}: ${error.message}.${migrationHint}`)
}

async function removeLegacyDemoRecords(supabase: ReturnType<typeof createClient>, teacherId: string) {
  const [classesResult, studentsResult, activitiesResult, titleAssessmentsResult] = await Promise.all([
    supabase.from("classes").select("id").eq("teacher_id", teacherId).like("section_name", "Demo -%"),
    supabase.from("students").select("id").eq("teacher_id", teacherId).like("student_number", "DEMO-%"),
    supabase.from("academic_activities").select("id").eq("teacher_id", teacherId).like("title", "Demo %"),
    supabase.from("assessments").select("id").eq("teacher_id", teacherId).like("title", "Demo %"),
  ])
  for (const [label, result] of [
    ["Could not find legacy demo classes", classesResult],
    ["Could not find legacy demo pupils", studentsResult],
    ["Could not find legacy demo activities", activitiesResult],
    ["Could not find legacy demo assessments", titleAssessmentsResult],
  ] as const) throwOnError(label, result.error)

  const classIds = (classesResult.data ?? []).map((row) => row.id)
  const studentIds = new Set((studentsResult.data ?? []).map((row) => row.id))
  const activityIds = new Set((activitiesResult.data ?? []).map((row) => row.id))
  const assessmentIds = new Set((titleAssessmentsResult.data ?? []).map((row) => row.id))

  if (classIds.length) {
    const [classActivitiesResult, classAssessmentsResult, classSubjectsResult, classStudentsResult] = await Promise.all([
      supabase.from("academic_activity_assignments").select("activity_id").eq("teacher_id", teacherId).in("class_id", classIds),
      supabase.from("assessments").select("id,activity_id").eq("teacher_id", teacherId).in("class_id", classIds),
      supabase.from("class_subjects").select("id").eq("teacher_id", teacherId).in("class_id", classIds),
      supabase.from("students").select("id").eq("teacher_id", teacherId).in("class_id", classIds),
    ])
    throwOnError("Could not find legacy demo class activities", classActivitiesResult.error)
    throwOnError("Could not find legacy demo class assessments", classAssessmentsResult.error)
    throwOnError("Could not find legacy demo class subjects", classSubjectsResult.error)
    throwOnError("Could not find pupils in legacy demo classes", classStudentsResult.error)
    for (const row of classActivitiesResult.data ?? []) activityIds.add(row.activity_id)
    for (const row of classAssessmentsResult.data ?? []) {
      assessmentIds.add(row.id)
      if (row.activity_id) activityIds.add(row.activity_id)
    }
    for (const row of classStudentsResult.data ?? []) studentIds.add(row.id)

    const subjectIds = (classSubjectsResult.data ?? []).map((row) => row.id)
    if (subjectIds.length) {
      const { error } = await supabase.from("class_grading_configurations").delete().eq("teacher_id", teacherId).in("class_subject_id", subjectIds)
      throwOnError("Could not remove legacy demo grading settings", error)
    }
  }

  const activityIdList = [...activityIds]
  if (activityIdList.length) {
    const { error } = await supabase.from("academic_activity_assignments").delete().eq("teacher_id", teacherId).in("activity_id", activityIdList)
    throwOnError("Could not remove legacy demo activity assignments", error)
  }
  if (classIds.length) {
    const { error } = await supabase.from("academic_activity_assignments").delete().eq("teacher_id", teacherId).in("class_id", classIds)
    throwOnError("Could not remove legacy demo class assignments", error)
  }

  const studentIdList = [...studentIds]
  const assessmentIdList = [...assessmentIds]
  if (assessmentIdList.length) {
    const { error } = await supabase.from("assessment_scores").delete().eq("teacher_id", teacherId).in("assessment_id", assessmentIdList)
    throwOnError("Could not remove legacy demo scores", error)
  }
  if (studentIdList.length) {
    const { error } = await supabase.from("assessment_scores").delete().eq("teacher_id", teacherId).in("student_id", studentIdList)
    throwOnError("Could not remove scores for legacy demo pupils", error)
  }
  if (classIds.length || studentIdList.length) {
    if (classIds.length) {
      const { error } = await supabase.from("attendance").delete().eq("teacher_id", teacherId).in("class_id", classIds)
      throwOnError("Could not remove legacy demo class attendance", error)
    }
    if (studentIdList.length) {
      const { error } = await supabase.from("attendance").delete().eq("teacher_id", teacherId).in("student_id", studentIdList)
      throwOnError("Could not remove attendance for legacy demo pupils", error)
      const { error: competencyError } = await supabase.from("competency_records").delete().eq("teacher_id", teacherId).in("student_id", studentIdList)
      throwOnError("Could not remove competency records for legacy demo pupils", competencyError)
    }
    if (classIds.length) {
      const { error } = await supabase.from("competency_records").delete().eq("teacher_id", teacherId).in("class_id", classIds)
      throwOnError("Could not remove competency records for legacy demo classes", error)
    }
  }
  if (assessmentIdList.length) {
    const { error } = await supabase.from("assessments").delete().eq("teacher_id", teacherId).in("id", assessmentIdList)
    throwOnError("Could not remove legacy demo assessments", error)
  }
  if (activityIdList.length) {
    const { error } = await supabase.from("academic_activities").delete().eq("teacher_id", teacherId).in("id", activityIdList)
    throwOnError("Could not remove legacy demo activities", error)
  }
  if (classIds.length) {
    const { error } = await supabase.from("class_enrollments").delete().eq("teacher_id", teacherId).in("class_id", classIds)
    throwOnError("Could not remove legacy demo class enrollments", error)
    const { error: studentsError } = await supabase.from("students").delete().eq("teacher_id", teacherId).in("class_id", classIds)
    throwOnError("Could not remove pupils from legacy demo classes", studentsError)
    const { error: classSubjectsError } = await supabase.from("class_subjects").delete().eq("teacher_id", teacherId).in("class_id", classIds)
    throwOnError("Could not remove legacy demo subjects", classSubjectsError)
    const { error: classesError } = await supabase.from("classes").delete().eq("teacher_id", teacherId).in("id", classIds)
    throwOnError("Could not remove legacy demo classes", classesError)
  }
  if (studentIdList.length) {
    const { error } = await supabase.from("class_enrollments").delete().eq("teacher_id", teacherId).in("student_id", studentIdList)
    throwOnError("Could not remove enrollments for legacy demo pupils", error)
    const { error: studentError } = await supabase.from("students").delete().eq("teacher_id", teacherId).in("id", studentIdList)
    throwOnError("Could not remove legacy demo pupils", studentError)
  }
}

function schoolYearWeekdays(schoolYear: string, count: number) {
  const dates: string[] = []
  const startYear = Number(schoolYear.match(/\d{4}/)?.[0])
  const cursor = new Date(Date.UTC(startYear, 8, 1, 12))
  while (dates.length < count) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export async function seedGrade2SampaguitaSample(schoolYear: string, onProgress?: (message: string) => void) {
  if (!isTrimesterSchoolYear(schoolYear)) {
    throw new Error("The configured school year must use the trimester structure before seeding Term 1 sample data.")
  }
  onProgress?.("Checking the sample class and database setup...")
  const supabase = createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error(authError?.message ?? "Please sign in again before seeding sample data.")
  const teacherId = auth.user.id

  const { data: existingTargetClass, error: classLookupError } = await supabase.from("classes")
    .select("id,demo_batch_id")
    .eq("teacher_id", teacherId)
    .eq("grade_level", 2)
    .eq("section_name", "Sampaguita")
    .eq("school_year", schoolYear)
    .maybeSingle()
  throwOnError("Could not check the Grade 2 Sampaguita class", classLookupError)
  if (existingTargetClass && existingTargetClass.demo_batch_id !== demoBatchId) {
    throw new Error("A Grade 2 Sampaguita class already exists for this school year and is not marked as this sample. No target-class records were changed.")
  }

  onProgress?.("Removing only matching legacy demo records...")
  await removeLegacyDemoRecords(supabase, teacherId)

  const { error: activityTypesError } = await supabase.from("academic_activity_types").upsert(
    ["Written Work", "Examination"].map((name) => ({ teacher_id: teacherId, name })),
    { onConflict: "teacher_id,name" },
  )
  throwOnError("Could not register the sample activity types", activityTypesError)

  let classId = existingTargetClass?.id
  let classesCreated = 0
  if (!classId) {
    onProgress?.("Creating Grade 2 - Sampaguita...")
    const { data, error } = await supabase.from("classes").insert({
      teacher_id: teacherId,
      grade_level: 2,
      section_name: "Sampaguita",
      school_year: schoolYear,
      subject_name: "Science",
      is_active: true,
      demo_batch_id: demoBatchId,
    }).select("id").single()
    throwOnError("Could not create Grade 2 Sampaguita", error)
    if (!data) throw new Error("Class creation returned no record.")
    classId = data.id
    classesCreated = 1
  }

  const [subjectLookup, studentsLookup] = await Promise.all([
    supabase.from("class_subjects").select("id").eq("teacher_id", teacherId).eq("class_id", classId).eq("demo_batch_id", demoBatchId).maybeSingle(),
    supabase.from("students").select("id,student_number,first_name,last_name,gender").eq("teacher_id", teacherId).eq("class_id", classId).eq("demo_batch_id", demoBatchId),
  ])
  throwOnError("Could not check the sample Science subject", subjectLookup.error)
  throwOnError("Could not check the sample pupils", studentsLookup.error)
  let subjectOfferingId = subjectLookup.data?.id
  let subjectsCreated = 0
  if (!subjectOfferingId) {
    const { data, error } = await supabase.from("class_subjects").insert({
      teacher_id: teacherId,
      class_id: classId,
      subject_name: "Science",
      is_active: true,
      demo_batch_id: demoBatchId,
    }).select("id").single()
    throwOnError("Could not add Science to the sample class", error)
    if (!data) throw new Error("Science subject creation returned no record.")
    subjectOfferingId = data.id
    subjectsCreated = 1
  }

  const { data: savedPolicies, error: policiesError } = await supabase.from("class_grading_configurations")
    .select("id,grading_period")
    .eq("teacher_id", teacherId)
    .eq("class_subject_id", subjectOfferingId)
    .eq("school_year", schoolYear)
  throwOnError("Could not check the Science grading policies", policiesError)
  const availablePolicyPeriods = new Set((savedPolicies ?? []).map((policy) => periodKeyForSchoolYear(policy.grading_period, schoolYear)))
  const weights = categoryWeightsFor(2, "Science")
  const missingPolicies = ["T1", "T2", "T3"].filter((term) => !availablePolicyPeriods.has(term as "T1" | "T2" | "T3"))
  if (missingPolicies.length) {
    const { error } = await supabase.from("class_grading_configurations").insert(missingPolicies.map((gradingPeriod) => ({
      teacher_id: teacherId,
      class_subject_id: subjectOfferingId,
      school_year: schoolYear,
      grading_period: gradingPeriod,
      written_work_weight: weights["Written/Oral Works"],
      performance_tasks_weight: weights["Product/Performance Tasks"],
      quarterly_exam_weight: weights.Examinations,
      passing_grade: 75,
      decimal_places: 2,
      rounding_method: "half_up",
      is_active: true,
      demo_batch_id: demoBatchId,
    })))
    throwOnError("Could not initialize the Science grading policies", error)
  }
  const attendanceDates = schoolYearWeekdays(schoolYear, 5)
  const sampleDueDate = attendanceDates[0]

  const existingStudents = studentsLookup.data ?? []
  const studentsByNumber = new Map(existingStudents.map((student) => [student.student_number, student]))
  const studentsCreated: typeof existingStudents = []
  onProgress?.("Preparing the sample pupils and enrollments...")
  for (let index = 0; index < studentDefinitions.length; index++) {
    const definition = studentDefinitions[index]
    const studentNumber = `SAMP-2-${String(index + 1).padStart(3, "0")}`
    let student = studentsByNumber.get(studentNumber)
    if (!student) {
      const { data, error } = await supabase.from("students").insert({
        teacher_id: teacherId,
        class_id: classId,
        student_number: studentNumber,
        ...definition,
        parent_guardian_name: `Sample Guardian ${index + 1}`,
        email_notifications_enabled: false,
        is_active: true,
        demo_batch_id: demoBatchId,
      }).select("id,student_number,first_name,last_name,gender").single()
      throwOnError(`Could not create sample pupil ${studentNumber}`, error)
      if (!data) throw new Error(`Pupil ${studentNumber} was not returned after insert.`)
      student = data
      studentsCreated.push(student)
      studentsByNumber.set(studentNumber, student)
    }
  }
  const students = studentDefinitions.map((_, index) => studentsByNumber.get(`SAMP-2-${String(index + 1).padStart(3, "0")}`)).filter((student): student is NonNullable<typeof student> => Boolean(student))

  const { data: enrollments, error: enrollmentLookupError } = await supabase.from("class_enrollments")
    .select("student_id")
    .eq("teacher_id", teacherId)
    .eq("class_id", classId)
    .in("student_id", students.map((student) => student.id))
    .eq("status", "active")
  throwOnError("Could not check sample pupil enrollment", enrollmentLookupError)
  const enrolledIds = new Set((enrollments ?? []).map((row) => row.student_id))
  const newEnrollments = students.filter((student) => !enrolledIds.has(student.id))
  if (newEnrollments.length) {
    const { error } = await supabase.from("class_enrollments").insert(newEnrollments.map((student) => ({
      teacher_id: teacherId,
      class_id: classId,
      student_id: student.id,
      status: "active",
      demo_batch_id: demoBatchId,
    })))
    throwOnError("Could not enroll sample pupils", error)
  }

  const { data: existingActivities, error: activityLookupError } = await supabase.from("academic_activities")
    .select("id,title")
    .eq("teacher_id", teacherId)
    .eq("demo_batch_id", demoBatchId)
  throwOnError("Could not check sample activities", activityLookupError)
  const activitiesByTitle = new Map((existingActivities ?? []).map((activity) => [activity.title, activity.id]))
  let activitiesCreated = 0
  let assessmentsCreated = 0
  let scoresCreated = 0
  for (let activityIndex = 0; activityIndex < activityDefinitions.length; activityIndex++) {
    const activityDefinition = activityDefinitions[activityIndex]
    onProgress?.(`Creating assessment ${activityIndex + 1} of ${activityDefinitions.length}: ${activityDefinition.title}`)
    const dueDate = sampleDueDate
    let activityId = activitiesByTitle.get(activityDefinition.title)
    if (!activityId) {
      const { data, error } = await supabase.from("academic_activities").insert({
        teacher_id: teacherId,
        title: activityDefinition.title,
        activity_type: activityDefinition.activityType,
        description: `Grade 2 Science Term 1 sample ${activityDefinition.category} activity.`,
        instructions: "Complete the activity and review the score with your teacher.",
        total_points: activityDefinition.totalPoints,
        passing_percentage: 75,
        due_date: dueDate,
        demo_batch_id: demoBatchId,
      }).select("id").single()
      throwOnError(`Could not create ${activityDefinition.title}`, error)
      if (!data) throw new Error(`${activityDefinition.title} was not returned after insert.`)
      activityId = data.id
      activitiesCreated++
      activitiesByTitle.set(activityDefinition.title, activityId)
    }

    const { data: existingAssessment, error: assessmentLookupError } = await supabase.from("assessments")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("activity_id", activityId)
      .eq("class_id", classId)
      .maybeSingle()
    throwOnError(`Could not check assessment for ${activityDefinition.title}`, assessmentLookupError)
    let assessmentId = existingAssessment?.id
    if (!assessmentId) {
      const { data, error } = await supabase.from("assessments").insert({
        teacher_id: teacherId,
        class_id: classId,
        title: activityDefinition.title,
        assessment_type: activityDefinition.activityType,
        grading_category: activityDefinition.category,
        subject: "Science",
        subject_offering_id: subjectOfferingId,
        school_year: schoolYear,
        grading_period: "T1",
        assessment_date: dueDate,
        activity_date: dueDate,
        due_date: dueDate,
        total_points: activityDefinition.totalPoints,
        passing_percentage: 75,
        activity_id: activityId,
        status: "published",
        demo_batch_id: demoBatchId,
      }).select("id").single()
      throwOnError(`Could not create assessment for ${activityDefinition.title}`, error)
      if (!data) throw new Error(`Assessment for ${activityDefinition.title} was not returned.`)
      assessmentId = data.id
      assessmentsCreated++
    }

    const { data: existingAssignment, error: assignmentLookupError } = await supabase.from("academic_activity_assignments")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("activity_id", activityId)
      .eq("class_id", classId)
      .maybeSingle()
    throwOnError(`Could not check class assignment for ${activityDefinition.title}`, assignmentLookupError)
    if (!existingAssignment) {
      const { error } = await supabase.from("academic_activity_assignments").insert({
        teacher_id: teacherId,
        activity_id: activityId,
        class_id: classId,
        subject_offering_id: subjectOfferingId,
        grading_period: "T1",
        school_year: schoolYear,
        assessment_id: assessmentId,
        demo_batch_id: demoBatchId,
      })
      throwOnError(`Could not assign ${activityDefinition.title} to Sampaguita`, error)
    }

    const { data: savedScores, error: scoreLookupError } = await supabase.from("assessment_scores")
      .select("student_id")
      .eq("teacher_id", teacherId)
      .eq("assessment_id", assessmentId)
      .in("student_id", students.map((student) => student.id))
    throwOnError(`Could not check scores for ${activityDefinition.title}`, scoreLookupError)
    const scoredStudentIds = new Set((savedScores ?? []).map((score) => score.student_id))
    const missingScores = students.filter((student) => !scoredStudentIds.has(student.id))
    if (missingScores.length) {
      const { error } = await supabase.from("assessment_scores").insert(missingScores.map((student) => {
        const studentIndex = students.findIndex((item) => item.id === student.id)
        const score = Math.max(1, activityDefinition.totalPoints - ((studentIndex * 3 + activityIndex * 2) % 12))
        return { teacher_id: teacherId, assessment_id: assessmentId, student_id: student.id, score, remarks: "Generated sample score", demo_batch_id: demoBatchId }
      }))
      throwOnError(`Could not save scores for ${activityDefinition.title}`, error)
      scoresCreated += missingScores.length
    }
  }

  const { data: savedAttendance, error: attendanceLookupError } = await supabase.from("attendance")
    .select("student_id,attendance_date")
    .eq("teacher_id", teacherId)
    .in("student_id", students.map((student) => student.id))
    .in("attendance_date", attendanceDates)
  throwOnError("Could not check existing sample attendance", attendanceLookupError)
  const attendanceKeys = new Set((savedAttendance ?? []).map((item) => `${item.student_id}:${item.attendance_date}`))
  const attendanceRows = students.flatMap((student, studentIndex) => attendanceDates.map((date, dateIndex) => {
    const key = `${student.id}:${date}`
    if (attendanceKeys.has(key)) return null
    const statusChoices = ["present", "present", "present", "late", "absent"]
    const status = (studentIndex === 0 && dateIndex === 0 ? "present" : studentIndex === 1 && dateIndex === 0 ? "late" : studentIndex === 2 && dateIndex === 0 ? "absent" : statusChoices[Math.floor(Math.random() * statusChoices.length)]) as "present" | "late" | "absent"
    return { teacher_id: teacherId, class_id: classId, student_id: student.id, attendance_date: date, status, demo_batch_id: demoBatchId }
  }).filter((row): row is NonNullable<typeof row> => row !== null))
  if (attendanceRows.length) {
    const { error } = await supabase.from("attendance").insert(attendanceRows)
    throwOnError("Could not save sample attendance", error)
  }

  return {
    batchId: demoBatchId,
    schoolYear,
    classesCreated,
    subjectsCreated,
    pupilsCreated: studentsCreated.length,
    activitiesCreated,
    assessmentsCreated,
    scoresCreated,
    attendanceCreated: attendanceRows.length,
    pupilCount: students.length,
    activityCount: activityDefinitions.length,
  }
}
