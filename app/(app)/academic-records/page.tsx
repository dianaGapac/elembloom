"use client"

import { FormEvent, useMemo, useState } from "react"
import useSWR from "swr"
import { CalendarCheck, ClipboardPlus, FileText, Plus, Search, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string; subject_name: string | null; room: string | null }
type Student = { id: string; class_id: string; student_number: string; first_name: string; last_name: string }
type Attendance = { student_id: string; attendance_date: string; status: string }
type Assessment = { id: string; class_id: string; title: string; assessment_type: string; subject: string; grading_period: string; assessment_date: string; total_points: number }
type Score = { assessment_id: string; student_id: string; score: number | null }
type RecordsData = { classes: ClassRecord[]; students: Student[]; attendance: Attendance[]; assessments: Assessment[]; scores: Score[] }

const fetchRecords = async (): Promise<RecordsData> => {
  const supabase = createClient()
  const [classes, students, attendance, assessments, scores] = await Promise.all([
    supabase.from("classes").select("id, grade_level, section_name, school_year, subject_name, room").eq("is_active", true).order("grade_level"),
    supabase.from("students").select("id, class_id, student_number, first_name, last_name").eq("is_active", true).order("last_name"),
    supabase.from("attendance").select("student_id, attendance_date, status").order("attendance_date", { ascending: false }),
    supabase.from("assessments").select("id, class_id, title, assessment_type, subject, grading_period, assessment_date, total_points").order("assessment_date", { ascending: false }),
    supabase.from("assessment_scores").select("assessment_id, student_id, score"),
  ])
  for (const result of [classes, students, attendance, assessments, scores]) if (result.error) throw new Error(result.error.message)
  let classRows = classes.data ?? []
  let studentRows = students.data ?? []
  const { data: auth } = await supabase.auth.getUser()
  if (auth.user && classRows.length === 0) {
    const { data: createdClass, error: classError } = await supabase.from("classes").insert({ teacher_id: auth.user.id, grade_level: 4, section_name: "Sampaguita", school_year: "2026–2027", subject_name: "General Education", room: "Room 4" }).select("id, grade_level, section_name, school_year, subject_name, room").single()
    if (classError) throw new Error(classError.message)
    classRows = createdClass ? [createdClass] : []
    if (createdClass) {
      const { data: createdStudents, error: studentError } = await supabase.from("students").insert([
        { teacher_id: auth.user.id, class_id: createdClass.id, student_number: "2026-0001", first_name: "Ana", last_name: "Santos", parent_guardian_name: "Maria Santos" },
        { teacher_id: auth.user.id, class_id: createdClass.id, student_number: "2026-0002", first_name: "Ben", last_name: "Reyes", parent_guardian_name: "Joel Reyes" },
        { teacher_id: auth.user.id, class_id: createdClass.id, student_number: "2026-0003", first_name: "Cara", last_name: "Dela Cruz", parent_guardian_name: "Liza Dela Cruz" },
      ]).select("id, class_id, student_number, first_name, last_name")
      if (studentError) throw new Error(studentError.message)
      studentRows = createdStudents ?? []
    }
  }
  return { classes: classRows, students: studentRows, attendance: attendance.data ?? [], assessments: assessments.data ?? [], scores: scores.data ?? [] }
}

