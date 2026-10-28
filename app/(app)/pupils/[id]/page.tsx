"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Pencil, ShieldAlert, XCircle } from "lucide-react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type Student = { id: string; class_id: string; student_number: string; first_name: string; last_name: string; parent_guardian_name: string | null; parent_guardian_email: string | null; is_active: boolean }
type Assessment = { id: string; title: string; assessment_type: string; subject: string; grading_period: string; assessment_date: string; total_points: number; assessment_scores: { score: number | null }[] }
type Attendance = { id: string; attendance_date: string; status: "present" | "late" | "absent" | "excused" }
type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string }

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(`${value}T00:00:00+08:00`))
const statusLabel = (status: Attendance["status"]) => status.charAt(0).toUpperCase() + status.slice(1)

async function fetchDetails(id: string) {
  const supabase = createClient()
  const { data: student, error: studentError } = await supabase.from("students").select("id, class_id, student_number, first_name, last_name, parent_guardian_name, parent_guardian_email, is_active").eq("id", id).single()
  if (studentError) throw studentError
  const [assessmentResult, classResult, attendanceResult] = await Promise.all([
    supabase.from("assessments").select("id, title, assessment_type, subject, grading_period, assessment_date, total_points, assessment_scores(score)").eq("class_id", student.class_id).order("assessment_date", { ascending: false }),
    supabase.from("classes").select("id, grade_level, section_name, school_year").eq("id", student.class_id).single(),
    supabase.from("attendance").select("id, attendance_date, status").eq("student_id", id).eq("class_id", student.class_id).order("attendance_date", { ascending: false }),
  ])
  if (assessmentResult.error) throw assessmentResult.error
  if (classResult.error) throw classResult.error
  if (attendanceResult.error) throw attendanceResult.error
  return { student: student as Student, assessments: (assessmentResult.data ?? []) as Assessment[], classRecord: classResult.data as ClassRecord, attendance: (attendanceResult.data ?? []) as Attendance[] }
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></div>
}

