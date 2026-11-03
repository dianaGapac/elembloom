"use client"

import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, CheckCircle2, MessageSquare, Save } from "lucide-react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { matchesPupilGender, PupilGenderFilter, sortPupilsAlphabetically, type PupilGenderFilterValue } from "@/components/pupils/gender-filter"

const supabase = createClient()
const fetcher = async (id: string, assignmentId: string | null) => {
  const [activity, assignments, classes, students, enrollments, scores] = await Promise.all([
    supabase.from("academic_activities").select("id,title,total_points,passing_percentage,activity_type").eq("id", id).single(),
    supabase.from("academic_activity_assignments").select("id,class_id,subject_offering_id,grading_period,school_year,assessment_id").eq("activity_id", id),
    supabase.from("classes").select("id,grade_level,section_name").eq("is_active", true),
    supabase.from("students").select("id,student_number,first_name,last_name,class_id,gender").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("class_enrollments").select("class_id,student_id,status").eq("status", "active"),
    supabase.from("assessment_scores").select("id,assessment_id,student_id,score,remarks"),
  ])
  for (const result of [activity, assignments, classes, students, enrollments, scores]) if (result.error) throw new Error(result.error.message)
  const assignment = assignments.data?.find((item) => item.id === assignmentId) ?? assignments.data?.[0]
  const assessment = assignment ? await supabase.from("assessments").select("id,status,assessment_date,grading_period,subject,class_id").eq("id", assignment.assessment_id).single() : { data: null, error: null }
  if (assessment.error) throw new Error(assessment.error.message)
  return { activity: activity.data, assignments: assignments.data ?? [], assignment, assessment: assessment.data, classes: classes.data ?? [], students: students.data ?? [], enrollments: enrollments.data ?? [], scores: scores.data ?? [] }
}

