"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { useState } from "react"
import { ArrowLeft, BookOpen, CalendarDays, Search, Users, Plus, Trash2, Settings2, FileSpreadsheet } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { matchesPupilGender, PupilGenderFilter, sortPupilsAlphabetically, type PupilGenderFilterValue } from "@/components/pupils/gender-filter"

const supabase = createClient()
const fetcher = async (id: string) => {
  const [classResult, subjects, enrollments, students, configurations] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year,room,subject_name").eq("id", id).single(),
    supabase.from("class_subjects").select("id,subject_name,teacher_name,day_of_week,start_time,end_time,room,is_active").eq("class_id", id).eq("is_active", true).order("subject_name"),
    supabase.from("class_enrollments").select("id,student_id,status,enrolled_on").eq("class_id", id).eq("status", "active"),
    supabase.from("students").select("id,student_number,first_name,last_name,class_id,gender").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("class_grading_configurations").select("id,class_subject_id,school_year,grading_period,written_work_weight,performance_tasks_weight,quarterly_exam_weight,passing_grade,decimal_places,rounding_method"),
  ])
  for (const result of [classResult, subjects, enrollments, students, configurations]) if (result.error) throw new Error(result.error.message)
  return { classRecord: classResult.data, subjects: subjects.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [], configurations: configurations.data ?? [] }
}

