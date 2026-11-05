"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import Link from "next/link"
import { AlertCircle, CalendarDays, ClipboardCheck, Clock3, FileText, HeartPulse, Loader2, Save, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination"
import { matchesPupilGender, PupilGenderFilter, sortPupilsAlphabetically, type PupilGenderFilterValue } from "@/components/pupils/gender-filter"
import { gradeLevelLabel, periodLabelForSchoolYear } from "@/lib/academic-structure"
import { TrendChart } from "@/components/ui/trend-chart"
import { classifyRisk, type RiskThresholds } from "@/lib/risk-engine"

type Profile = { full_name: string | null; school_name: string | null }
type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string; subject_name: string | null; is_active: boolean }
type Student = { id: string; student_number: string; first_name: string; last_name: string; class_id: string; gender: "male" | "female" | null; is_active: boolean }
type Attendance = { student_id: string; class_id: string; attendance_date: string; status: "present" | "late" | "absent" | "excused" }
type Assessment = { id: string; title: string; assessment_date: string; class_id: string; subject: string; grading_period: string; total_points: number; passing_percentage: number; assessment_scores: Array<{ student_id: string; score: number | null; updated_at?: string }> }
type RiskSettingRow = { school_year: string; grade_level: number | null; subject_name: string | null; risk_thresholds: Partial<RiskThresholds> | null }
type Intervention = { id: string; student_id: string; concern: string; status: "planned" | "ongoing" | "completed" | "on_hold"; start_date: string | null; target_review_date: string | null; updated_at?: string }
type InterventionPlan = { id: string; student_id: string; title: string; status: string }
type InterventionSession = { id: string; plan_id: string; session_number: number; scheduled_date: string; start_time: string | null; end_time: string | null; activity: string; status: string }
type TermPeriod = { school_year: string; short_label: string; display_name: string; start_date: string; end_date: string }
type Data = { profile: Profile | null; classes: ClassRecord[]; students: Student[]; attendance: Attendance[]; assessments: Assessment[]; interventions: Intervention[]; interventionPlans: InterventionPlan[]; interventionSessions: InterventionSession[]; pendingSessions: number; riskSettings: RiskSettingRow[]; terms: TermPeriod[] }
type AttendanceState = Record<string, Attendance["status"]>