export default function AcademicRecordsPage() {
  const { data, error, isLoading, mutate } = useSWR("academic-records", fetchRecords)
  const [selectedClass, setSelectedClass] = useState("")
  const [tab, setTab] = useState<"attendance" | "assessments">("attendance")
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [form, setForm] = useState({ title: "", assessment_type: "Quiz", subject: "", grading_period: "Quarter 1", assessment_date: new Date().toISOString().slice(0, 10), total_points: "20" })
  const classes = data?.classes ?? []
  const activeClass = classes.find((item) => item.id === (selectedClass || classes[0]?.id))
  const students = useMemo(() => (data?.students ?? []).filter((student) => student.class_id === activeClass?.id && `${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase().includes(search.toLowerCase())), [data?.students, activeClass?.id, search])
  const assessments = (data?.assessments ?? []).filter((item) => item.class_id === activeClass?.id)

  const addAssessment = async (event: FormEvent) => {
    event.preventDefault(); setFormError("")
    const points = Number(form.total_points)
    if (!activeClass) return setFormError("Add an active class before creating an assessment.")
    if (!form.title.trim() || !form.subject.trim()) return setFormError("Title and subject are required.")
    if (!Number.isFinite(points) || points <= 0) return setFormError("Total points must be greater than zero.")
    setSaving(true)
    const supabase = createClient(); const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setFormError("Your session has expired. Please sign in again."); setSaving(false); return }
    const { error: insertError } = await supabase.from("assessments").insert({ teacher_id: auth.user.id, class_id: activeClass.id, title: form.title.trim(), assessment_type: form.assessment_type, subject: form.subject.trim(), grading_period: form.grading_period, assessment_date: form.assessment_date, total_points: points })
    if (insertError) setFormError(insertError.message)
    else { setForm({ ...form, title: "", subject: "" }); setShowForm(false); await mutate() }
    setSaving(false)
  }

  if (isLoading) return <section className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading academic records…</p></section>
  if (error) return <section className="mx-auto max-w-6xl p-6"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Unable to load academic records</h1><p className="mt-2 text-sm text-muted-foreground">{error.message}</p></div></section>

  return <section className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Learner progress</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Academic Records</h1><p className="mt-2 text-muted-foreground">Track attendance, assessments, and progress by class.</p></div><Button onClick={() => { setFormError(""); setShowForm(true) }}><Plus data-icon="inline-start" />New assessment</Button></div>
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><label className="text-sm font-medium">Class<select value={activeClass?.id ?? ""} onChange={(event) => setSelectedClass(event.target.value)} className="ml-3 rounded-lg border bg-background px-3 py-2 font-normal"><option value="" disabled>Select a class</option>{classes.map((item) => <option key={item.id} value={item.id}>Grade {item.grade_level} · {item.section_name} · {item.school_year}</option>)}</select></label><div className="flex rounded-lg border p-1"><button onClick={() => setTab("attendance")} className={`rounded-md px-3 py-2 text-sm ${tab === "attendance" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}><CalendarCheck className="mr-2 inline size-4" />Attendance</button><button onClick={() => setTab("assessments")} className={`rounded-md px-3 py-2 text-sm ${tab === "assessments" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}><FileText className="mr-2 inline size-4" />Assessments</button></div></div>
    {tab === "attendance" ? <div className="rounded-xl border bg-card"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Attendance register</h2><p className="mt-1 text-sm text-muted-foreground">{students.length} active pupils in this class</p></div><label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Search data-icon="inline-start" /><span className="sr-only">Search pupils</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pupils" className="min-w-0 bg-transparent outline-none" /></label></div>{students.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No pupils are assigned to this class yet.</div> : <div className="divide-y">{students.map((student) => { const records = (data?.attendance ?? []).filter((item) => item.student_id === student.id); const latest = records[0]; return <div key={student.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-sm text-muted-foreground">{student.student_number}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${latest?.status === "present" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{latest ? `${latest.status} · ${latest.attendance_date}` : "No record yet"}</span></div>})}</div>}</div> : <div className="rounded-xl border bg-card"><div className="border-b p-5"><h2 className="font-semibold">Assessments</h2><p className="mt-1 text-sm text-muted-foreground">Review scores and assessment setup for this class.</p></div>{assessments.length === 0 ? <div className="flex flex-col items-center gap-3 p-12 text-center"><ClipboardPlus className="text-muted-foreground" /><p className="font-medium">No assessments yet</p><p className="text-sm text-muted-foreground">Create one to begin recording learning evidence.</p></div> : <div className="divide-y">{assessments.map((assessment) => { const count = (data?.scores ?? []).filter((score) => score.assessment_id === assessment.id && score.score !== null).length; return <div key={assessment.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{assessment.title}</p><p className="text-sm text-muted-foreground">{assessment.subject} · {assessment.assessment_type} · {assessment.grading_period}</p></div><span className="text-sm text-muted-foreground">{count}/{students.length} scores · {assessment.total_points} pts</span></div>})}</div>}</div>}
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="dialog" aria-modal="true" aria-labelledby="assessment-title"><form onSubmit={addAssessment} className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="assessment-title" className="text-xl font-semibold">New assessment</h2><p className="mt-1 text-sm text-muted-foreground">Add an assessment to {activeClass ? `Grade ${activeClass.grade_level} · ${activeClass.section_name}` : "your class"}.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Quarterly Mathematics Quiz" /></label><label className="grid gap-1.5 text-sm font-medium">Type<select value={form.assessment_type} onChange={(event) => setForm({ ...form, assessment_type: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option>Quiz</option><option>Exam</option><option>Written Work</option><option>Performance Task</option><option>Classroom Activity</option><option>Other</option></select></label><label className="grid gap-1.5 text-sm font-medium">Grading period<select value={form.grading_period} onChange={(event) => setForm({ ...form, grading_period: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option>Quarter 1</option><option>Quarter 2</option><option>Quarter 3</option><option>Quarter 4</option></select></label><label className="grid gap-1.5 text-sm font-medium">Subject<input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Mathematics" /></label><label className="grid gap-1.5 text-sm font-medium">Total points<input required type="number" min="1" step="0.01" value={form.total_points} onChange={(event) => setForm({ ...form, total_points: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label><label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Assessment date<input required type="date" value={form.assessment_date} onChange={(event) => setForm({ ...form, assessment_date: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label></div>{formError && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{formError}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create assessment"}</Button></div></form></div>}
  </section>
}
