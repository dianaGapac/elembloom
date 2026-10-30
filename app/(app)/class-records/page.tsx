"use client"

import Link from "next/link"
import useSWR from "swr"
import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowDownToLine, ArrowLeft, ChevronDown, FileSpreadsheet, Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { calculateGrade } from "@/lib/grading-engine"
import { buildClassRecordCsv, downloadClassRecordWorkbook, downloadCsv, type ExportAssessment, type ExportRow } from "@/lib/class-records-export"

const supabase = createClient()
const categoryFor = (type: string) => ({ Quiz: "Written Work", Assignment: "Written Work", "Short Quiz": "Written Work", "Written Work": "Written Work", Project: "Performance Tasks", "Performance Task": "Performance Tasks", "Performance Tasks": "Performance Tasks", "Quarterly Examination": "Quarterly Assessment", "Quarterly Exam": "Quarterly Assessment", "Quarterly Assessment": "Quarterly Assessment" } as Record<string, string>)[type] ?? "Written Work"
const periodKey = (value: string) => value.startsWith("First") ? "Q1" : value.startsWith("Second") ? "Q2" : value.startsWith("Third") ? "Q3" : value.startsWith("Fourth") ? "Q4" : value

const fetcher = async () => {
  const [classes, subjects, periods, students, enrollments, assessments, scores, configs, settings] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year,subject_name").eq("is_active", true).order("grade_level").order("section_name"),
    supabase.from("class_subjects").select("id,class_id,subject_name").eq("is_active", true).order("subject_name"),
    supabase.from("grading_periods").select("short_label,display_name,quarter_number,school_year").order("quarter_number"),
    supabase.from("students").select("id,class_id,student_number,first_name,last_name").eq("is_active", true).order("last_name"),
    supabase.from("class_enrollments").select("class_id,student_id,status").eq("status", "active"),
    supabase.from("assessments").select("id,class_id,title,assessment_type,subject,school_year,grading_period,assessment_date,total_points").order("assessment_date"),
    supabase.from("assessment_scores").select("id,assessment_id,student_id,score"),
    supabase.from("class_grading_configurations").select("class_subject_id,school_year,grading_period,written_work_weight,performance_tasks_weight,quarterly_exam_weight,passing_grade,decimal_places,rounding_method").eq("is_active", true),
    supabase.from("grading_settings").select("passing_grade,decimal_places,rounding_method,grading_weights").is("grade_level", null).eq("subject_name", "").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  for (const result of [classes, subjects, periods, students, enrollments, assessments, scores, configs, settings]) if (result.error) throw new Error(result.error.message)
  return { classes: classes.data ?? [], subjects: subjects.data ?? [], periods: periods.data ?? [], students: students.data ?? [], enrollments: enrollments.data ?? [], assessments: assessments.data ?? [], scores: scores.data ?? [], configs: configs.data ?? [], settings: settings.data }
}

