"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Edit3, FileText, Users } from "lucide-react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { academicCategories, gradeLevelLabel, gradingPeriodsForGrade, periodKeyForSchoolYear } from "@/lib/academic-structure"

const supabase = createClient()

const fetcher = async (id: string) => {
  const [activity, assignments, assessments, classes, subjects, periods, activityTypes, students, enrollments] = await Promise.all([
    supabase.from("academic_activities").select("id,title,description,instructions,activity_type,total_points,passing_percentage,due_date,created_at").eq("id", id).single(),
    supabase.from("academic_activity_assignments").select("id,class_id,subject_offering_id,grading_period,school_year,assessment_id").eq("activity_id", id),
    supabase.from("assessments").select("id,activity_id,status,assessment_date,activity_date,due_date,grading_period,grading_category,subject,class_id,school_year,total_points,passing_percentage,description,instructions").eq("activity_id", id),
    supabase.from("classes").select("id,grade_level,section_name,school_year").eq("is_active", true).order("grade_level"),
    supabase.from("class_subjects").select("id,class_id,subject_name").eq("is_active", true),
    supabase.from("grading_periods").select("short_label,display_name,school_year").order("quarter_number"),
    supabase.from("academic_activity_types").select("id,name").order("name"),
    supabase.from("students").select("id,class_id").eq("is_active", true),
    supabase.from("class_enrollments").select("class_id,student_id").eq("status", "active"),
  ])
  for (const result of [activity, assignments, assessments, classes, subjects, periods, activityTypes, students, enrollments]) if (result.error) throw new Error(result.error.message)
  if (!activity.data) throw new Error("The requested activity was not found.")
  const assessmentIds = (assessments.data ?? []).map((item) => item.id)
  const scoreResult = assessmentIds.length
    ? await supabase.from("assessment_scores").select("assessment_id,student_id,score").in("assessment_id", assessmentIds)
    : { data: [], error: null }
  if (scoreResult.error) throw new Error(scoreResult.error.message)
  return { activity: activity.data, assignments: assignments.data ?? [], assessments: assessments.data ?? [], classes: classes.data ?? [], subjects: subjects.data ?? [], periods: periods.data ?? [], activityTypes: activityTypes.data ?? [], students: students.data ?? [], enrollments: enrollments.data ?? [], scores: scoreResult.data ?? [] }
}

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, isLoading, mutate } = useSWR(id ? ["academic-activity", id] : null, ([, activityId]) => fetcher(activityId))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [assignmentPeriod, setAssignmentPeriod] = useState("T1")
  const [activityDate, setActivityDate] = useState("")
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [subjectByClass, setSubjectByClass] = useState<Record<string, string>>({})
  if (isLoading) return <main className="mx-auto max-w-5xl p-6"><p className="text-sm text-muted-foreground">Loading activity…</p></main>
  if (error || !data?.activity) return <main className="mx-auto max-w-5xl p-6"><p className="text-sm text-destructive">Unable to load this activity.</p></main>
  const { activity, assignments, assessments, classes, subjects, periods } = data
  const passingScore = Number(activity.total_points) * Number(activity.passing_percentage) / 100
  const assignedClassIds = new Set(assignments.map((item) => item.class_id))
  const passSummary = (classId: string, assessmentId: string | null) => {
    const enrolledIds = new Set(data.enrollments.filter((item) => item.class_id === classId).map((item) => item.student_id))
    const pupilIds = new Set(data.students.filter((item) => item.class_id === classId && enrolledIds.has(item.id)).map((item) => item.id))
    const passedCount = assessmentId
      ? data.scores.filter((item) => item.assessment_id === assessmentId && pupilIds.has(item.student_id) && item.score !== null && Number(item.score) >= passingScore).length
      : 0
    return { pupilCount: pupilIds.size, passedCount, rate: pupilIds.size ? Math.round((passedCount / pupilIds.size) * 100) : null }
  }
  const firstClass = classes.find((item) => item.id === assignments[0]?.class_id) ?? classes.find((item) => item.id === selectedClassIds[0]) ?? classes[0]
  const gradingPeriods = gradingPeriodsForGrade(firstClass?.grade_level, firstClass?.school_year, periods.filter((item) => item.school_year === firstClass?.school_year))
  const selectedAssignmentPeriod = gradingPeriods.some((item) => item.short_label === assignmentPeriod) ? assignmentPeriod : gradingPeriods[0]?.short_label ?? "T1"
  function openEditor() {
    const firstAssignment = assignments[0]
    const firstAssessment = assessments.find((item) => item.id === firstAssignment?.assessment_id) ?? assessments[0]
    setAssignmentPeriod(periodKeyForSchoolYear(firstAssignment?.grading_period ?? firstAssessment?.grading_period, firstClass?.school_year) ?? "T1")
    setActivityDate(firstAssessment?.activity_date ?? "")
    setSelectedClassIds([])
    setSubjectByClass(Object.fromEntries(assignments.map((item) => [item.class_id, item.subject_offering_id ?? ""])))
    setMessage("")
    setEditing(true)
  }
  async function saveActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) { setMessage(authError?.message ?? "Please sign in again."); return }
    if (!assignments.length && !selectedClassIds.length) { setMessage("Assign this activity to at least one class."); return }
    if ([...assignments.map((item) => item.class_id), ...selectedClassIds].some((classId) => {
      const classRecord = classes.find((item) => item.id === classId)
      return classRecord && classRecord.grade_level <= 1
    })) {
      setMessage("Kinder and Grade 1 use competency records, not numeric activities. Record Grade 1 progress in the PACE form.")
      return
    }
    const activityType = String(form.get("activityType") ?? "")
    const title = String(form.get("title") ?? "").trim()
    const description = String(form.get("description") ?? "").trim() || null
    const instructions = String(form.get("instructions") ?? "").trim() || null
    const totalPoints = Number(form.get("totalPoints"))
    const passingPercentage = Number(form.get("passingPercentage"))
    const dueDate = String(form.get("dueDate") ?? "") || null
    const gradingCategory = String(form.get("gradingCategory") ?? "Written Work")
    if (!title) { setMessage("Enter an activity title."); return }
    if (!activityType) { setMessage("Choose an activity type."); return }
    if (!academicCategories.includes(gradingCategory as typeof academicCategories[number])) { setMessage("Choose a valid grading category."); return }
    if (!gradingPeriods.some((item) => item.short_label === selectedAssignmentPeriod)) { setMessage("Choose a valid grading period."); return }
    if ([...assignments.map((item) => item.class_id), ...selectedClassIds].some((classId) => {
      const classRecord = classes.find((item) => item.id === classId)
      return classRecord && !gradingPeriodsForGrade(classRecord.grade_level, classRecord.school_year, periods.filter((period) => period.school_year === classRecord.school_year))
        .some((period) => period.short_label === selectedAssignmentPeriod)
    })) { setMessage("This activity can only be assigned to classes using the same grading-period structure."); return }
    const assessmentPeriod = selectedAssignmentPeriod
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) { setMessage("Total points must be greater than zero."); return }
    if (!Number.isFinite(passingPercentage) || passingPercentage < 0 || passingPercentage > 100) { setMessage("Passing percentage must be between 0 and 100."); return }
    if (assignments.some((assignment) => {
      const selectedSubject = subjectByClass[assignment.class_id]
      return selectedSubject && !subjects.some((item) => item.id === selectedSubject && item.class_id === assignment.class_id)
    }) || selectedClassIds.some((classId) => {
      const selectedSubject = subjectByClass[classId]
      return selectedSubject && !subjects.some((item) => item.id === selectedSubject && item.class_id === classId)
    })) { setMessage("Choose a subject belonging to its assigned class."); return }
    setSaving(true)
    setMessage("")
    try {
    const { error: saveError } = await supabase.from("academic_activities").update({ title, description, instructions, activity_type: activityType, total_points: totalPoints, passing_percentage: passingPercentage, due_date: dueDate }).eq("id", activity.id)
    if (saveError) throw new Error(`Activity could not be saved: ${saveError.message}`)
    const assessmentDate = activityDate || dueDate || new Date().toISOString().slice(0, 10)
    for (const assignment of assignments) {
      const classRecord = classes.find((item) => item.id === assignment.class_id)
      const subjectId = subjectByClass[assignment.class_id] || null
      const subject = subjects.find((item) => item.id === subjectId)
      if (!classRecord) throw new Error("Could not find a class for an existing assignment.")
      let assessmentId = assignment.assessment_id ?? assessments.find((item) => item.class_id === assignment.class_id)?.id
      const assessmentValues = {
        title, assessment_type: activityType, grading_category: gradingCategory, activity_date: activityDate || null,
        subject: subject?.subject_name ?? classRecord.section_name ?? "General", school_year: classRecord.school_year,
        grading_period: periodKeyForSchoolYear(assessmentPeriod, classRecord.school_year) ?? assessmentPeriod, assessment_date: assessmentDate, total_points: totalPoints,
        passing_percentage: passingPercentage, activity_id: activity.id, subject_offering_id: subjectId,
        description, instructions, due_date: dueDate,
      }
      if (assessmentId) {
        const { error: assessmentError } = await supabase.from("assessments").update(assessmentValues).eq("id", assessmentId)
        if (assessmentError) throw new Error(`Assessment for ${classRecord.section_name} could not be saved: ${assessmentError.message}`)
      } else {
        const { data: assessment, error: assessmentError } = await supabase.from("assessments").insert({
          ...assessmentValues, teacher_id: auth.user.id, class_id: classRecord.id, status: "draft",
        }).select("id").single()
        if (assessmentError || !assessment) throw new Error(`Assessment for ${classRecord.section_name} could not be created: ${assessmentError?.message ?? "No assessment record was returned."}`)
        assessmentId = assessment.id
      }
      const { error: assignmentError } = await supabase.from("academic_activity_assignments").update({
        subject_offering_id: subjectId, grading_period: selectedAssignmentPeriod, school_year: classRecord.school_year, assessment_id: assessmentId,
      }).eq("id", assignment.id)
      if (assignmentError) throw new Error(`Assignment for ${classRecord.section_name} could not be saved: ${assignmentError.message}`)
    }
    for (const classId of selectedClassIds) {
      const classRecord = classes.find((item) => item.id === classId)
      if (!classRecord) throw new Error("A selected class is no longer available.")
      const subjectId = subjectByClass[classId] || null
      const subject = subjects.find((item) => item.id === subjectId)
      const { data: existingAssignment, error: assignmentLookupError } = await supabase.from("academic_activity_assignments")
        .select("id,assessment_id")
        .eq("activity_id", activity.id)
        .eq("class_id", classId)
        .maybeSingle()
      if (assignmentLookupError) throw new Error(`Could not check the ${classRecord.section_name} assignment: ${assignmentLookupError.message}`)
      const existingAssessment = existingAssignment?.assessment_id
        ? assessments.find((item) => item.id === existingAssignment.assessment_id)
        : assessments.find((item) => item.class_id === classId)
      const assessmentValues = {
        title, assessment_type: activityType, grading_category: gradingCategory,
        activity_date: activityDate || null, subject: subject?.subject_name ?? classRecord.section_name ?? "General",
        school_year: classRecord.school_year, grading_period: periodKeyForSchoolYear(assessmentPeriod, classRecord.school_year) ?? assessmentPeriod, assessment_date: assessmentDate,
        total_points: totalPoints, passing_percentage: passingPercentage, activity_id: activity.id,
        subject_offering_id: subjectId, description, instructions, due_date: dueDate,
      }
      let assessmentId = existingAssignment?.assessment_id ?? existingAssessment?.id
      if (assessmentId) {
        const { error: assessmentError } = await supabase.from("assessments").update(assessmentValues).eq("id", assessmentId)
        if (assessmentError) throw new Error(`Assessment for ${classRecord.section_name} could not be saved: ${assessmentError.message}`)
      } else {
        const { data: assessment, error: assessmentError } = await supabase.from("assessments").insert({
          teacher_id: auth.user.id, class_id: classId, ...assessmentValues, status: "draft",
        }).select("id").single()
        if (assessmentError || !assessment) throw new Error(`Assessment for ${classRecord.section_name} could not be created: ${assessmentError?.message ?? "No assessment record was returned."}`)
        assessmentId = assessment.id
      }
      const assignmentValues = {
        activity_id: activity.id, teacher_id: auth.user.id, class_id: classId, subject_offering_id: subjectId,
        grading_period: selectedAssignmentPeriod, school_year: classRecord.school_year, assessment_id: assessmentId,
      }
      const { error: assignmentError } = existingAssignment
        ? await supabase.from("academic_activity_assignments").update(assignmentValues).eq("id", existingAssignment.id)
        : await supabase.from("academic_activity_assignments").insert(assignmentValues)
      if (assignmentError) throw new Error(`Assignment for ${classRecord.section_name} could not be saved: ${assignmentError.message}`)
    }
    setMessage("Activity and class assignments updated.")
    setEditing(false)
    await mutate()
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "The activity could not be saved. Please try again.")
      await mutate()
    } finally {
      setSaving(false)
    }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
    <Link href="/academic-activities" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Academic Activities</Link>
    <header className="rounded-2xl border bg-card p-6">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{activity.activity_type}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{assessments.some((item) => item.status === "published") ? "Published" : "Draft"}</span></div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{activity.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{activity.description || "No description provided."}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => editing ? setEditing(false) : openEditor()}><Edit3 data-icon="inline-start" />{editing ? "Close editor" : "Edit activity"}</Button>
      </div>
      {message && <p role="status" aria-live="polite" className={`mt-4 text-sm ${message.includes("could not") || message.includes("Could not") || message.includes("Choose") || message.includes("Enter") || message.includes("must") || message.includes("Assign") ? "text-destructive" : "text-primary"}`}>{message}</p>}
    </header>
    {editing && <form onSubmit={saveActivity} className="space-y-5 rounded-xl border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Title<input name="title" defaultValue={activity.title} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" required /></label>
        <label className="text-sm font-medium">Activity type<select name="activityType" defaultValue={activity.activity_type} required className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal">{[...new Set(["Assignment", "Quiz", "Project", "Performance Task", "Quarterly Examination", ...data.activityTypes.map((item) => item.name), activity.activity_type])].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-sm font-medium">Grading category<select name="gradingCategory" defaultValue={academicCategories.includes(assessments[0]?.grading_category as typeof academicCategories[number]) ? assessments[0]?.grading_category ?? academicCategories[0] : academicCategories[0]} required className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal">{academicCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="text-sm font-medium">Grading period<select aria-label="Edit grading period" value={selectedAssignmentPeriod} onChange={(event) => setAssignmentPeriod(event.target.value)} required className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal">{gradingPeriods.filter((item, index, list) => list.findIndex((period) => period.short_label === item.short_label) === index).map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label>
        <label className="text-sm font-medium">Highest possible score<input name="totalPoints" type="number" min="1" step="any" defaultValue={activity.total_points} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" required /></label>
        <label className="text-sm font-medium">Passing percentage<input name="passingPercentage" type="number" min="0" max="100" step="any" defaultValue={activity.passing_percentage} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" required /></label>
        <label className="text-sm font-medium">Activity date<input aria-label="Edit activity date" type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" /></label>
        <label className="text-sm font-medium">Due date<input name="dueDate" type="date" defaultValue={activity.due_date ?? ""} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" /></label>
        <label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" defaultValue={activity.description ?? ""} className="mt-1.5 min-h-20 w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium sm:col-span-2">Instructions<textarea name="instructions" defaultValue={activity.instructions ?? ""} className="mt-1.5 min-h-20 w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
      </div>
      <fieldset className="rounded-xl border p-4">
        <legend className="px-2 text-sm font-semibold">Current class assignments</legend>
        <p className="mb-3 text-xs text-muted-foreground">Changing the period or subject updates the existing class assessment and its score entry. Existing class assignments are retained.</p>
        <div className="grid gap-3 sm:grid-cols-2">{assignments.map((assignment) => {
          const classRecord = classes.find((item) => item.id === assignment.class_id)
          return <label key={assignment.id} className="rounded-lg border p-3 text-sm">
            <span className="font-medium">{classRecord ? `${gradeLevelLabel(classRecord.grade_level)} – ${classRecord.section_name}` : "Class"}</span>
            <select aria-label={`Subject for ${classRecord?.section_name ?? "class"}`} value={subjectByClass[assignment.class_id] ?? ""} onChange={(event) => setSubjectByClass((current) => ({ ...current, [assignment.class_id]: event.target.value }))} className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">General / no subject</option>{subjects.filter((subject) => subject.class_id === assignment.class_id).map((subject) => <option key={subject.id} value={subject.id}>{subject.subject_name}</option>)}
            </select>
          </label>
        })}</div>
      </fieldset>
      <fieldset className="rounded-xl border p-4">
        <legend className="px-2 text-sm font-semibold">Assign to additional classes</legend>
        <div className="grid gap-3 sm:grid-cols-2">{classes.filter((klass) => !assignedClassIds.has(klass.id)).map((klass) => <label key={klass.id} className="rounded-lg border p-3">
          <span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedClassIds.includes(klass.id)} onChange={() => setSelectedClassIds((current) => current.includes(klass.id) ? current.filter((id) => id !== klass.id) : [...current, klass.id])} />{gradeLevelLabel(klass.grade_level)} – {klass.section_name}</span>
          {selectedClassIds.includes(klass.id) && <select aria-label={`Subject for new ${klass.section_name} assignment`} value={subjectByClass[klass.id] ?? ""} onChange={(event) => setSubjectByClass((current) => ({ ...current, [klass.id]: event.target.value }))} className="mt-3 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">General / no subject</option>{subjects.filter((subject) => subject.class_id === klass.id).map((subject) => <option key={subject.id} value={subject.id}>{subject.subject_name}</option>)}</select>}
        </label>)}</div>
      </fieldset>
      <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save activity and assignments"}</Button></div>
    </form>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={ClipboardList} label="Highest possible score" value={Number(activity.total_points)} /><Metric icon={CheckCircle2} label={`Passing score (${activity.passing_percentage}%)`} value={passingScore} /><Metric icon={Users} label="Classes" value={new Set(assignments.map((item) => item.class_id)).size} /><Metric icon={CalendarDays} label="Assignments" value={assignments.length} /></section>
    <section className="rounded-xl border bg-card p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold">Activity details</h2><p className="mt-1 text-sm text-muted-foreground">Instructions and class-specific score entry stay linked to the same activity.</p></div><Link href={`/academic-activities/${activity.id}/scores`}><Button><FileText data-icon="inline-start" />View and enter scores</Button></Link></div>
      <div className="mt-5 grid gap-5 border-t pt-5 sm:grid-cols-2"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Instructions</p><p className="mt-2 whitespace-pre-wrap text-sm">{activity.instructions || "No instructions provided."}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due date</p><p className="mt-2 text-sm">{activity.due_date ? new Date(`${activity.due_date}T00:00:00`).toLocaleDateString() : "No due date"}</p></div></div>
    </section>
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-semibold">Assignments</h2>
      <div className="mt-4 divide-y">{assignments.map((assignment) => {
        const classRecord = classes.find((item) => item.id === assignment.class_id)
        const subject = subjects.find((item) => item.id === assignment.subject_offering_id)
        const assessment = assessments.find((item) => item.id === assignment.assessment_id)
        const summary = passSummary(assignment.class_id, assessment?.id ?? null)
        return <div key={assignment.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div><p className="font-medium">Grade {classRecord?.grade_level} – {classRecord?.section_name}</p><p className="text-sm text-muted-foreground">{subject?.subject_name || "General activity"} · {assignment.grading_period}</p><p className="mt-1 text-xs text-muted-foreground">Passed {summary.passedCount}/{summary.pupilCount} pupils · Passing rate {summary.rate === null ? "—" : `${summary.rate}%`}</p></div><Link href={`/academic-activities/${activity.id}/scores?assignmentId=${assignment.id}`} className="text-sm font-medium text-primary hover:underline">Open score entry</Link></div>
      })}</div>
    </section>
  </main>
}
function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) { return <div className="rounded-xl border bg-card p-5"><Icon className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div> }
