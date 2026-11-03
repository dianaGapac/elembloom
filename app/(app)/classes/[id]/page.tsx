"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { useState } from "react"
import { ArrowLeft, BookOpen, CalendarDays, Search, Users, Plus, Trash2, FileSpreadsheet, Pencil } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { matchesPupilGender, PupilGenderFilter, sortPupilsAlphabetically, type PupilGenderFilterValue } from "@/components/pupils/gender-filter"
import { categoryWeightsFor, gradeLevelLabel, periodOptionsForSchoolYear, subjectsForGrade } from "@/lib/academic-structure"

const supabase = createClient()
const fetcher = async (id: string) => {
  const [classResult, subjects, enrollments, students] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year,room,subject_name").eq("id", id).single(),
    supabase.from("class_subjects").select("id,subject_name,teacher_name,day_of_week,start_time,end_time,room,is_active").eq("class_id", id).eq("is_active", true).order("subject_name"),
    supabase.from("class_enrollments").select("id,student_id,status,enrolled_on").eq("class_id", id).eq("status", "active"),
    supabase.from("students").select("id,student_number,first_name,last_name,class_id,gender").eq("is_active", true).order("last_name").order("first_name"),
  ])
  for (const result of [classResult, subjects, enrollments, students]) if (result.error) throw new Error(result.error.message)
  return { classRecord: classResult.data, subjects: subjects.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [] }
}