const todayInManila = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const dateOnly = (date: string) => date.slice(0, 10)
const normalizeSchoolYear = (schoolYear: string) => schoolYear.replace(/\D/g, "")
const formatDate = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${dateOnly(date)}T00:00:00+08:00`))
const studentName = (student?: Student) => student ? `${student.first_name} ${student.last_name}` : "Unknown pupil"

async function fetchDashboard(): Promise<Data> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.")
  const [profile, classes, students, attendance, assessments, interventions, interventionPlans, interventionSessions, gradingSettings, terms] = await Promise.all([
    supabase.from("profiles").select("full_name, school_name").eq("id", auth.user.id).maybeSingle(),
    supabase.from("classes").select("id, grade_level, section_name, school_year, subject_name, is_active").eq("teacher_id", auth.user.id).eq("is_active", true).order("grade_level"),
    supabase.from("students").select("id, student_number, first_name, last_name, class_id, gender, is_active").eq("teacher_id", auth.user.id).eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("attendance").select("student_id, class_id, attendance_date, status").eq("teacher_id", auth.user.id).order("attendance_date", { ascending: false }).limit(3000),
    supabase.from("assessments").select("id, title, assessment_date, class_id, subject, grading_period, total_points, passing_percentage, assessment_scores(student_id,score,updated_at)").eq("teacher_id", auth.user.id).order("assessment_date", { ascending: false }).limit(1000),
    supabase.from("interventions").select("id, student_id, concern, status, start_date, target_review_date, updated_at").eq("teacher_id", auth.user.id).order("updated_at", { ascending: false }),
    supabase.from("intervention_plans").select("id, student_id, title, status").eq("teacher_id", auth.user.id),
    supabase.from("intervention_sessions").select("id, plan_id, session_number, scheduled_date, start_time, end_time, activity, status", { count: "exact" }).eq("teacher_id", auth.user.id).gte("scheduled_date", todayInManila()).neq("status", "completed").order("scheduled_date").limit(50),
    supabase.from("grading_settings").select("school_year,grade_level,subject_name,risk_thresholds"),
    supabase.from("grading_periods").select("school_year,short_label,display_name,start_date,end_date").eq("teacher_id", auth.user.id).order("quarter_number"),
  ])
  for (const result of [profile, classes, students, attendance, assessments, interventions, interventionPlans, interventionSessions, gradingSettings, terms]) if (result.error) throw result.error
  return { profile: profile.data, classes: classes.data ?? [], students: students.data ?? [], attendance: attendance.data ?? [], assessments: assessments.data ?? [], interventions: interventions.data ?? [], interventionPlans: interventionPlans.data ?? [], interventionSessions: interventionSessions.data ?? [], pendingSessions: interventionSessions.count ?? 0, riskSettings: (gradingSettings.data ?? []) as RiskSettingRow[], terms: terms.data ?? [] }
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { mutate: mutateSWR } = useSWRConfig()
  const { data, error, isLoading, mutate } = useSWR("teacher-dashboard", fetchDashboard, {
    revalidateOnMount: true,
    revalidateOnFocus: true,
  })
  const [selectedClass, setSelectedClass] = useState("")
  const [attendanceDate, setAttendanceDate] = useState(todayInManila)
  const [attendanceState, setAttendanceState] = useState<AttendanceState>({})
  const [manuallyChanged, setManuallyChanged] = useState<Set<string>>(new Set())
  const [attendanceMessage, setAttendanceMessage] = useState("")
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [attendancePage, setAttendancePage] = useState(1)
  const [genderFilter, setGenderFilter] = useState<PupilGenderFilterValue>("all")
  const [dirty, setDirty] = useState(false)
  const classes = data?.classes ?? []
  const students = data?.students ?? []
  const activeClassId = selectedClass || classes[0]?.id || ""
  const highRiskStudentCount = useMemo(() => {
    if (!data) return 0
    const defaultRiskThresholds: RiskThresholds = {
      low_assessment_threshold: 75,
      repeated_failed_assessments: 2,
      attendance_concern_absences: 5,
      moderate_risk_score: 2,
      high_risk_score: 4,
    }
    const scores = data.assessments.flatMap((assessment) =>
      assessment.assessment_scores.map((score) => ({
        assessment_id: assessment.id,
        student_id: score.student_id,
        score: score.score,
        updated_at: score.updated_at,
      })),
    )
    return students.filter((student) => {
      const studentClass = classes.find((item) => item.id === student.class_id)
      const settings = data.riskSettings.filter(
        (row) => row.school_year === studentClass?.school_year,
      )
      const classSubject = studentClass?.subject_name ?? ""
      const matchingSettings =
        settings.find(
          (row) =>
            row.grade_level === studentClass?.grade_level &&
            (row.subject_name ?? "") === classSubject &&
            classSubject !== "",
        ) ??
        settings.find(
          (row) =>
            row.grade_level === studentClass?.grade_level &&
            !(row.subject_name ?? "").trim(),
        ) ??
        settings.find(
          (row) => row.grade_level === null && !(row.subject_name ?? "").trim(),
        ) ??
        settings[0]
      const risk = classifyRisk(
        student,
        {
          classes,
          assessments: data.assessments,
          scores,
          attendance: data.attendance,
          settings: { ...defaultRiskThresholds, ...(matchingSettings?.risk_thresholds ?? {}) },
        },
        studentClass?.school_year ?? "",
      )
      return risk.level === "high"
    }).length
  }, [data, students, classes])
  const classStudents = sortPupilsAlphabetically(students.filter((student) => student.class_id === activeClassId))
  const visibleClassStudents = classStudents.filter((student) => matchesPupilGender(student.gender, genderFilter))
  const pageClassStudents = visibleClassStudents.slice((attendancePage - 1) * DEFAULT_PAGE_SIZE, attendancePage * DEFAULT_PAGE_SIZE)
  const selectedClassRecord = classes.find((item) => item.id === activeClassId)
  const savedForSelection = (data?.attendance ?? []).filter((item) => item.class_id === activeClassId && item.attendance_date === attendanceDate)
  const trendData = useMemo(() => {
    const classAttendance = (data?.attendance ?? []).filter((item) => item.class_id === activeClassId)
    const todayDate = new Date(`${todayInManila()}T00:00:00Z`)
    const currentWeekStart = new Date(todayDate)
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - currentWeekStart.getUTCDay())
    const weeks = Array.from({ length: 8 }, (_, index) => {
      const start = new Date(currentWeekStart)
      start.setUTCDate(start.getUTCDate() - (7 * (7 - index)))
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + 7)
      const startDate = start.toISOString().slice(0, 10)
      const endDate = end.toISOString().slice(0, 10)
      const eligible = classAttendance.filter((item) =>
        dateOnly(item.attendance_date) >= startDate &&
        dateOnly(item.attendance_date) < endDate &&
        item.status !== "excused",
      )
      const attended = eligible.filter((item) => item.status === "present" || item.status === "late").length
      return eligible.length
        ? {
            label: new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(start),
            value: (attended / eligible.length) * 100,
          }
        : null
    }).filter((point): point is { label: string; value: number } => point !== null)
    const assessmentPoints = (data?.assessments ?? [])
      .filter((item) => item.class_id === activeClassId && Number(item.total_points) > 0)
      .map((item) => {
        const scores = item.assessment_scores
          .filter((entry) => entry.score !== null)
          .map((entry) => Number(entry.score) / Number(item.total_points) * 100)
          .filter(Number.isFinite)
        if (!scores.length) return null
        return {
          title: item.title,
          date: dateOnly(item.assessment_date),
          value: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        }
      })
      .filter((point): point is { title: string; date: string; value: number } => point !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((point, index) => ({
        label: String(index + 1),
        value: point.value,
        tooltip: `${point.title} · ${formatDate(point.date)}`,
      }))
    return { attendance: weeks, performance: assessmentPoints }
  }, [data?.attendance, data?.assessments, activeClassId])

  const changeRegister = (change: () => void) => {
    if (dirty && !window.confirm("You have unsaved attendance changes. Discard them and switch the register?")) return
    change(); setAttendancePage(1); setAttendanceState({}); setManuallyChanged(new Set()); setDirty(false); setAttendanceMessage("")
  }
  const loadAttendance = () => {
    const savedByStudent = new Map(savedForSelection.map((item) => [item.student_id, item.status]))
    const next: AttendanceState = {}
    classStudents.forEach((student) => { next[student.id] = savedByStudent.get(student.id) ?? "present" })
    setAttendanceState(next); setManuallyChanged(new Set()); setDirty(false)
    setAttendanceMessage(savedForSelection.length ? "Saved attendance loaded." : "New register ready. Pupils default to Present until you save.")
  }
  useEffect(() => {
    if (!activeClassId) return
    loadAttendance()
  }, [activeClassId, attendanceDate, data?.attendance])
  const statusCounts = useMemo(() => Object.values(attendanceState).reduce((counts, status) => ({ ...counts, [status]: counts[status] + 1 }), { present: 0, late: 0, absent: 0, excused: 0 }), [attendanceState])
  const updateStatus = (studentId: string, status: Attendance["status"]) => { setAttendanceState((current) => ({ ...current, [studentId]: status })); setManuallyChanged((current) => new Set(current).add(studentId)); setDirty(true); setAttendanceMessage("") }
  const markAll = (onlyRemaining: boolean) => { setAttendanceState((current) => { const next = { ...current }; visibleClassStudents.forEach((student) => { next[student.id] = onlyRemaining && manuallyChanged.has(student.id) ? current[student.id] ?? "present" : "present" }); return next }); setManuallyChanged((current) => new Set([...current, ...visibleClassStudents.map((student) => student.id)])); setDirty(true); setAttendanceMessage("") }
  const saveAttendance = async () => {
    if (!activeClassId || !classStudents.length) { setAttendanceMessage("Select a class with active pupils before saving attendance."); return }
    setSavingAttendance(true); setAttendanceMessage("")
    const supabase = createClient(); const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setAttendanceMessage("Your session has expired. Please sign in again."); setSavingAttendance(false); return }
    const rows = classStudents.map((student) => ({ teacher_id: auth.user.id, student_id: student.id, class_id: activeClassId, attendance_date: attendanceDate, status: attendanceState[student.id] ?? "present" }))
    const { error: saveError } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,attendance_date" })
    if (saveError) setAttendanceMessage(`Attendance could not be saved: ${saveError.message}`)
    else { await Promise.all([mutate(), mutateSWR("risk-assessment")]); setDirty(false); setManuallyChanged(new Set()); setAttendanceMessage("Attendance saved successfully.") }
    setSavingAttendance(false)
  }

  if (!mounted || isLoading) return <section className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading your dashboard…</p></section>
  if (error) return <section className="mx-auto max-w-7xl p-6"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Unable to load dashboard</h1><p className="mt-2 text-sm text-muted-foreground">{error.message}</p></div></section>

  const today = todayInManila()
  const activeTerms = (data?.terms ?? []).filter((term) =>
    dateOnly(term.start_date) <= today && dateOnly(term.end_date) >= today,
  )
  const activeTerm = activeTerms.find((term) =>
    selectedClassRecord &&
    normalizeSchoolYear(term.school_year) === normalizeSchoolYear(selectedClassRecord.school_year),
  ) ?? activeTerms[0]
  const daysUntilTermEnd = activeTerm ? Math.max(0, Math.ceil((Date.parse(`${dateOnly(activeTerm.end_date)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)) : null
  const todayAttendance = data?.attendance.filter((item) => item.class_id === activeClassId && item.attendance_date === today) ?? []
  const attendanceRate = todayAttendance.filter((item) => item.status !== "excused").length ? Math.round(todayAttendance.filter((item) => item.status === "present" || item.status === "late").length / todayAttendance.filter((item) => item.status !== "excused").length * 100) : null
  const activeInterventionPlans = data?.interventionPlans.filter((plan) => plan.status === "active") ?? []
  const plansById = new Map((data?.interventionPlans ?? []).map((plan) => [plan.id, plan]))
  const calendarEvents = [...(data?.interventions ?? []).flatMap((item) => [{ id: `${item.id}-start`, date: item.start_date, title: `Intervention starts: ${item.concern}`, studentId: item.student_id, kind: "Intervention", planTitle: null, time: null }, { id: `${item.id}-review`, date: item.target_review_date, title: `Review: ${item.concern}`, studentId: item.student_id, kind: "Review", planTitle: null, time: null }]), ...(data?.assessments ?? []).map((item) => ({ id: item.id, date: item.assessment_date, title: item.title, studentId: null, kind: "Assessment", planTitle: null, time: null })), ...(data?.interventionSessions ?? []).map((session) => {
    const plan = plansById.get(session.plan_id)
    return { id: session.id, date: session.scheduled_date, title: `Session ${session.session_number}: ${session.activity}`, studentId: plan?.student_id ?? null, kind: "Intervention session", planTitle: plan?.title ?? null, time: session.start_time ? `${session.start_time.slice(0, 5)}${session.end_time ? `–${session.end_time.slice(0, 5)}` : ""}` : null }
  })].filter((event) => event.date && event.date >= today).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8)

  return <section className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
    {dirty && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" role="status">You have unsaved attendance changes. Save before leaving this page.</div>}
    <div><p className="text-sm font-medium text-primary">{formatDate(today)}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Good Day, {data?.profile?.full_name?.split(" ")[0] || "Teacher"}</h1><p className="mt-2 text-muted-foreground">Your daily workspace for pupil progress and timely support.</p></div>
    <div className="rounded-xl border bg-card p-5"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current academic term</p><h2 className="mt-1 text-xl font-semibold">{activeTerm ? `${periodLabelForSchoolYear(activeTerm.short_label, activeTerm.school_year)} · ${activeTerm.school_year}` : "Term dates not configured for the current date"}</h2><p className="mt-1 text-sm text-muted-foreground">{activeTerm ? `${formatDate(activeTerm.start_date)} – ${formatDate(activeTerm.end_date)}` : "Set term start and end dates in Settings → Terms."}</p></div>{activeTerm && <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm font-medium text-primary">{daysUntilTermEnd === 0 ? "Term ends today" : `${daysUntilTermEnd} day${daysUntilTermEnd === 1 ? "" : "s"} until term ends`}</p>}</div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Link href="/pupils" className="rounded-xl border border-primary/20 bg-primary/5 p-5 transition hover:border-primary"><Users className="text-primary" /><p className="mt-4 text-sm font-medium text-muted-foreground">Active Pupils</p><p className="mt-1 text-3xl font-bold text-foreground">{students.length}</p></Link>
      <Link href="/risk-assessment" className={`rounded-xl border p-5 transition hover:border-destructive ${highRiskStudentCount ? "border-destructive/30 bg-destructive/5" : "bg-card"}`}><AlertCircle className="text-destructive" /><p className="mt-4 text-sm font-medium text-muted-foreground">High risk students</p><p className="mt-1 text-3xl font-bold text-destructive">{highRiskStudentCount}</p></Link>
      <Link href="/interventions?status=active" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 transition hover:border-emerald-600"><HeartPulse className="text-emerald-700" /><p className="mt-4 text-sm font-medium text-muted-foreground">Active interventions</p><p className="mt-1 text-3xl font-bold text-emerald-800">{activeInterventionPlans.length}</p></Link>
      <Link href="/interventions" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 transition hover:border-amber-600"><Clock3 className="text-amber-700" /><p className="mt-4 text-sm font-medium text-muted-foreground">Intervention pending sessions</p><p className="mt-1 text-3xl font-bold text-amber-800">{data?.pendingSessions ?? 0}</p></Link>
      <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-5"><ClipboardCheck className="text-sky-700" /><p className="mt-4 text-sm font-medium text-muted-foreground">Today&apos;s Attendance</p><p className="mt-1 text-3xl font-bold text-sky-800">{attendanceRate === null ? "—" : `${attendanceRate}%`}</p></div>
    </div>
    <div>
      <div className="mb-3">
        <h2 className="font-semibold">Class trends</h2>
        <p className="text-sm text-muted-foreground">
          {selectedClassRecord ? `Recent attendance and assessment trends for ${gradeLevelLabel(selectedClassRecord.grade_level)} – ${selectedClassRecord.section_name}.` : "Select a class to view its attendance and assessment trends."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Weekly attendance rate"
          points={trendData.attendance}
          emptyMessage="No attendance records are available for this class in the recent weeks."
          caption="Present and late records ÷ non-excused attendance records"
        />
        <TrendChart
          title="Assessment performance"
          points={trendData.performance}
          emptyMessage="No scored assessments are available for this class yet."
          caption="Class average score (%) · hover over a point for the activity name and date"
        />
      </div>
    </div>
    <div className="rounded-xl border bg-card"><div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2"><ClipboardCheck className="text-primary" /><h2 className="font-semibold">Daily Attendance · {formatDate(attendanceDate)}</h2></div></div><div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-medium">Class<select aria-label="Attendance class" value={activeClassId} onChange={(event) => changeRegister(() => setSelectedClass(event.target.value))} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name}</option>)}</select></label><label className="grid gap-1 text-xs font-medium">Date<input aria-label="Attendance date" type="date" value={attendanceDate} onChange={(event) => changeRegister(() => setAttendanceDate(event.target.value))} className="rounded-lg border bg-background px-3 py-2 text-sm" /></label><PupilGenderFilter value={genderFilter} onChange={(value) => { setGenderFilter(value); setAttendancePage(1) }} /></div></div>
      {!classStudents.length ? <div className="p-10 text-center text-sm text-muted-foreground">Create a class and add active pupils to record attendance.</div> : <><div className="flex flex-wrap items-center gap-3 border-b px-5 py-3"><span className="font-medium">{selectedClassRecord ? `${gradeLevelLabel(selectedClassRecord.grade_level)} – ${selectedClassRecord.section_name}` : "Selected class"}</span><span className="text-sm text-muted-foreground">{visibleClassStudents.length} of {classStudents.length} pupils shown</span><div className="ml-auto grid grid-cols-4 gap-2 text-center text-xs"><span><b className="block text-primary">{statusCounts.present}</b>Present</span><span><b className="block text-amber-600">{statusCounts.late}</b>Late</span><span><b className="block text-destructive">{statusCounts.absent}</b>Absent</span><span><b className="block text-muted-foreground">{statusCounts.excused}</b>Excused</span></div></div><div className="flex flex-wrap gap-2 border-b px-5 py-3"><Button variant="outline" size="sm" onClick={() => markAll(false)} disabled={!visibleClassStudents.length}>Mark visible present</Button><Button variant="outline" size="sm" onClick={() => markAll(true)} disabled={!visibleClassStudents.length}>Mark remaining visible present</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Student number</th><th className="px-5 py-3">Pupil</th><th className="px-5 py-3">Gender</th><th className="px-5 py-3">Attendance status</th></tr></thead><tbody className="divide-y">{pageClassStudents.map((student) => <tr key={student.id}><td className="px-5 py-3 text-muted-foreground">{student.student_number}</td><td className="px-5 py-3 font-medium">{studentName(student)}</td><td className="px-5 py-3 capitalize text-muted-foreground">{student.gender ?? "Not set"}</td><td className="px-5 py-3"><select aria-label={`Attendance status for ${studentName(student)}`} value={attendanceState[student.id] ?? "present"} onChange={(event) => updateStatus(student.id, event.target.value as Attendance["status"])} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td></tr>)}</tbody></table></div><Pagination page={attendancePage} totalItems={visibleClassStudents.length} onPageChange={setAttendancePage} /><div className="flex flex-col gap-3 border-t p-5 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm text-muted-foreground">{classStudents.length} pupils included{dirty && <span className="ml-2 font-medium text-amber-600">• Unsaved changes</span>}{attendanceMessage && <span className="ml-2" role="status">• {attendanceMessage}</span>}</div><Button onClick={saveAttendance} disabled={!dirty || savingAttendance}>{savingAttendance ? <><Loader2 className="animate-spin" data-icon="inline-start" />Saving…</> : <><Save data-icon="inline-start" />Save Attendance</>}</Button></div></>}
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><div className="rounded-xl border bg-card"><div className="border-b p-5"><div className="flex items-center gap-2"><CalendarDays className="text-primary" /><h2 className="font-semibold">Upcoming responsibilities</h2></div></div>{calendarEvents.length ? <div className="divide-y">{calendarEvents.map((event) => <div key={event.id} className="flex items-start gap-3 p-4"><span className="mt-1 size-2 rounded-full bg-primary" /><div><p className="font-medium">{event.title}</p><p className="mt-1 text-sm text-muted-foreground">{formatDate(String(event.date))}{event.time ? ` · ${event.time}` : ""} · {event.kind}{event.planTitle ? ` · ${event.planTitle}` : ""}{event.studentId ? ` · ${studentName(students.find((student) => student.id === event.studentId))}` : ""}</p></div></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">No upcoming assessments or intervention dates.</div>}</div><div className="rounded-xl border bg-card"><div className="flex items-center gap-2 border-b p-5"><FileText className="text-primary" /><h2 className="font-semibold">Recent academic activity</h2></div>{data?.assessments.length ? <div className="divide-y">{data.assessments.slice(0, 5).map((assessment) => <Link key={assessment.id} href="/academic-records" className="block p-4 transition hover:bg-muted/40"><p className="font-medium">{assessment.title}</p><p className="mt-1 text-sm text-muted-foreground">{assessment.subject} · {formatDate(assessment.assessment_date)}</p></Link>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Assessment activity will appear once records are added.</div>}</div></div>
  </section>
}