export default function PupilDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error, isLoading } = useSWR(["pupil-details", id], ([, pupilId]) => fetchDetails(pupilId), { revalidateOnFocus: true })
  const [period, setPeriod] = useState("all")
  const [subject, setSubject] = useState("all")
  const [attendanceYear, setAttendanceYear] = useState("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  const attendance = data?.attendance ?? []
  const attendanceYears = [...new Set(attendance.map((item) => item.attendance_date.slice(0, 4)))].sort().reverse()
  const filteredAttendance = attendance.filter((item) => (attendanceYear === "all" || item.attendance_date.startsWith(attendanceYear)) && (!fromDate || item.attendance_date >= fromDate) && (!toDate || item.attendance_date <= toDate))
  const attendanceSummary = useMemo(() => filteredAttendance.reduce((summary, item) => ({ ...summary, [item.status]: summary[item.status] + 1 }), { present: 0, late: 0, absent: 0, excused: 0 }), [filteredAttendance])
  const eligibleDays = attendanceSummary.present + attendanceSummary.late + attendanceSummary.absent
  const attendanceRate = eligibleDays ? Math.round((attendanceSummary.present + attendanceSummary.late) / eligibleDays * 100) : null

  if (isLoading) return <section className="p-8 text-sm text-muted-foreground">Loading pupil profile…</section>
  if (error || !data) return <section className="p-8"><p className="text-destructive">Unable to load this pupil profile.</p><Button render={<Link href="/pupils" />} variant="outline" className="mt-4">Back to pupils</Button></section>

  const { student, classRecord } = data
  const assessments = data.assessments.filter((item) => (period === "all" || item.grading_period === period) && (subject === "all" || item.subject === subject))
  const scored = assessments.flatMap((item) => item.assessment_scores[0]?.score == null ? [] : [{ score: Number(item.assessment_scores[0].score), total: Number(item.total_points), subject: item.subject }])
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score / item.total, 0) / scored.length * 100) : null
  const subjects = [...new Set(data.assessments.map((item) => item.subject))]
  const subjectAverages = subjects.map((name) => { const values = scored.filter((item) => item.subject === name); return { name, value: values.length ? Math.round(values.reduce((sum, item) => sum + item.score / item.total, 0) / values.length * 100) : 0 } }).filter((item) => item.value > 0)

  return <section className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
    <Button render={<Link href="/pupils" />} variant="ghost" className="w-fit"><ArrowLeft data-icon="inline-start" />Back to pupils</Button>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Pupil profile</p><h1 className="mt-1 text-3xl font-bold">{student.first_name} {student.last_name}</h1><p className="mt-2 text-muted-foreground">Student no. {student.student_number} · Grade {classRecord.grade_level} · {classRecord.section_name} · {classRecord.school_year}</p></div><Button render={<Link href="/pupils" />} variant="outline"><Pencil data-icon="inline-start" />Edit pupil</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Academic average" value={average == null ? "—" : `${average}%`} tone="text-primary" /><Stat label="Attendance rate" value={attendanceRate == null ? "—" : `${attendanceRate}%`} tone="text-emerald-600" /><Stat label="Present / late" value={`${attendanceSummary.present} / ${attendanceSummary.late}`} tone="text-primary" /><Stat label="Absent" value={attendanceSummary.absent} tone="text-destructive" /><div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parent/guardian</p><p className="mt-2 truncate font-semibold">{student.parent_guardian_name || "Not recorded"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{student.parent_guardian_email || "No email recorded"}</p></div></div>
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Attendance History</h2><p className="mt-1 text-sm text-muted-foreground">Saved attendance records for this pupil. Excused records are excluded from the rate.</p></div><CalendarDays className="text-primary" /></div><div className="grid gap-3 border-b p-5 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium">School year<select aria-label="Attendance school year" value={attendanceYear} onChange={(event) => setAttendanceYear(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All years</option>{attendanceYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label className="grid gap-1 text-xs font-medium">From<input aria-label="Attendance from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium">To<input aria-label="Attendance to date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" /></label></div><div className="grid grid-cols-4 gap-2 border-b p-5"><Stat label="Present" value={attendanceSummary.present} tone="text-emerald-600" /><Stat label="Late" value={attendanceSummary.late} tone="text-amber-600" /><Stat label="Absent" value={attendanceSummary.absent} tone="text-destructive" /><Stat label="Excused" value={attendanceSummary.excused} tone="text-muted-foreground" /></div>{filteredAttendance.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Remarks</th></tr></thead><tbody className="divide-y">{filteredAttendance.map((item) => <tr key={item.id}><td className="px-5 py-3">{formatDate(item.attendance_date)}</td><td className="px-5 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "present" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : item.status === "late" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : item.status === "absent" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{statusLabel(item.status)}</span></td><td className="px-5 py-3 text-muted-foreground">—</td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-muted-foreground">No attendance data available</div>}</div>
      <div className="rounded-xl border bg-card"><div className="border-b p-5"><h2 className="font-semibold">Academic overview</h2><p className="mt-1 text-sm text-muted-foreground">Average score by subject from recorded assessments.</p></div>{subjectAverages.length ? <div className="flex flex-col gap-5 p-5">{subjectAverages.map((item) => <div key={item.name}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{item.name}</span><span className="text-muted-foreground">{item.value}%</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.value}%` }} /></div></div>)}</div> : <div className="p-10 text-center text-sm text-muted-foreground">No academic scores available</div>}</div>
    </div>
    <div className="rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Assessment records</h2><p className="mt-1 text-sm text-muted-foreground">Only records saved for this pupil are shown.</p></div><div className="flex gap-2"><select aria-label="Filter grading period" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All periods</option>{["First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All subjects</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></div></div>{assessments.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Assessment</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Period</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Score</th></tr></thead><tbody className="divide-y">{assessments.map((item) => { const score = item.assessment_scores[0]?.score; return <tr key={item.id}><td className="px-5 py-3 font-medium">{item.title}<p className="text-xs text-muted-foreground">{item.assessment_type}</p></td><td className="px-5 py-3">{item.subject}</td><td className="px-5 py-3">{item.grading_period}</td><td className="px-5 py-3">{formatDate(item.assessment_date)}</td><td className="px-5 py-3 font-medium">{score == null ? "Not recorded" : `${score} / ${item.total_points}`}</td></tr>})}</tbody></table></div> : <div className="p-10 text-center text-sm text-muted-foreground">No assessments match the selected filters.</div>}</div>
  </section>
}
