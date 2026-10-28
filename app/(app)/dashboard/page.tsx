"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FileText, HeartPulse, Loader2, Save, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type Profile = { full_name: string | null; school_name: string | null }
type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string; is_active: boolean }
type Student = { id: string; student_number: string; first_name: string; last_name: string; class_id: string; is_active: boolean }
type Attendance = { student_id: string; class_id: string; attendance_date: string; status: "present" | "late" | "absent" | "excused" }
type Assessment = { id: string; title: string; assessment_date: string; class_id: string; subject: string; grading_period: string }
type Intervention = { id: string; student_id: string; concern: string; status: "planned" | "ongoing" | "completed" | "on_hold"; start_date: string | null; target_review_date: string | null }
type Data = { profile: Profile | null; classes: ClassRecord[]; students: Student[]; attendance: Attendance[]; assessments: Assessment[]; interventions: Intervention[] }

type AttendanceState = Record<string, Attendance["status"]>
const todayInManila = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const formatDate = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00+08:00`))
const studentName = (student?: Student) => student ? `${student.first_name} ${student.last_name}` : "Unknown pupil"

async function fetchDashboard(): Promise<Data> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.")
  const [profile, classes, students, attendance, assessments, interventions] = await Promise.all([
    supabase.from("profiles").select("full_name, school_name").eq("id", auth.user.id).maybeSingle(),
    supabase.from("classes").select("id, grade_level, section_name, school_year, is_active").eq("teacher_id", auth.user.id).eq("is_active", true).order("grade_level"),
    supabase.from("students").select("id, student_number, first_name, last_name, class_id, is_active").eq("teacher_id", auth.user.id).eq("is_active", true).order("last_name"),
    supabase.from("attendance").select("student_id, class_id, attendance_date, status").eq("teacher_id", auth.user.id).order("attendance_date", { ascending: false }).limit(2000),
    supabase.from("assessments").select("id, title, assessment_date, class_id, subject, grading_period").eq("teacher_id", auth.user.id).order("assessment_date", { ascending: false }).limit(20),
    supabase.from("interventions").select("id, student_id, concern, status, start_date, target_review_date").eq("teacher_id", auth.user.id).order("updated_at", { ascending: false }),
  ])
  for (const result of [profile, classes, students, attendance, assessments, interventions]) if (result.error) throw result.error
  return { profile: profile.data, classes: classes.data ?? [], students: students.data ?? [], attendance: attendance.data ?? [], assessments: assessments.data ?? [], interventions: interventions.data ?? [] }
}

export default function DashboardPage() {
  const { data, error, isLoading, mutate } = useSWR("teacher-dashboard", fetchDashboard)
  const [selectedClass, setSelectedClass] = useState("")
  const [attendanceDate, setAttendanceDate] = useState(todayInManila)
  const [attendanceState, setAttendanceState] = useState<AttendanceState>({})
  const [loadedKey, setLoadedKey] = useState("")
  const [attendanceMessage, setAttendanceMessage] = useState("")
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [dirty, setDirty] = useState(false)
  const classes = data?.classes ?? []
  const students = data?.students ?? []
  const activeClassId = selectedClass || classes[0]?.id || ""
  const classStudents = students.filter((student) => student.class_id === activeClassId)
  const selectedClassRecord = classes.find((item) => item.id === activeClassId)
  const attendanceKey = `${activeClassId}:${attendanceDate}`

  const loadAttendance = () => {
    const saved = (data?.attendance ?? []).filter((item) => item.class_id === activeClassId && item.attendance_date === attendanceDate)
    const next: AttendanceState = {}
    classStudents.forEach((student) => { next[student.id] = saved.find((item) => item.student_id === student.id)?.status ?? "present" })
    setAttendanceState(next); setLoadedKey(attendanceKey); setDirty(false); setAttendanceMessage(saved.length ? "Saved attendance loaded." : "New register ready. Pupils default to Present until you save.")
  }
  const statusCounts = useMemo(() => Object.values(attendanceState).reduce((counts, status) => ({ ...counts, [status]: counts[status] + 1 }), { present: 0, late: 0, absent: 0, excused: 0 }), [attendanceState])
  const attention = useMemo(() => {
    const reviewIds = new Set((data?.interventions ?? []).filter((item) => item.status !== "completed" && item.target_review_date && item.target_review_date <= todayInManila()).map((item) => item.student_id))
    return students.filter((student) => reviewIds.has(student.id)).slice(0, 6)
  }, [data?.interventions, students])
  const calendarEvents = useMemo(() => [...(data?.interventions ?? []).flatMap((item) => [{ id: `${item.id}-start`, date: item.start_date, title: `Intervention starts: ${item.concern}`, studentId: item.student_id, kind: "Intervention" }, { id: `${item.id}-review`, date: item.target_review_date, title: `Review: ${item.concern}`, studentId: item.student_id, kind: "Review" }]), ...(data?.assessments ?? []).map((item) => ({ id: item.id, date: item.assessment_date, title: item.title, studentId: null, kind: "Assessment" }))].filter((event) => event.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8), [data?.assessments, data?.interventions])

  const updateStatus = (studentId: string, status: Attendance["status"]) => { setAttendanceState((current) => ({ ...current, [studentId]: status })); setDirty(true); setAttendanceMessage("") }
  const saveAttendance = async () => {
    if (!activeClassId || !classStudents.length || loadedKey !== attendanceKey) return setAttendanceMessage("Select a class, then load the attendance register before saving.")
    setSavingAttendance(true); setAttendanceMessage("")
    const supabase = createClient(); const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setAttendanceMessage("Your session has expired. Please sign in again."); setSavingAttendance(false); return }
    const rows = classStudents.map((student) => ({ teacher_id: auth.user.id, student_id: student.id, class_id: activeClassId, attendance_date: attendanceDate, status: attendanceState[student.id] ?? "present" }))
    const { error: saveError } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,attendance_date" })
    if (saveError) setAttendanceMessage(saveError.message)
    else { setDirty(false); setAttendanceMessage("Attendance saved successfully."); await mutate() }
    setSavingAttendance(false)
  }

  if (isLoading) return <section className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading your dashboard…</p></section>
  if (error) return <section className="mx-auto max-w-7xl p-6"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Unable to load dashboard</h1><p className="mt-2 text-sm text-muted-foreground">{error.message}</p></div></section>

  const todayAttendance = data?.attendance.filter((item) => item.class_id === activeClassId && item.attendance_date === todayInManila()) ?? []
  const attendanceRate = todayAttendance.filter((item) => item.status !== "excused").length ? Math.round(todayAttendance.filter((item) => item.status === "present" || item.status === "late").length / todayAttendance.filter((item) => item.status !== "excused").length * 100) : null
  const activeInterventions = data?.interventions.filter((item) => item.status === "planned" || item.status === "ongoing") ?? []
  const dueReviews = activeInterventions.filter((item) => item.target_review_date && item.target_review_date <= todayInManila())

  return <section className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
    {dirty && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" role="status">You have unsaved attendance changes. Save before leaving this page.</div>}
    <div><p className="text-sm font-medium text-primary">{formatDate(todayInManila())}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Good morning, {data?.profile?.full_name?.split(" ")[0] || "Teacher"}</h1><p className="mt-2 text-muted-foreground">Your daily workspace for pupil progress and timely support.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Link href="/pupils" className="rounded-xl border bg-card p-5 transition hover:border-primary"><Users className="text-primary" /><p className="mt-4 text-sm text-muted-foreground">Active pupils</p><p className="mt-1 text-3xl font-bold">{students.length}</p></Link>
      <Link href="/risk-assessment" className="rounded-xl border bg-card p-5 transition hover:border-primary"><AlertCircle className="text-destructive" /><p className="mt-4 text-sm text-muted-foreground">Pupils needing review</p><p className="mt-1 text-3xl font-bold">{attention.length}</p></Link>
      <Link href="/interventions" className="rounded-xl border bg-card p-5 transition hover:border-primary"><HeartPulse className="text-primary" /><p className="mt-4 text-sm text-muted-foreground">Active interventions</p><p className="mt-1 text-3xl font-bold">{activeInterventions.length}</p></Link>
      <Link href="/interventions" className="rounded-xl border bg-card p-5 transition hover:border-primary"><Clock3 className="text-amber-600" /><p className="mt-4 text-sm text-muted-foreground">Reviews due</p><p className="mt-1 text-3xl font-bold">{dueReviews.length}</p></Link>
      <div className="rounded-xl border bg-card p-5"><ClipboardCheck className="text-primary" /><p className="mt-4 text-sm text-muted-foreground">Today&apos;s attendance</p><p className="mt-1 text-3xl font-bold">{attendanceRate === null ? "—" : `${attendanceRate}%`}</p></div>
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><ClipboardCheck className="text-primary" /><h2 className="font-semibold">Daily attendance</h2></div><p className="mt-1 text-sm text-muted-foreground">Load a register to review or update saved attendance.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Attendance class" value={activeClassId} onChange={(event) => { setSelectedClass(event.target.value); setLoadedKey("") }} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>Grade {item.grade_level} – {item.section_name}</option>)}</select><input aria-label="Attendance date" type="date" value={attendanceDate} onChange={(event) => { setAttendanceDate(event.target.value); setLoadedKey("") }} className="rounded-lg border bg-background px-3 py-2 text-sm" /><Button variant="outline" onClick={loadAttendance} disabled={!activeClassId}>Load</Button></div></div>{!classStudents.length ? <div className="p-10 text-center text-sm text-muted-foreground">Create a class and add active pupils to record attendance.</div> : <><div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 text-sm"><span className="font-medium">{selectedClassRecord ? `Grade ${selectedClassRecord.grade_level} – ${selectedClassRecord.section_name}` : "Selected class"}</span><span className="text-muted-foreground">{classStudents.length} active pupils</span><span className="ml-auto flex gap-2 text-xs"><span className="text-primary">Present {statusCounts.present}</span><span className="text-amber-600">Late {statusCounts.late}</span><span className="text-destructive">Absent {statusCounts.absent}</span><span className="text-muted-foreground">Excused {statusCounts.excused}</span></span></div><div className="flex gap-2 border-b px-5 py-3"><Button size="sm" variant="outline" onClick={() => { setAttendanceState(Object.fromEntries(classStudents.map((student) => [student.id, "present"] as const))); setDirty(true) }}>Mark all present</Button><Button size="sm" variant="ghost" onClick={() => { setAttendanceState((current) => Object.fromEntries(classStudents.map((student) => [student.id, current[student.id] ?? "present"] as const))); setDirty(true) }}>Mark remaining present</Button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Pupil</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{classStudents.map((student) => <tr key={student.id}><td className="px-5 py-3"><span className="font-medium">{studentName(student)}</span><span className="ml-2 text-xs text-muted-foreground">{student.student_number}</span></td><td className="px-5 py-3"><select aria-label={`Attendance for ${studentName(student)}`} value={attendanceState[student.id] ?? "present"} onChange={(event) => updateStatus(student.id, event.target.value as Attendance["status"])} className="rounded-lg border bg-background px-3 py-1.5 text-sm"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t p-5"><p className="text-sm text-muted-foreground">{attendanceMessage}</p><Button onClick={saveAttendance} disabled={savingAttendance || loadedKey !== attendanceKey}>{savingAttendance ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}Save attendance</Button></div></>}</div>
      <div className="rounded-xl border bg-card"><div className="border-b p-5"><div className="flex items-center gap-2"><AlertCircle className="text-amber-600" /><h2 className="font-semibold">Pupils needing attention</h2></div><p className="mt-1 text-sm text-muted-foreground">Overdue intervention reviews appear here.</p></div>{attention.length ? <div className="divide-y">{attention.map((student) => <Link key={student.id} href={`/pupils/${student.id}`} className="block p-4 transition hover:bg-muted/40"><p className="font-medium">{studentName(student)}</p><p className="mt-1 text-sm text-muted-foreground">Review an active intervention plan</p></Link>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">No pupils currently need follow-up.</div>}</div>
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="rounded-xl border bg-card"><div className="flex items-center gap-2 border-b p-5"><CalendarDays className="text-primary" /><h2 className="font-semibold">Upcoming responsibilities</h2></div>{calendarEvents.length ? <div className="divide-y">{calendarEvents.map((event) => <div key={event.id} className="flex items-start gap-3 p-4"><span className={`mt-1 size-2 rounded-full ${event.kind === "Assessment" ? "bg-sky-500" : event.kind === "Review" ? "bg-amber-500" : "bg-primary"}`} /><div><p className="font-medium">{event.title}</p><p className="mt-1 text-sm text-muted-foreground">{formatDate(String(event.date))} · {event.kind}{event.studentId ? ` · ${studentName(students.find((student) => student.id === event.studentId))}` : ""}</p></div></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">No upcoming assessments or intervention dates.</div>}</div><div className="rounded-xl border bg-card"><div className="flex items-center gap-2 border-b p-5"><FileText className="text-primary" /><h2 className="font-semibold">Recent academic activity</h2></div>{data?.assessments.length ? <div className="divide-y">{data.assessments.slice(0, 5).map((assessment) => <Link key={assessment.id} href="/academic-records" className="block p-4 transition hover:bg-muted/40"><p className="font-medium">{assessment.title}</p><p className="mt-1 text-sm text-muted-foreground">{assessment.subject} · {formatDate(assessment.assessment_date)}</p></Link>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Assessment activity will appear once records are added.</div>}</div></div>
  </section>
}