export default function ClassRecordsPage() {
  const { data, error, isLoading } = useSWR("class-records", fetcher)
  const searchParams = useSearchParams()
  const [classId, setClassId] = useState(searchParams.get("classId") ?? "")
  const [subjectId, setSubjectId] = useState(searchParams.get("subjectId") ?? "")
  const [period, setPeriod] = useState(searchParams.get("period") ?? "")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("name")
  const [statusFilter, setStatusFilter] = useState("all")
  const [exportOpen, setExportOpen] = useState(false)

  const classes = data?.classes ?? []
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0]
  const subjects = (data?.subjects ?? []).filter((item) => item.class_id === selectedClass?.id)
  const selectedSubject = subjects.find((item) => item.id === subjectId) ?? subjects[0]
  const periods = data?.periods?.filter((item) => !selectedClass?.school_year || item.school_year === selectedClass.school_year) ?? []
  const selectedPeriod = period || periods[0]?.short_label || "Q1"

  const record = useMemo(() => {
    if (!selectedClass || !selectedSubject) return null
    const fallback = data?.settings
    const config = data?.configs.find((item) => item.class_subject_id === selectedSubject.id && item.school_year === selectedClass.school_year && item.grading_period === periodKey(selectedPeriod))
    const policy = config ? { passingGrade: Number(config.passing_grade), decimalPlaces: Number(config.decimal_places), roundingMethod: config.rounding_method as "half_up" | "floor" | "ceil", weights: { "Written Work": Number(config.written_work_weight), "Performance Tasks": Number(config.performance_tasks_weight), "Quarterly Assessment": Number(config.quarterly_exam_weight) } } : { passingGrade: Number(fallback?.passing_grade ?? 75), decimalPlaces: Number(fallback?.decimal_places ?? 2), roundingMethod: (fallback?.rounding_method ?? "half_up") as "half_up" | "floor" | "ceil", weights: fallback?.grading_weights ?? { "Written Work": 30, "Performance Tasks": 50, "Quarterly Assessment": 20 } }
    const assessments = (data?.assessments ?? []).filter((item) => item.class_id === selectedClass.id && item.subject === selectedSubject.subject_name && periodKey(item.grading_period) === periodKey(selectedPeriod) && item.school_year === selectedClass.school_year)
    const scoreRows = data?.scores ?? []
    const pupils = (data?.students ?? []).filter((student) => student.class_id === selectedClass.id && (data?.enrollments ?? []).some((enrollment) => enrollment.class_id === selectedClass.id && enrollment.student_id === student.id))
    const exportAssessments: ExportAssessment[] = assessments.map((item) => ({ id: item.id, title: item.title, category: categoryFor(item.assessment_type), totalPoints: Number(item.total_points), assessmentDate: item.assessment_date }))
    const rows: ExportRow[] = pupils.map((student) => { const result = calculateGrade(student.id, assessments.map((item) => ({ id: item.id, assessmentType: item.assessment_type, gradingPeriod: item.grading_period, subject: item.subject, totalPoints: Number(item.total_points) })), scoreRows.map((score) => ({ assessmentId: score.assessment_id, studentId: score.student_id, score: score.score === null ? null : Number(score.score) })), policy, selectedSubject.subject_name, selectedPeriod); return { studentNumber: student.student_number, learnerName: `${student.last_name}, ${student.first_name}`, scores: Object.fromEntries(assessments.map((item) => [item.id, scoreRows.find((score) => score.assessment_id === item.id && score.student_id === student.id)?.score ?? null])), componentPercentages: Object.fromEntries(result.categories.map((category) => [category.name, category.average])), initialGrade: result.weightedPercentage, quarterlyGrade: result.transmutedGrade, status: result.remark } })
    return { policy, assessments: exportAssessments, rows }
  }, [data, selectedClass, selectedSubject, selectedPeriod])

  const visibleRows = record?.rows.filter((row) => row.learnerName.toLowerCase().includes(search.toLowerCase()) || row.studentNumber.toLowerCase().includes(search.toLowerCase())).filter((row) => statusFilter === "all" || (statusFilter === "missing" ? row.status === "Incomplete" : statusFilter === "complete" ? row.status !== "Incomplete" : row.status === "Needs support")).sort((a, b) => sort === "number" ? a.studentNumber.localeCompare(b.studentNumber) : a.learnerName.localeCompare(b.learnerName)) ?? []
  const filenameBase = selectedClass && selectedSubject ? `ElemBloom_Grade${selectedClass.grade_level}_${selectedClass.section_name}_${selectedSubject.subject_name}_${selectedPeriod}_${selectedClass.school_year}`.replaceAll(/[^a-zA-Z0-9_-]/g, "_") : "ElemBloom_Class_Record"
  const incompleteCount = record?.rows.filter((row) => row.status === "Incomplete").length ?? 0

  async function saveScore(assessmentId: string, studentNumber: string, value: string) { const student = data?.students.find((item) => item.student_number === studentNumber); const existing = data?.scores.find((score) => score.assessment_id === assessmentId && score.student_id === student?.id); if (!student || !existing) return; const numeric = value.trim() === "" ? null : Number(value); if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0)) return; await supabase.from("assessment_scores").update({ score: numeric }).eq("id", existing.id); }
  function exportCsv() { if (record) downloadCsv(`${filenameBase}.csv`, buildClassRecordCsv(record.rows, record.assessments)); setExportOpen(false) }
  function exportExcel() { if (record) downloadClassRecordWorkbook(`${filenameBase}.xlsx`, record.rows, record.assessments, selectedPeriod); setExportOpen(false) }
  if (isLoading) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading class records…</p></main>
  if (error) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load class records.</p></main>

  return <main className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
    <div className="flex items-center justify-between gap-4"><div><Link href="/classes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Classes</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight">Class Records</h1><p className="mt-2 text-sm text-muted-foreground">Spreadsheet-style records powered by your saved grading configuration.</p></div><div className="relative"><Button variant="outline" onClick={() => setExportOpen(!exportOpen)} disabled={!record}><ArrowDownToLine data-icon="inline-start" />Export <ChevronDown data-icon="inline-end" /></Button>{exportOpen && <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border bg-popover p-1 shadow-lg"><button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={exportCsv}>Export CSV</button><button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={exportExcel}><FileSpreadsheet className="size-4" />Export Excel workbook</button></div>}</div></div>
    <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4"><label className="text-xs font-medium text-muted-foreground">School Year<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedClass?.school_year ?? ""} onChange={(event) => { const next = classes.find((item) => item.school_year === event.target.value); setClassId(next?.id ?? ""); setSubjectId("") }}>{[...new Set(classes.map((item) => item.school_year))].map((year) => <option key={year}>{year}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Class / Section<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setSubjectId("") }}>{classes.map((item) => <option key={item.id} value={item.id}>Grade {item.grade_level} – {item.section_name}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Subject<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedSubject?.id ?? ""} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Grading Period<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedPeriod} onChange={(event) => setPeriod(event.target.value)}>{periods.length ? periods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>) : ["Q1","Q2","Q3","Q4"].map((item) => <option key={item}>{item}</option>)}</select></label></section>
    <section className="rounded-xl border bg-card p-5"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><p className="text-sm font-medium text-primary">Grade {selectedClass?.grade_level} – {selectedClass?.section_name}</p><h2 className="mt-1 text-2xl font-semibold">{selectedSubject?.subject_name ?? "Choose a subject"}</h2><p className="mt-1 text-sm text-muted-foreground">School Year {selectedClass?.school_year} · {selectedPeriod}</p></div><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1.5">{record?.rows.length ?? 0} pupils</span><span className="rounded-full bg-muted px-3 py-1.5">{record?.assessments.length ?? 0} assessments</span><span className={incompleteCount ? "rounded-full bg-destructive/10 px-3 py-1.5 text-destructive" : "rounded-full bg-muted px-3 py-1.5"}>{incompleteCount} incomplete</span></div></div></section>
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search pupils</span><input className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" placeholder="Search learner or student number" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Sort by learner</option><option value="number">Sort by student number</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="missing">Incomplete</option><option value="complete">Complete</option><option value="support">Needs support</option></select></section>
    <section className="overflow-hidden rounded-xl border bg-card"><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="sticky left-0 z-[1] bg-muted/50 px-4 py-3">Learner</th>{record?.assessments.map((assessment) => <th key={assessment.id} className="min-w-24 px-3 py-3"><span className="block truncate">{assessment.title}</span><span className="font-normal">/{assessment.totalPoints}</span></th>)}<th className="px-3 py-3">Initial Grade</th><th className="px-3 py-3">Quarterly Grade</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y">{visibleRows.map((row) => <tr key={row.studentNumber} className="hover:bg-muted/30"><td className="sticky left-0 bg-card px-4 py-3"><p className="font-medium">{row.learnerName}</p><p className="text-xs text-muted-foreground">{row.studentNumber}</p></td>{record?.assessments.map((assessment) => <td key={assessment.id} className="px-3 py-3 tabular-nums"><input aria-label={`${assessment.title} score for ${row.learnerName}`} className="w-20 rounded border bg-background px-2 py-1 text-sm" defaultValue={row.scores[assessment.id] ?? ""} onBlur={(event) => void saveScore(assessment.id, row.studentNumber, event.target.value)} /></td>)}<td className="px-3 py-3 font-medium">{row.initialGrade === null ? "—" : `${row.initialGrade.toFixed(2)}%`}</td><td className="px-3 py-3 font-medium">{row.quarterlyGrade === null ? "—" : row.quarterlyGrade.toFixed(2)}</td><td className={`px-3 py-3 ${row.status === "Passed" ? "text-primary" : row.status === "Incomplete" ? "text-muted-foreground" : "text-destructive"}`}>{row.status}</td></tr>)}</tbody></table></div>{!visibleRows.length && <p className="p-10 text-center text-sm text-muted-foreground">No pupils match the current filters.</p>}</section>
    <p className="text-xs text-muted-foreground">Exports are ElemBloom workbooks for transfer into school-required records. They are not official DepEd ECR templates.</p>
  </main>
}