export default function ActivityScoresPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const assignmentId = searchParams.get("assignmentId")
  const { data, error, isLoading, mutate } = useSWR(id ? ["academic-activity-scores", id, assignmentId] : null, ([, activityId, selectedAssignment]) => fetcher(activityId, selectedAssignment))
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [genderFilter, setGenderFilter] = useState<PupilGenderFilterValue>("all")

  if (isLoading) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading score entry…</p></main>
  if (error || !data?.activity || !data.assignment || !data.assessment) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-destructive">Unable to load score entry.</p></main>

  const { activity, assignment, assessment, classes, students, enrollments, scores } = data
  const classRecord = classes.find((item) => item.id === assignment.class_id)
  const pupils = sortPupilsAlphabetically(students.filter((student) => student.class_id === assignment.class_id && enrollments.some((enrollment) => enrollment.class_id === assignment.class_id && enrollment.student_id === student.id)))
  const visiblePupils = pupils.filter((student) => matchesPupilGender(student.gender, genderFilter))
  const passingScore = Number(activity.total_points) * Number(activity.passing_percentage) / 100
  const passedCount = pupils.filter((student) => {
    const score = scores.find((item) => item.assessment_id === assessment.id && item.student_id === student.id)?.score
    return score !== null && score !== undefined && Number(score) >= passingScore
  }).length
  const passingRate = pupils.length ? Math.round((passedCount / pupils.length) * 100) : null
  const recordedCount = scores.filter((score) => score.assessment_id === assessment.id && score.score !== null).length

  async function saveScore(studentId: string, value: string, remarks: string | null = null) {
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) {
      setMessage(authError?.message ?? "Please sign in again.")
      return
    }
    const numeric = value.trim() === "" ? null : Number(value)
    if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0 || numeric > Number(activity.total_points))) {
      setMessage(`Score must be between 0 and ${activity.total_points}.`)
      return
    }
    const existing = scores.find((score) => score.assessment_id === assessment.id && score.student_id === studentId)
    setSaving(true)
    setMessage("")
    const result = existing
      ? await supabase.from("assessment_scores").update({ score: numeric, remarks, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("assessment_scores").insert({ teacher_id: auth.user.id, assessment_id: assessment.id, student_id: studentId, score: numeric, remarks })
    if (result.error) setMessage(`Score could not be saved: ${result.error.message}`)
    await mutate()
    setSaving(false)
  }

  async function publish() {
    setSaving(true)
    const { error: publishError } = await supabase.from("assessments").update({ status: "published" }).eq("id", assessment.id)
    setMessage(publishError ? `Scores could not be published: ${publishError.message}` : "Scores published.")
    await mutate()
    setSaving(false)
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <Link href={`/academic-activities/${activity.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{activity.title}</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Score Entry</h1>
        <p className="mt-2 text-sm text-muted-foreground">Grade {classRecord?.grade_level} – {classRecord?.section_name} · {assignment.grading_period} · {assessment.subject}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={saving}><Save data-icon="inline-start" />{saving ? "Saving…" : "Scores save on blur"}</Button>
        <Button type="button" onClick={() => void publish()} disabled={saving || assessment.status === "published"}><CheckCircle2 data-icon="inline-start" />{assessment.status === "published" ? "Published" : "Publish scores"}</Button>
      </div>
    </div>
    {message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{message}</p>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Highest possible score</p><p className="mt-2 text-2xl font-semibold">{activity.total_points}</p></div>
      <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Passing grade</p><p className="mt-2 text-2xl font-semibold">{activity.passing_percentage}% <span className="text-base font-normal text-muted-foreground">({passingScore.toFixed(2)} points)</span></p></div>
      <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Class pass rate</p><p className="mt-2 text-2xl font-semibold">{passedCount}/{pupils.length} <span className="text-base font-normal text-muted-foreground">({passingRate === null ? "—" : `${passingRate}%`})</span></p></div>
      <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Scores recorded</p><p className="mt-2 text-2xl font-semibold">{recordedCount}/{pupils.length}</p></div>
    </section>
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
        <p className="text-sm text-muted-foreground">Showing {visiblePupils.length} of {pupils.length} enrolled pupils.</p>
        <PupilGenderFilter value={genderFilter} onChange={setGenderFilter} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Learner</th><th className="px-4 py-3">Gender</th><th className="px-4 py-3">Score / {activity.total_points}</th><th className="px-4 py-3">Percentage</th><th className="px-4 py-3">Feedback / remarks</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody className="divide-y">{visiblePupils.map((student) => {
            const score = scores.find((item) => item.assessment_id === assessment.id && item.student_id === student.id)
            const percentage = score?.score === null || score?.score === undefined ? null : (Number(score.score) / Number(activity.total_points)) * 100
            const passed = percentage !== null && percentage >= Number(activity.passing_percentage)
            return <tr key={student.id}>
              <td className="px-4 py-4"><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-xs text-muted-foreground">{student.student_number}</p></td>
              <td className="px-4 py-4 capitalize text-muted-foreground">{student.gender ?? "Not set"}</td>
              <td className="px-4 py-4"><input aria-label={`Score for ${student.first_name} ${student.last_name}`} type="number" min="0" max={activity.total_points} defaultValue={score?.score ?? ""} onBlur={(event) => void saveScore(student.id, event.target.value, score?.remarks ?? null)} className="h-9 w-28 rounded-md border bg-background px-3 text-sm" /></td>
              <td className="px-4 py-4 tabular-nums">{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</td>
              <td className="px-4 py-4"><label className="relative block"><MessageSquare className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Feedback for {student.first_name} {student.last_name}</span><input defaultValue={score?.remarks ?? ""} onBlur={(event) => void saveScore(student.id, String(score?.score ?? ""), event.target.value)} className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm" placeholder="Add feedback" /></label></td>
              <td className={`px-4 py-4 ${percentage === null ? "text-muted-foreground" : passed ? "text-primary" : "text-destructive"}`}>{percentage === null ? "Missing" : passed ? "Passed" : "Needs support"}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      {!visiblePupils.length && <div className="p-10 text-center text-sm text-muted-foreground">{pupils.length ? "No pupils match the selected gender filter." : "No active pupils are enrolled in this class."}</div>}
    </section>
  </main>
}