export default function ClassWorkspacePage() {
  const params = useParams<{ id: string }>()
  const { data, error, isLoading, mutate } = useSWR(params.id ? ["class-workspace", params.id] : null, ([, id]) => fetcher(id))
  const [tab, setTab] = useState("overview")
  const [subject, setSubject] = useState("")
  const [pupilSearch, setPupilSearch] = useState("")
  const [genderFilter, setGenderFilter] = useState<PupilGenderFilterValue>("all")
  const [selectedSubject, setSelectedSubject] = useState("")
  const [period, setPeriod] = useState("Q1")
  const [gradingForm, setGradingForm] = useState({ written: "30", performance: "50", exam: "20", passing: "75", decimals: "2", rounding: "half_up" })
  const [gradingMessage, setGradingMessage] = useState("")
  const [saving, setSaving] = useState(false)

  if (isLoading) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading class workspace…</p></main>
  if (error || !data?.classRecord) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load this class.</p><Link href="/classes" className="mt-3 inline-flex text-sm text-primary hover:underline">Back to classes</Link></main>
  const classRecord = data.classRecord
  const enrolledIds = new Set(data.enrollments.map((row) => row.student_id))
  const enrolledPupils = data.students.filter((student) => enrolledIds.has(student.id))
  const pupils = sortPupilsAlphabetically(data.students.filter((student) => enrolledIds.has(student.id) && matchesPupilGender(student.gender, genderFilter)))
  const available = sortPupilsAlphabetically(data.students.filter((student) => !enrolledIds.has(student.id) && matchesPupilGender(student.gender, genderFilter) && `${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase().includes(pupilSearch.toLowerCase())))
  const totalWeight = Number(gradingForm.written) + Number(gradingForm.performance) + Number(gradingForm.exam)
  const configurations = data?.configurations ?? []

  function loadGradingPolicy(subjectId: string, periodValue: string) {
    setSelectedSubject(subjectId)
    const config = configurations.find((row) => row.class_subject_id === subjectId && row.school_year === classRecord.school_year && row.grading_period === periodValue)
    setGradingForm({ written: String(config?.written_work_weight ?? 30), performance: String(config?.performance_tasks_weight ?? 50), exam: String(config?.quarterly_exam_weight ?? 20), passing: String(config?.passing_grade ?? 75), decimals: String(config?.decimal_places ?? 2), rounding: config?.rounding_method ?? "half_up" })
    setGradingMessage("")
  }
  function openGrading(subjectId: string) {
    loadGradingPolicy(subjectId, period)
    setTab("grading")
  }
  function changeGradingPeriod(periodValue: string) {
    setPeriod(periodValue)
    if (selectedSubject) loadGradingPolicy(selectedSubject, periodValue)
  }
  async function addSubject() { if (!subject.trim()) return; const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; setSaving(true); await supabase.from("class_subjects").insert({ teacher_id: auth.user.id, class_id: classRecord.id, subject_name: subject.trim(), room: classRecord.room }); setSubject(""); await mutate(); setSaving(false) }
  async function removeSubject(id: string) { await supabase.from("class_subjects").update({ is_active: false }).eq("id", id); await mutate() }
  async function setEnrollment(studentId: string, active: boolean) { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; if (active) await supabase.from("class_enrollments").insert({ teacher_id: auth.user.id, class_id: classRecord.id, student_id: studentId }); else await supabase.from("class_enrollments").update({ status: "withdrawn" }).eq("class_id", classRecord.id).eq("student_id", studentId); await mutate() }
  async function saveGrading() { if (!selectedSubject || totalWeight !== 100) return; const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; setSaving(true); setGradingMessage(""); const { error: saveError } = await supabase.from("class_grading_configurations").upsert({ teacher_id: auth.user.id, class_subject_id: selectedSubject, school_year: classRecord.school_year, grading_period: period, written_work_weight: Number(gradingForm.written), performance_tasks_weight: Number(gradingForm.performance), quarterly_exam_weight: Number(gradingForm.exam), passing_grade: Number(gradingForm.passing), decimal_places: Number(gradingForm.decimals), rounding_method: gradingForm.rounding }, { onConflict: "teacher_id,class_subject_id,school_year,grading_period" }); setGradingMessage(saveError ? saveError.message : "Grading policy saved for this subject and period."); await mutate(); setSaving(false) }

  return <main className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
    <Link href="/classes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to classes</Link>
    <header className="rounded-2xl border bg-card p-6"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-sm font-medium text-primary">Grade {classRecord.grade_level} · {classRecord.school_year}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{classRecord.section_name}</h1><p className="mt-2 text-sm text-muted-foreground">{classRecord.room || "Room not assigned"} · {enrolledPupils.length} active pupils · {data.subjects.length} subjects</p></div><div className="flex gap-2"><Link href={`/class-records?classId=${classRecord.id}`}><Button variant="outline"><FileSpreadsheet data-icon="inline-start" />Class records</Button></Link><Button variant="outline">Edit class</Button></div></div><nav className="mt-6 flex gap-1 overflow-x-auto border-b" aria-label="Class sections">{[{id:"overview",label:"Overview",icon:BookOpen},{id:"subjects",label:"Subjects",icon:BookOpen},{id:"pupils",label:"Pupils",icon:Users},{id:"schedule",label:"Schedule",icon:CalendarDays},{id:"grading",label:"Grading",icon:Settings2}].map(({id,label,icon: Icon}) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{label}</button>)}</nav></header>
    {tab === "overview" && <section className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-card p-5"><Users className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{enrolledPupils.length}</p><p className="text-sm text-muted-foreground">Active pupils</p></div><div className="rounded-xl border bg-card p-5"><BookOpen className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{data.subjects.length}</p><p className="text-sm text-muted-foreground">Subject offerings</p></div><div className="rounded-xl border bg-card p-5"><CalendarDays className="size-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{data.subjects.filter((item) => item.day_of_week !== null).length}</p><p className="text-sm text-muted-foreground">Scheduled subjects</p></div><div className="rounded-xl border bg-card p-5 md:col-span-3"><h2 className="font-semibold">Class context</h2><p className="mt-2 text-sm text-muted-foreground">Manage subjects, schedules, enrollment, and per-subject grading policy. Academic records stay linked to this class.</p><div className="mt-4 flex flex-wrap gap-2">{data.subjects.map((item) => <span key={item.id} className="rounded-full bg-muted px-3 py-1.5 text-sm">{item.subject_name}</span>)}</div></div></section>}
    {tab === "subjects" && <section className="space-y-4"><div className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Subject offerings</h2><p className="mt-1 text-sm text-muted-foreground">Add subjects taught in this section. These offerings are used by assessments and grading.</p><div className="mt-4 flex gap-2"><input className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" placeholder="e.g. Mathematics" value={subject} onChange={(event) => setSubject(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) void addSubject() }} /><Button onClick={() => void addSubject()} disabled={saving || !subject.trim()}><Plus data-icon="inline-start" />Add subject</Button></div></div><div className="grid gap-3 md:grid-cols-2">{data.subjects.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border bg-card p-4"><div><p className="font-medium">{item.subject_name}</p><p className="text-sm text-muted-foreground">{item.teacher_name || "Teacher not assigned"} · {item.room || classRecord.room || "Room not assigned"}</p></div><div className="flex gap-1"><Link href={`/class-records?classId=${classRecord.id}&subjectId=${item.id}`}><Button variant="ghost" size="sm"><FileSpreadsheet data-icon="inline-start" />Records</Button></Link><Button variant="ghost" size="sm" onClick={() => openGrading(item.id)}>Grading</Button><Button variant="ghost" size="icon" onClick={() => void removeSubject(item.id)} aria-label={`Remove ${item.subject_name}`}><Trash2 className="size-4 text-destructive" /></Button></div></div>)}</div></section>}
    {tab === "grading" && <section className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div><h2 className="font-semibold">Subject grading policy</h2><p className="mt-1 text-sm text-muted-foreground">Configure category weights and grading rules for one subject and quarter.</p></div>
          <label className="text-sm font-medium">Grading period
            <select aria-label="Grading period" className="mt-1.5 h-10 min-w-36 rounded-md border bg-background px-3 text-sm" value={period} onChange={(event) => changeGradingPeriod(event.target.value)}>{["Q1","Q2","Q3","Q4"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
        </div>
        <div className="mt-4 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currently editing</p>
          <h3 className="mt-1 text-lg font-semibold">{period} grading weights{selectedSubject ? ` · ${data.subjects.find((item) => item.id === selectedSubject)?.subject_name ?? "Subject"}` : ""}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Grade {classRecord.grade_level} · {classRecord.section_name} · {classRecord.school_year}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Subject
            <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={selectedSubject} onChange={(event) => loadGradingPolicy(event.target.value, period)}>
              <option value="">Choose a subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Passing grade (%)
            <input type="number" min="0" max="100" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={gradingForm.passing} onChange={(event) => setGradingForm({ ...gradingForm, passing: event.target.value })} />
          </label>
        </div>
      </div>
      {selectedSubject && <div key={`${selectedSubject}:${period}`} className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-base font-semibold">{period} · {data.subjects.find((item) => item.id === selectedSubject)?.subject_name} category weights</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">Written Work (%)<input type="number" min="0" max="100" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={gradingForm.written} onChange={(event) => setGradingForm({ ...gradingForm, written: event.target.value })} /></label>
          <label className="text-sm font-medium">Performance Tasks (%)<input type="number" min="0" max="100" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={gradingForm.performance} onChange={(event) => setGradingForm({ ...gradingForm, performance: event.target.value })} /></label>
          <label className="text-sm font-medium">Quarterly Examination (%)<input type="number" min="0" max="100" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={gradingForm.exam} onChange={(event) => setGradingForm({ ...gradingForm, exam: event.target.value })} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className={`text-sm ${totalWeight === 100 ? "text-muted-foreground" : "text-destructive"}`}>Weights total {totalWeight}%. They must total 100%.</p>
          <Button onClick={() => void saveGrading()} disabled={saving || totalWeight !== 100}>{saving ? "Saving…" : "Save grading policy"}</Button>
        </div>
        {gradingMessage && <p className="mt-3 text-sm text-primary">{gradingMessage}</p>}
      </div>}
    </section>}
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
    {tab === "schedule" && <section className="rounded-xl border bg-card p-6"><CalendarDays className="size-6 text-primary" /><h2 className="mt-4 font-semibold">Class schedule</h2><p className="mt-1 text-sm text-muted-foreground">Schedule details are managed per subject offering.</p><div className="mt-5 divide-y">{data.subjects.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{item.subject_name}</p><p className="text-sm text-muted-foreground">{item.teacher_name || "Teacher not assigned"}</p></div><span className="text-sm text-muted-foreground">{item.day_of_week === null ? "No day assigned" : `Day ${item.day_of_week}`} {item.start_time ? `· ${item.start_time}–${item.end_time}` : ""}</span></div>)}</div></section>}
  </main>
}
