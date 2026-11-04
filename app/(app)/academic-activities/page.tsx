"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import { BookOpenCheck, CalendarDays, CheckCircle2, ClipboardList, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination"
import { academicCategories, gradeLevelLabel, gradingPeriodsForGrade, isTrimesterSchoolYear, periodKeyForSchoolYear, periodLabelForSchoolYear } from "@/lib/academic-structure"

const supabase = createClient()
const fetcher = async () => {
  const [activities, assignments, assessments, classes, subjects, periods, activityTypes] = await Promise.all([
    supabase.from("academic_activities").select("id,title,description,instructions,activity_type,total_points,passing_percentage,due_date,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("academic_activity_assignments").select("id,activity_id,class_id,subject_offering_id,grading_period,school_year,assessment_id"),
    supabase.from("assessments").select("id,activity_id,status,assessment_date,grading_period,subject,class_id"),
    supabase.from("classes").select("id,grade_level,section_name,school_year").eq("is_active", true).order("grade_level").order("section_name"),
    supabase.from("class_subjects").select("id,class_id,subject_name").eq("is_active", true).order("subject_name"),
    supabase.from("grading_periods").select("short_label,display_name,quarter_number,school_year").order("quarter_number"),
    supabase.from("academic_activity_types").select("id,name").order("name"),
  ])
  for (const result of [activities, assignments, assessments, classes, subjects, periods, activityTypes]) if (result.error) throw new Error(result.error.message)
  return { activities: activities.data ?? [], assignments: assignments.data ?? [], assessments: assessments.data ?? [], classes: classes.data ?? [], subjects: subjects.data ?? [], periods: periods.data ?? [], activityTypes: activityTypes.data ?? [] }
}

export default function AcademicActivitiesPage() {
  const { data, error, isLoading, mutate } = useSWR("academic-activities", fetcher)
  const [query, setQuery] = useState("")
  const [type, setType] = useState("all")
  const [status, setStatus] = useState("all")
  const [period, setPeriod] = useState("all")
  const [classFilter, setClassFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)
  const [createMessage, setCreateMessage] = useState("")
  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: "", activityType: "Assignment", customType: "", gradingCategory: academicCategories[0], activityDate: "", description: "", instructions: "", totalPoints: "100", passingPercentage: "75", dueDate: "", gradingPeriod: "T1", classIds: [] as string[], subjectByClass: {} as Record<string, string> })
  const classes = data?.classes ?? []
  const allAssignments = data?.assignments ?? []
  const assignments = allAssignments.filter((assignment) => {
    const assignedClass = classes.find((item) => item.id === assignment.class_id)
    return !(assignedClass && isTrimesterSchoolYear(assignedClass.school_year) && periodKeyForSchoolYear(assignment.grading_period, assignedClass.school_year) === "Q4")
  })
  const activities = (data?.activities ?? []).filter((activity) => {
    const relatedAssignments = allAssignments.filter((assignment) => assignment.activity_id === activity.id)
    return !relatedAssignments.length || relatedAssignments.some((assignment) => assignments.some((visibleAssignment) => visibleAssignment.id === assignment.id))
  })
  const storedPeriods = data?.periods ?? []
  const selectedSchoolYear = classes.find((item) => form.classIds.includes(item.id))?.school_year ?? classes[0]?.school_year
  const selectedClass = classes.find((item) => form.classIds.includes(item.id)) ?? classes.find((item) => item.school_year === selectedSchoolYear)
  const formPeriods = gradingPeriodsForGrade(selectedClass?.grade_level, selectedSchoolYear, storedPeriods.filter((item) => item.school_year === selectedSchoolYear))
  const effectiveFormPeriod = formPeriods.some((item) => item.short_label === form.gradingPeriod) ? form.gradingPeriod : formPeriods[0]?.short_label ?? "T1"
  const allPeriodOptions = [...new Map(classes.flatMap((klass) => gradingPeriodsForGrade(klass.grade_level, klass.school_year, storedPeriods.filter((item) => item.school_year === klass.school_year))).map((item) => [item.short_label, item])).values()]
  const subjects = data?.subjects ?? []
  const assessments = data?.assessments ?? []
  const filtered = activities.filter((activity) => `${activity.title} ${activity.description ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (type === "all" || activity.activity_type === type) && (period === "all" || assignments.some((item) => item.activity_id === activity.id && periodKeyForSchoolYear(item.grading_period, item.school_year) === period)) && (classFilter === "all" || assignments.some((item) => item.activity_id === activity.id && item.class_id === classFilter)) && (status === "all" || assessments.some((item) => item.activity_id === activity.id && item.status === status)))
  const pageActivities = filtered.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  const counts = useMemo(() => ({ total: activities.length, active: activities.filter((activity) => activity.due_date && new Date(`${activity.due_date}T23:59:59`) >= new Date()).length, completed: activities.filter((activity) => assignments.some((item) => item.activity_id === activity.id) && assessments.some((item) => item.activity_id === activity.id && item.status === "published")).length, classes: new Set(assignments.map((item) => item.class_id)).size }), [activities, assignments, assessments])

  function toggleClass(classId: string) {
    const classRecord = classes.find((item) => item.id === classId)
    if (classRecord && classRecord.grade_level <= 1) {
      setCreateMessage(`${gradeLevelLabel(classRecord.grade_level)} uses competency-based PACE ratings. Record them in the PACE form instead of creating a numeric activity.`)
      return
    }
    setForm((current) => ({ ...current, classIds: current.classIds.includes(classId) ? current.classIds.filter((id) => id !== classId) : [...current.classIds, classId] }))
  }
  async function deleteActivity(activityId: string, title: string) {
    if (!window.confirm(`Permanently delete "${title}" and its linked assessments, pupil scores, and class assignments? This action cannot be undone.`)) return
    setDeletingActivityId(activityId)
    setCreateMessage("")
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) throw new Error(authError?.message ?? "Please sign in again.")
      const { data: linkedAssessments, error: lookupError } = await supabase.from("assessments")
        .select("id")
        .eq("teacher_id", auth.user.id)
        .eq("activity_id", activityId)
      if (lookupError) throw new Error(`Could not check linked assessments: ${lookupError.message}`)
      const assessmentIds = (linkedAssessments ?? []).map((item) => item.id)
      if (assessmentIds.length) {
        const { error } = await supabase.from("assessment_scores").delete().eq("teacher_id", auth.user.id).in("assessment_id", assessmentIds)
        if (error) throw new Error(`Linked pupil scores could not be removed: ${error.message}`)
      }
      const { error: assignmentsError } = await supabase.from("academic_activity_assignments").delete()
        .eq("teacher_id", auth.user.id)
        .eq("activity_id", activityId)
      if (assignmentsError) throw new Error(`Class assignments could not be removed: ${assignmentsError.message}`)
      if (assessmentIds.length) {
        const { error } = await supabase.from("assessments").delete().eq("teacher_id", auth.user.id).in("id", assessmentIds)
        if (error) throw new Error(`Linked assessments could not be removed: ${error.message}`)
      }
      const { error: activityError } = await supabase.from("academic_activities").delete().eq("teacher_id", auth.user.id).eq("id", activityId)
      if (activityError) throw new Error(`Activity could not be deleted: ${activityError.message}`)
      await mutate()
    } catch (deleteError) {
      setCreateMessage(deleteError instanceof Error ? deleteError.message : "The activity could not be deleted.")
    } finally {
      setDeletingActivityId(null)
    }
  }
  async function createActivity() {
    setCreateMessage("")
    const activityType = form.activityType === "Custom" ? form.customType.trim() : form.activityType.trim()
    const totalPoints = Number(form.totalPoints)
    const passingPercentage = Number(form.passingPercentage)
    if (!form.title.trim()) { setCreateMessage("Enter an activity title."); return }
    if (!activityType) { setCreateMessage("Choose or enter an activity type."); return }
    if (!form.gradingCategory || !form.gradingPeriod) { setCreateMessage("Choose a grading category and period."); return }
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) { setCreateMessage("Total points must be greater than zero."); return }
    if (!Number.isFinite(passingPercentage) || passingPercentage < 0 || passingPercentage > 100) { setCreateMessage("Passing percentage must be between 0 and 100."); return }
    if (!form.classIds.length) { setCreateMessage("Assign this activity to at least one class."); return }
    const selectedClasses = form.classIds.map((classId) => classes.find((item) => item.id === classId))
    if (selectedClasses.some((item) => !item)) { setCreateMessage("One or more selected classes are no longer available. Refresh and try again."); return }
    if (selectedClasses.some((item) => item!.grade_level <= 1)) {
      setCreateMessage("Kinder and Grade 1 use competency-based records. Use the separate competency or PACE form instead of creating a numeric activity.")
      return
    }
    if (!formPeriods.some((item) => item.short_label === effectiveFormPeriod) || selectedClasses.some((item) => {
      const classRecord = item!
      return !gradingPeriodsForGrade(classRecord.grade_level, classRecord.school_year, storedPeriods.filter((period) => period.school_year === classRecord.school_year))
        .some((period) => period.short_label === effectiveFormPeriod)
    })) {
      setCreateMessage("Choose a grading period supported by every selected class.")
      return
    }
    if (Object.entries(form.subjectByClass).some(([classId, subjectId]) => subjectId && !subjects.some((item) => item.id === subjectId && item.class_id === classId))) {
      setCreateMessage("Choose a subject belonging to its selected class.")
      return
    }

    setSaving(true)
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) throw new Error(authError?.message ?? "Please sign in again.")
      if (form.activityType === "Custom") {
        const { error: typeError } = await supabase.from("academic_activity_types").upsert({ teacher_id: auth.user.id, name: activityType }, { onConflict: "teacher_id,name" })
        if (typeError) throw new Error(`Activity type could not be saved: ${typeError.message}`)
      }

      let activityId = pendingActivityId
      if (!activityId) {
        const { data: activity, error: activityError } = await supabase.from("academic_activities").insert({
          teacher_id: auth.user.id,
          title: form.title.trim(),
          activity_type: activityType,
          description: form.description.trim() || null,
          instructions: form.instructions.trim() || null,
          total_points: totalPoints,
          passing_percentage: passingPercentage,
          due_date: form.dueDate || null,
        }).select("id").single()
        if (activityError || !activity) throw new Error(`Activity could not be created: ${activityError?.message ?? "No activity record was returned."}`)
        activityId = activity.id
        setPendingActivityId(activityId)
      }
      const { error: activityUpdateError } = await supabase.from("academic_activities").update({
        title: form.title.trim(),
        activity_type: activityType,
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
        total_points: totalPoints,
        passing_percentage: passingPercentage,
        due_date: form.dueDate || null,
      }).eq("id", activityId)
      if (activityUpdateError) throw new Error(`Activity details could not be saved: ${activityUpdateError.message}`)

      const assessmentDate = form.activityDate || form.dueDate || new Date().toISOString().slice(0, 10)
      for (const classId of form.classIds) {
        const classRecord = classes.find((item) => item.id === classId)
        if (!classRecord) throw new Error("A selected class is no longer available.")
        const assessmentPeriod = periodKeyForSchoolYear(effectiveFormPeriod, classRecord.school_year) ?? effectiveFormPeriod
        const subjectId = form.subjectByClass[classId] || null
        const subject = subjects.find((item) => item.id === subjectId)
        const { data: existingAssignment, error: assignmentLookupError } = await supabase
          .from("academic_activity_assignments")
          .select("id,assessment_id")
          .eq("activity_id", activityId)
          .eq("class_id", classId)
          .maybeSingle()
        if (assignmentLookupError) throw new Error(`Could not check the class assignment: ${assignmentLookupError.message}`)

        let assessmentId = existingAssignment?.assessment_id
        if (!assessmentId) {
          const { data: linkedAssessment, error: assessmentLookupError } = await supabase.from("assessments")
            .select("id")
            .eq("activity_id", activityId)
            .eq("class_id", classId)
            .maybeSingle()
          if (assessmentLookupError) throw new Error(`Could not check the assessment for ${classRecord.section_name}: ${assessmentLookupError.message}`)
          assessmentId = linkedAssessment?.id
        }
        if (assessmentId) {
          const { error: assessmentError } = await supabase.from("assessments").update({
            title: form.title.trim(),
            assessment_type: activityType,
            grading_category: form.gradingCategory,
            activity_date: form.activityDate || null,
            subject: subject?.subject_name ?? classRecord.section_name ?? "General",
            school_year: classRecord.school_year,
            grading_period: assessmentPeriod,
            assessment_date: assessmentDate,
            total_points: totalPoints,
            passing_percentage: passingPercentage,
            activity_id: activityId,
            subject_offering_id: subjectId,
            description: form.description.trim() || null,
            instructions: form.instructions.trim() || null,
            due_date: form.dueDate || null,
          }).eq("id", assessmentId)
          if (assessmentError) throw new Error(`Assessment for ${classRecord.section_name} could not be saved: ${assessmentError.message}`)
        } else {
          const { data: assessment, error: assessmentError } = await supabase.from("assessments").insert({
            teacher_id: auth.user.id,
            class_id: classId,
            title: form.title.trim(),
            assessment_type: activityType,
            grading_category: form.gradingCategory,
            activity_date: form.activityDate || null,
            subject: subject?.subject_name ?? classRecord.section_name ?? "General",
            school_year: classRecord.school_year,
            grading_period: assessmentPeriod,
            assessment_date: assessmentDate,
            total_points: totalPoints,
            passing_percentage: passingPercentage,
            activity_id: activityId,
            subject_offering_id: subjectId,
            description: form.description.trim() || null,
            instructions: form.instructions.trim() || null,
            due_date: form.dueDate || null,
            status: "draft",
          }).select("id").single()
          if (assessmentError || !assessment) throw new Error(`Assessment for ${classRecord.section_name} could not be created: ${assessmentError?.message ?? "No assessment record was returned."}`)
          assessmentId = assessment.id
        }

        const assignmentValues = {
          activity_id: activityId,
          teacher_id: auth.user.id,
          class_id: classId,
          subject_offering_id: subjectId,
          grading_period: effectiveFormPeriod,
          school_year: classRecord.school_year,
          assessment_id: assessmentId,
        }
        const { error: assignmentError } = existingAssignment
          ? await supabase.from("academic_activity_assignments").update(assignmentValues).eq("id", existingAssignment.id)
          : await supabase.from("academic_activity_assignments").insert(assignmentValues)
        if (assignmentError) throw new Error(`Assignment for ${classRecord.section_name} could not be saved: ${assignmentError.message}`)
      }

      setPendingActivityId(null)
      setForm({ title: "", activityType: "Assignment", customType: "", gradingCategory: academicCategories[0], activityDate: "", description: "", instructions: "", totalPoints: "100", passingPercentage: "75", dueDate: "", gradingPeriod: "T1", classIds: [], subjectByClass: {} })
      setShowCreate(false)
      await mutate()
    } catch (saveError) {
      setCreateMessage(saveError instanceof Error ? saveError.message : "The activity could not be saved. Please try again.")
      await mutate()
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading academic activities…</p></main>
  if (error) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load academic activities.</p></main>
  return <main className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-medium text-primary">Teacher workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Academic Activities</h1><p className="mt-2 text-sm text-muted-foreground">Create, assign, and monitor activities across your classes.</p></div><Button onClick={() => setShowCreate(true)}><Plus data-icon="inline-start" />Create activity</Button></header>
    <section className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <div><h2 className="font-semibold">Grade 1 PACE assessments</h2><p className="mt-1 text-sm text-muted-foreground">Rate each pupil against the workbook competencies using the PACE A–E scale.</p></div>
      <Button render={<Link href="/competency-records" />} variant="outline">Open PACE forms</Button>
    </section>
    {createMessage && !showCreate && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{createMessage}</p>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={ClipboardList} label="Total Activities" value={counts.total} /><Stat icon={CalendarDays} label="Active" value={counts.active} /><Stat icon={CheckCircle2} label="Published" value={counts.completed} /><Stat icon={Users} label="Classes" value={counts.classes} /></section>
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search activities</span><input className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" placeholder="Search activities" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label><select aria-label="Filter by class" className="h-10 rounded-md border bg-background px-3 text-sm" value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1) }}><option value="all">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => { setType(event.target.value); setPage(1) }}><option value="all">All types</option>{["Assignment","Quiz","Project","Performance Task","Quarterly Examination"].map((item) => <option key={item}>{item}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }}><option value="all">All periods</option>{allPeriodOptions.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 py-2 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="all">All status</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></section>
    <section className="overflow-hidden rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Publication</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y">{pageActivities.map((activity) => { const activityAssignments = assignments.filter((item) => item.activity_id === activity.id); const activityAssessments = assessments.filter((item) => item.activity_id === activity.id); const assignedNames = activityAssignments.map((item) => { const classRecord = classes.find((klass) => klass.id === item.class_id); return classRecord ? `${gradeLevelLabel(classRecord.grade_level)} – ${classRecord.section_name}` : "Class" }); const firstAssignment = activityAssignments[0]; return <tr key={activity.id} className="hover:bg-muted/30"><td className="px-4 py-4"><Link href={`/academic-activities/${activity.id}`} className="font-medium hover:text-primary hover:underline">{activity.title}</Link><p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{activity.description || "No description"}</p></td><td className="px-4 py-4">{activity.activity_type}</td><td className="max-w-56 px-4 py-4 text-muted-foreground">{assignedNames.join(", ") || "Unassigned"}</td><td className="px-4 py-4">{firstAssignment ? periodLabelForSchoolYear(firstAssignment.grading_period, firstAssignment.school_year) : "—"}</td><td className="px-4 py-4">{activity.due_date ? new Date(`${activity.due_date}T00:00:00`).toLocaleDateString() : "—"}</td><td className="px-4 py-4"><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{activityAssessments.some((item) => item.status === "published") ? "Published" : "Draft"}</span></td><td className="px-4 py-4"><div className="flex items-center gap-2"><Button render={<Link href={`/academic-activities/${activity.id}`} />} variant="outline" size="sm"><Pencil data-icon="inline-start" />Edit</Button><Button render={<Link href={`/academic-activities/${activity.id}/scores`} />} variant="ghost" size="sm">View scores</Button><Button type="button" variant="ghost" size="icon" aria-label={`Delete ${activity.title}`} disabled={deletingActivityId === activity.id} onClick={() => void deleteActivity(activity.id, activity.title)}>{deletingActivityId === activity.id ? <span className="text-xs">…</span> : <Trash2 className="size-4 text-destructive" />}</Button></div></td></tr> })}</tbody></table></div>{!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">No activities match the selected filters.</div>}<Pagination page={page} totalItems={filtered.length} onPageChange={setPage} /></section>
    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="create-activity-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 id="create-activity-title" className="text-xl font-semibold">Create activity</h2><p className="mt-1 text-sm text-muted-foreground">Create one activity and assign it to one or more classes.</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setShowCreate(false)} aria-label="Close create activity"><X /></Button></div><form onSubmit={(event) => { event.preventDefault(); void createActivity() }}><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Title<input required aria-required="true" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Fractions practice" /></label><label className="text-sm font-medium">Activity type<select required aria-required="true" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.activityType} onChange={(event) => setForm({ ...form, activityType: event.target.value })}>{["Assignment","Quiz","Project","Performance Task","Quarterly Examination","Custom"].concat((data?.activityTypes ?? []).map((item) => item.name)).filter((item, index, values) => values.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></label>{form.activityType === "Custom" && <label className="text-sm font-medium">Custom activity type<input required aria-required="true" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.customType} onChange={(event) => setForm({ ...form, customType: event.target.value })} placeholder="e.g. Oral Recitation" /></label>}<label className="text-sm font-medium">Grading category<select required aria-required="true" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.gradingCategory} onChange={(event) => setForm({ ...form, gradingCategory: event.target.value as typeof academicCategories[number] })}>{academicCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="text-sm font-medium">Grading period<select required aria-required="true" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={effectiveFormPeriod} onChange={(event) => setForm({ ...form, gradingPeriod: event.target.value })}>{formPeriods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label><label className="text-sm font-medium">Total points<input required aria-required="true" type="number" min="1" step="any" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.totalPoints} onChange={(event) => setForm({ ...form, totalPoints: event.target.value })} /></label><label className="text-sm font-medium">Passing percentage<input required aria-required="true" type="number" min="0" max="100" step="any" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.passingPercentage} onChange={(event) => setForm({ ...form, passingPercentage: event.target.value })} /></label><label className="text-sm font-medium">Activity date<input type="date" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.activityDate} onChange={(event) => setForm({ ...form, activityDate: event.target.value })} /></label><label className="text-sm font-medium">Due date<input type="date" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label><label className="text-sm font-medium sm:col-span-2">Description<textarea className="mt-1.5 min-h-20 w-full rounded-md border bg-background px-3 py-2 font-normal" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What will learners practice?" /></label><label className="text-sm font-medium sm:col-span-2">Instructions<textarea className="mt-1.5 min-h-20 w-full rounded-md border bg-background px-3 py-2 font-normal" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="What should learners submit?" /></label></div><fieldset className="mt-5 rounded-xl border p-4"><legend className="px-2 text-sm font-semibold">Assign to classes</legend><p className="mb-3 text-xs text-muted-foreground">Choose at least one class. The selected grading period applies to each assignment.</p><div className="grid gap-3 sm:grid-cols-2">{classes.map((klass) => <label key={klass.id} className="rounded-lg border p-3"><span className="flex items-center gap-2"><input type="checkbox" checked={form.classIds.includes(klass.id)} onChange={() => toggleClass(klass.id)} />Grade {klass.grade_level} – {klass.section_name}</span>{form.classIds.includes(klass.id) && <select aria-label={`Subject for ${klass.section_name}`} className="mt-3 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.subjectByClass[klass.id] || ""} onChange={(event) => setForm({ ...form, subjectByClass: { ...form.subjectByClass, [klass.id]: event.target.value } })}><option value="">General / no subject</option>{subjects.filter((subject) => subject.class_id === klass.id).map((subject) => <option key={subject.id} value={subject.id}>{subject.subject_name}</option>)}</select>}</label>)}</div></fieldset>{createMessage && <p role="alert" className="mt-4 text-sm text-destructive">{createMessage}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create activity"}</Button></div></form></div></div>}
  </main>
}

function Stat({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: number }) { return <div className="rounded-xl border bg-card p-5"><Icon className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div> }