export default function ClassWorkspacePage() {
  const params = useParams<{ id: string }>()
  const { data, error, isLoading, mutate } = useSWR(params.id ? ["class-workspace", params.id] : null, ([, id]) => fetcher(id))
  const [tab, setTab] = useState("overview")
  const [subject, setSubject] = useState("")
  const [pupilSearch, setPupilSearch] = useState("")
  const [genderFilter, setGenderFilter] = useState<PupilGenderFilterValue>("all")
  const [saving, setSaving] = useState(false)
  const [editClassOpen, setEditClassOpen] = useState(false)
  const [editClassForm, setEditClassForm] = useState({ section_name: "", grade_level: "1", school_year: "", room: "" })
  const [scheduleValues, setScheduleValues] = useState<Record<string, { day_of_week: string; start_time: string; end_time: string; room: string }>>({})
  const [scheduleMessage, setScheduleMessage] = useState("")

  if (isLoading) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading class workspace…</p></main>
  if (error || !data?.classRecord) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load this class.</p><Link href="/classes" className="mt-3 inline-flex text-sm text-primary hover:underline">Back to classes</Link></main>
  const classRecord = data.classRecord
  const classSubjects = data.subjects
  const enrolledIds = new Set(data.enrollments.map((row) => row.student_id))
  const enrolledPupils = data.students.filter((student) => enrolledIds.has(student.id))
  const pupils = sortPupilsAlphabetically(data.students.filter((student) => enrolledIds.has(student.id) && matchesPupilGender(student.gender, genderFilter)))
  const available = sortPupilsAlphabetically(data.students.filter((student) => !enrolledIds.has(student.id) && matchesPupilGender(student.gender, genderFilter) && `${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase().includes(pupilSearch.toLowerCase())))
  function beginEditClass() {
    setEditClassForm({ section_name: classRecord.section_name, grade_level: String(classRecord.grade_level), school_year: classRecord.school_year, room: classRecord.room ?? "" })
    setEditClassOpen(true)
  }
  async function saveClassDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) { setScheduleMessage(authError?.message ?? "Please sign in again before editing this class."); return }
    setSaving(true)
    const { error: saveError } = await supabase.from("classes").update({ section_name: editClassForm.section_name.trim(), grade_level: Number(editClassForm.grade_level), school_year: editClassForm.school_year, room: editClassForm.room.trim() || null }).eq("id", classRecord.id).eq("teacher_id", auth.user.id)
    setSaving(false)
    if (saveError) setScheduleMessage(`Class could not be updated: ${saveError.message}`)
    else { setEditClassOpen(false); setScheduleMessage("Class updated."); await mutate() }
  }
  function scheduleFor(subjectId: string) {
    const row = classSubjects.find((item) => item.id === subjectId)
    return scheduleValues[subjectId] ?? { day_of_week: row?.day_of_week == null ? "" : String(row.day_of_week), start_time: row?.start_time ?? "", end_time: row?.end_time ?? "", room: row?.room ?? classRecord.room ?? "" }
  }
  async function saveSchedule(subjectId: string) {
    const schedule = scheduleFor(subjectId)
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) { setScheduleMessage(authError?.message ?? "Please sign in again before saving the schedule."); return }
    setSaving(true)
    const { error: saveError } = await supabase.from("class_subjects").update({
      day_of_week: schedule.day_of_week ? Number(schedule.day_of_week) : null,
      start_time: schedule.start_time || null,
      end_time: schedule.end_time || null,
      room: schedule.room.trim() || null,
    }).eq("id", subjectId).eq("teacher_id", auth.user.id).eq("class_id", classRecord.id)
    setSaving(false)
    if (saveError) setScheduleMessage(`Schedule could not be saved: ${saveError.message}`)
    else { setScheduleMessage("Schedule saved."); await mutate() }
  }
  async function addSubject() {
    if (!subjectsForGrade(classRecord.grade_level).includes(subject) || classSubjects.some((item) => item.subject_name === subject)) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    setSaving(true)
    const { data: offering, error: saveError } = await supabase.from("class_subjects")
      .insert({ teacher_id: auth.user.id, class_id: classRecord.id, subject_name: subject, room: classRecord.room })
      .select("id,subject_name")
      .single()
    if (saveError || !offering) {
      setScheduleMessage(saveError?.message ?? "Subject could not be added.")
    } else {
      const weights = categoryWeightsFor(classRecord.grade_level, offering.subject_name)
      const defaultPolicies = periodOptionsForSchoolYear(classRecord.school_year).map((item) => ({
        teacher_id: auth.user.id,
        class_subject_id: offering.id,
        school_year: classRecord.school_year,
        grading_period: item.short_label,
        written_work_weight: weights["Written/Oral Works"],
        performance_tasks_weight: weights["Product/Performance Tasks"],
        quarterly_exam_weight: weights.Examinations,
        passing_grade: 75,
        decimal_places: 2,
        rounding_method: "half_up",
        is_active: true,
      }))
      const { error: policyError } = await supabase.from("class_grading_configurations").insert(defaultPolicies)
      setScheduleMessage(policyError ? `Subject added, but default grading policies could not be created: ${policyError.message}` : "Subject added with default grading policies for every period.")
      setSubject("")
      await mutate()
    }
    setSaving(false)
  }
  async function removeSubject(id: string) { await supabase.from("class_subjects").update({ is_active: false }).eq("id", id); await mutate() }
  async function setEnrollment(studentId: string, active: boolean) { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; if (active) await supabase.from("class_enrollments").insert({ teacher_id: auth.user.id, class_id: classRecord.id, student_id: studentId }); else await supabase.from("class_enrollments").update({ status: "withdrawn" }).eq("class_id", classRecord.id).eq("student_id", studentId); await mutate() }

  return <main className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
    <Link href="/classes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to classes</Link>
    <header className="rounded-2xl border bg-card p-6"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-sm font-medium text-primary">{gradeLevelLabel(classRecord.grade_level)} · {classRecord.school_year}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{classRecord.section_name}</h1><p className="mt-2 text-sm text-muted-foreground">{classRecord.room || "Room not assigned"} · {enrolledPupils.length} active pupils · {data.subjects.length} subjects</p></div><div className="flex flex-wrap gap-2"><Link href={`/class-records?classId=${classRecord.id}`}><Button variant="outline"><FileSpreadsheet data-icon="inline-start" />Class records</Button></Link><Button type="button" variant="outline" onClick={beginEditClass}><Pencil data-icon="inline-start" />Edit class</Button></div></div><nav className="mt-6 flex gap-1 overflow-x-auto border-b" aria-label="Class sections">{[{id:"overview",label:"Overview",icon:BookOpen},{id:"subjects",label:"Subjects",icon:BookOpen},{id:"pupils",label:"Pupils",icon:Users},{id:"schedule",label:"Schedule",icon:CalendarDays}].map(({id,label,icon: Icon}) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{label}</button>)}</nav></header>
    {tab === "overview" && <section className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-card p-5"><Users className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{enrolledPupils.length}</p><p className="text-sm text-muted-foreground">Active pupils</p></div><div className="rounded-xl border bg-card p-5"><BookOpen className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{data.subjects.length}</p><p className="text-sm text-muted-foreground">Subject offerings</p></div><div className="rounded-xl border bg-card p-5"><CalendarDays className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{data.subjects.filter((item) => item.day_of_week !== null).length}</p><p className="text-sm text-muted-foreground">Scheduled subjects</p></div><div className="rounded-xl border bg-card p-5 md:col-span-3"><h2 className="font-semibold">Class context</h2><p className="mt-2 text-sm text-muted-foreground">Manage subjects, schedules, and enrollment. Academic records stay linked to this class.</p><div className="mt-4 flex flex-wrap gap-2">{data.subjects.map((item) => <span key={item.id} className="rounded-full bg-muted px-3 py-1.5 text-sm">{item.subject_name}</span>)}</div></div></section>}
    {tab === "subjects" && <section className="space-y-4"><div className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Learning area offerings</h2><p className="mt-1 text-sm text-muted-foreground">Choose from the fixed learning areas for {gradeLevelLabel(classRecord.grade_level)}. MAPEH is split into its template components.</p><div className="mt-4 flex gap-2"><select className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">Choose a learning area</option>{subjectsForGrade(classRecord.grade_level).filter((name) => !data.subjects.some((item) => item.subject_name === name)).map((name) => <option key={name}>{name}</option>)}</select><Button onClick={() => void addSubject()} disabled={saving || !subject}><Plus data-icon="inline-start" />Add area</Button></div>{scheduleMessage && <p className="mt-3 text-sm text-primary" role="status">{scheduleMessage}</p>}</div><div className="grid gap-3 md:grid-cols-2">{data.subjects.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border bg-card p-4"><div><p className="font-medium">{item.subject_name}</p><p className="text-sm text-muted-foreground">{item.teacher_name || "Teacher not assigned"} · {item.room || classRecord.room || "Room not assigned"}</p></div><div className="flex gap-1"><Link href={`/class-records?classId=${classRecord.id}&subjectId=${item.id}`}><Button variant="ghost" size="sm"><FileSpreadsheet data-icon="inline-start" />Records</Button></Link><Button variant="ghost" size="icon" onClick={() => void removeSubject(item.id)} aria-label={`Remove ${item.subject_name}`}><Trash2 className="size-4 text-destructive" /></Button></div></div>)}</div></section>}
    {tab === "pupils" && <section className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Pupil enrollment</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage active membership without changing the pupil&apos;s core record.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search available pupils</span><input className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" placeholder="Search available pupils" value={pupilSearch} onChange={(event) => setPupilSearch(event.target.value)} /></label>
          <PupilGenderFilter value={genderFilter} onChange={setGenderFilter} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Enrolled pupils ({pupils.length})</h3><div className="mt-3 divide-y">{pupils.map((student) => <div key={student.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-xs capitalize text-muted-foreground">{student.student_number} · {student.gender ?? "Gender not set"}</p></div><Button variant="ghost" size="sm" onClick={() => void setEnrollment(student.id, false)}>Remove</Button></div>)}</div></div>
        <div className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Available pupils</h3><div className="mt-3 divide-y">{available.slice(0, 20).map((student) => <div key={student.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-xs capitalize text-muted-foreground">{student.student_number} · {student.gender ?? "Gender not set"}</p></div><Button variant="outline" size="sm" onClick={() => void setEnrollment(student.id, true)}>Enroll</Button></div>)}</div></div>
      </div>
    </section>}
    {tab === "schedule" && <section className="rounded-xl border bg-card p-6"><CalendarDays className="size-6 text-primary" /><h2 className="mt-4 font-semibold">Class schedule</h2><p className="mt-1 text-sm text-muted-foreground">Set meeting details for each subject offering.</p>{scheduleMessage && <p className="mt-3 text-sm text-primary" role="status">{scheduleMessage}</p>}<div className="mt-5 divide-y">{data.subjects.map((item) => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"><div className="lg:col-span-1"><p className="font-medium">{item.subject_name}</p><p className="text-sm text-muted-foreground">{item.teacher_name || "Teacher not assigned"}</p></div><label className="text-sm">Day<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={scheduleFor(item.id).day_of_week} onChange={(event) => setScheduleValues((current) => ({ ...current, [item.id]: { ...scheduleFor(item.id), day_of_week: event.target.value } }))}><option value="">Not scheduled</option>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => <option key={day} value={String(index)}>{day}</option>)}</select></label><label className="text-sm">Start time<input type="time" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={scheduleFor(item.id).start_time} onChange={(event) => setScheduleValues((current) => ({ ...current, [item.id]: { ...scheduleFor(item.id), start_time: event.target.value } }))} /></label><label className="text-sm">End time<input type="time" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={scheduleFor(item.id).end_time} onChange={(event) => setScheduleValues((current) => ({ ...current, [item.id]: { ...scheduleFor(item.id), end_time: event.target.value } }))} /></label><div className="flex gap-2"><label className="min-w-0 flex-1 text-sm">Room<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={scheduleFor(item.id).room} onChange={(event) => setScheduleValues((current) => ({ ...current, [item.id]: { ...scheduleFor(item.id), room: event.target.value } }))} /></label><Button className="self-end" disabled={saving} onClick={() => void saveSchedule(item.id)}>Save</Button></div></div>)}</div></section>}
    {editClassOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditClassOpen(false) }}><form role="dialog" aria-modal="true" aria-labelledby="edit-class-title" onSubmit={(event) => void saveClassDetails(event)} className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-xl"><div><h2 id="edit-class-title" className="text-lg font-semibold">Edit class</h2><p className="text-sm text-muted-foreground">Update the class name, grade, school year, and room.</p></div><label className="block text-sm font-medium">Class name<input required className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={editClassForm.section_name} onChange={(event) => setEditClassForm({ ...editClassForm, section_name: event.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Grade<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={editClassForm.grade_level} onChange={(event) => setEditClassForm({ ...editClassForm, grade_level: event.target.value })}>{["0", "1", "2", "3", "4", "5", "6"].map((grade) => <option key={grade} value={grade}>{grade === "0" ? "Kinder" : `Grade ${grade}`}</option>)}</select></label><label className="text-sm font-medium">School year<input required className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={editClassForm.school_year} onChange={(event) => setEditClassForm({ ...editClassForm, school_year: event.target.value })} /></label></div><label className="block text-sm font-medium">Room<input className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={editClassForm.room} onChange={(event) => setEditClassForm({ ...editClassForm, room: event.target.value })} /></label>{scheduleMessage && <p className="text-sm text-destructive" role="alert">{scheduleMessage}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditClassOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></div></form></div>}
  </main>
}
