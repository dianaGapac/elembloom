"use client"

import Link from "next/link"
import { Fragment, useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowDownToLine, ArrowLeft, ChevronDown, FileSpreadsheet, Medal, Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination"
import { matchesPupilGender, PupilGenderFilter, sortPupilsAlphabetically, type PupilGenderFilterValue } from "@/components/pupils/gender-filter"
import { calculateGrade, type GradingPolicy } from "@/lib/grading-engine"
import { buildClassRecordCsv, downloadClassRecordWorkbook, downloadCsv, type ExportAssessment, type ExportRow } from "@/lib/class-records-export"
import { academicCategories as categories, categoryWeightsFor, gradeLevelLabel, normalizeCategoryWeights, periodKeyForSchoolYear, periodOptionsForSchoolYear, periodsForSchoolYear, type CategoryWeights } from "@/lib/academic-structure"

const supabase = createClient()
const fallbackCategory = (type: string) => (["Project", "Performance Task", "Performance Tasks", "Product/Performance Tasks", "Product / Performance Tasks"].includes(type) ? "Product/Performance Tasks" : ["Quarterly Exam", "Quarterly Examination", "Periodic Examination", "Quarterly Assessment", "Examinations"].includes(type) ? "Examinations" : "Written/Oral Works")

const fetcher = async () => {
  const [classes, subjects, periods, students, enrollments, assessments, scores, configs, settings, competencies] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year,subject_name").eq("is_active", true).order("grade_level").order("section_name"),
    supabase.from("class_subjects").select("id,class_id,subject_name").eq("is_active", true).order("subject_name"),
    supabase.from("grading_periods").select("short_label,display_name,quarter_number,school_year").order("quarter_number"),
    supabase.from("students").select("id,class_id,student_number,first_name,last_name,gender").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("class_enrollments").select("class_id,student_id,status").eq("status", "active"),
    supabase.from("assessments").select("id,activity_id,class_id,title,assessment_type,grading_category,subject,school_year,grading_period,assessment_date,activity_date,total_points").order("assessment_date"),
    supabase.from("assessment_scores").select("id,assessment_id,student_id,score"),
    supabase.from("class_grading_configurations").select("class_subject_id,school_year,grading_period,written_work_weight,performance_tasks_weight,quarterly_exam_weight,passing_grade,decimal_places,rounding_method").eq("is_active", true),
    supabase.from("grading_settings").select("passing_grade,decimal_places,rounding_method,grading_weights").is("grade_level", null).eq("subject_name", "").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("competency_records").select("id,class_id,student_id,subject_offering_id,grading_period,competency,rating"),
  ])
  for (const result of [classes, subjects, periods, students, enrollments, assessments, scores, configs, settings, competencies]) if (result.error) throw new Error(result.error.message)
  return { classes: classes.data ?? [], subjects: subjects.data ?? [], periods: periods.data ?? [], students: students.data ?? [], enrollments: enrollments.data ?? [], assessments: assessments.data ?? [], scores: scores.data ?? [], configs: configs.data ?? [], settings: settings.data, competencies: competencies.data ?? [] }
}

type RecordRow = ExportRow & { studentId: string; gender: string | null }

function GradingWeightsPanel({
  classId,
  gradeLevel,
  schoolYear,
  gradingPeriod,
  savedWeights,
  fallbackWeights,
}: {
  classId: string
  gradeLevel: number
  schoolYear: string
  gradingPeriod: string
  savedWeights: CategoryWeights | null
  fallbackWeights: CategoryWeights
}) {
  const weights = savedWeights ?? fallbackWeights
  return 

  <> 
  
  // <section className="rounded-xl border bg-card p-4" aria-labelledby="grading-weights-title">
  //   <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
  //     <div>
  //       <h2 id="grading-weights-title" className="font-semibold">Grading weights · {gradingPeriod}</h2>
  //       <p className="mt-1 text-sm text-muted-foreground">{savedWeights ? "From this subject’s saved My Classes grading settings." : "No custom policy is saved for this subject and term; showing default weights."}</p>
  //     </div>
  //     <p className="text-sm font-semibold text-primary">Total: {Object.values(weights).reduce((sum, weight) => sum + weight, 0)}%</p>
  //   </div>
  //   <div className="mt-4 grid gap-3 sm:grid-cols-3">
  //     {categories.map((category) => <div key={category} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-medium text-muted-foreground">{category}</p><p className="mt-1 text-lg font-semibold">{weights[category]}%</p></div>)}
  //   </div>
  //   <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  //     <p className="text-xs text-muted-foreground">{gradeLevelLabel(gradeLevel)} · {schoolYear} · selected subject · {gradingPeriod}</p>
  //     <Link href={`/classes/${classId}`} className="text-sm font-medium text-primary hover:underline">Manage in My Classes</Link>
  //   </div>
  // </section>

  </>
}

export default function ClassRecordsPage() {
  const { data, error, isLoading } = useSWR("class-records", fetcher)
  const [classId, setClassId] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [period, setPeriod] = useState("")
  const [view, setView] = useState<"period" | "summary">("period")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"name-asc" | "grade-asc" | "grade-desc">("name-asc")
  const [topTenOnly, setTopTenOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("all")
  const [genderFilter, setGenderFilter] = useState<PupilGenderFilterValue>("all")
  const [exportOpen, setExportOpen] = useState(false)
  const classes = data?.classes ?? []
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0]
  const subjects = (data?.subjects ?? []).filter((item) => item.class_id === selectedClass?.id)
  const selectedSubject = subjects.find((item) => item.id === subjectId) ?? subjects[0]
  const storedPeriods = data?.periods?.filter((item) => !selectedClass?.school_year || item.school_year === selectedClass.school_year) ?? []
  const periods = periodOptionsForSchoolYear(selectedClass?.school_year, storedPeriods)
  const selectedPeriod = period || periods[0]?.short_label || "T1"
  const activeGradingConfiguration = data?.configs.find((item) =>
    item.class_subject_id === selectedSubject?.id &&
    item.school_year === selectedClass?.school_year &&
    periodKeyForSchoolYear(item.grading_period, selectedClass?.school_year) === periodKeyForSchoolYear(selectedPeriod, selectedClass?.school_year),
  )
  const templateWeights = selectedClass && selectedSubject ? categoryWeightsFor(selectedClass.grade_level, selectedSubject.subject_name) : { "Written/Oral Works": 20, "Product/Performance Tasks": 50, Examinations: 30 }
  const fallbackWeights = templateWeights
  const savedWeights: CategoryWeights | null = activeGradingConfiguration ? {
    "Written/Oral Works": Number(activeGradingConfiguration.written_work_weight),
    "Product/Performance Tasks": Number(activeGradingConfiguration.performance_tasks_weight),
    Examinations: Number(activeGradingConfiguration.quarterly_exam_weight),
  } : null
  const isProgressClass = selectedClass !== undefined && selectedClass.grade_level <= 1
  const competencyRecords = (data?.competencies ?? []).filter((item) =>
    item.class_id === selectedClass?.id &&
    item.subject_offering_id === selectedSubject?.id &&
    periodKeyForSchoolYear(item.grading_period, selectedClass?.school_year) === periodKeyForSchoolYear(selectedPeriod, selectedClass?.school_year),
  )
  const competencyNames = [...new Set(competencyRecords.map((item) => item.competency))].sort((a, b) => a.localeCompare(b))
  const competencyPupils = sortPupilsAlphabetically((data?.students ?? []).filter((student) =>
    student.class_id === selectedClass?.id &&
    (data?.enrollments ?? []).some((enrollment) => enrollment.class_id === selectedClass?.id && enrollment.student_id === student.id),
  ))

  const prepared = useMemo(() => {
    if (!selectedClass || selectedClass.grade_level <= 1 || !selectedSubject || !data) return null
    const configFor = (periodValue: string): GradingPolicy => { const config = data.configs.find((item) => item.class_subject_id === selectedSubject.id && item.school_year === selectedClass.school_year && periodKeyForSchoolYear(item.grading_period, selectedClass.school_year) === periodKeyForSchoolYear(periodValue, selectedClass.school_year)); return config ? { passingGrade: Number(config.passing_grade), decimalPlaces: Number(config.decimal_places), roundingMethod: config.rounding_method as GradingPolicy["roundingMethod"], useTransmutation: Number(selectedClass.school_year.match(/\d{4}/)?.[0]) >= 2026, weights: { "Written/Oral Works": Number(config.written_work_weight), "Product/Performance Tasks": Number(config.performance_tasks_weight), Examinations: Number(config.quarterly_exam_weight) } } : { passingGrade: 75, decimalPlaces: 2, roundingMethod: "half_up", useTransmutation: Number(selectedClass.school_year.match(/\d{4}/)?.[0]) >= 2026, weights: categoryWeightsFor(selectedClass.grade_level, selectedSubject.subject_name) } }
    const pupils = sortPupilsAlphabetically(data.students.filter((student) => student.class_id === selectedClass.id && data.enrollments.some((item) => item.class_id === selectedClass.id && item.student_id === student.id)))
    const buildRows = (periodValue: string): { rows: RecordRow[]; assessments: ExportAssessment[] } => { const normalizedPeriod = periodKeyForSchoolYear(periodValue, selectedClass.school_year); const assessments = data.assessments.filter((item) => item.class_id === selectedClass.id && item.subject === selectedSubject.subject_name && periodKeyForSchoolYear(item.grading_period, selectedClass.school_year) === normalizedPeriod && item.school_year === selectedClass.school_year); const exportAssessments = assessments.map((item) => ({ id: item.id, title: item.title, category: item.grading_category ? fallbackCategory(item.grading_category) : fallbackCategory(item.assessment_type), totalPoints: Number(item.total_points), assessmentDate: item.activity_date || item.assessment_date })); const rows = pupils.map((student) => { const result = calculateGrade(student.id, assessments.map((item) => ({ id: item.id, assessmentType: item.assessment_type, gradingCategory: item.grading_category, gradingPeriod: periodKeyForSchoolYear(item.grading_period, selectedClass.school_year) ?? item.grading_period, subject: item.subject, totalPoints: Number(item.total_points) })), data.scores.map((score) => ({ assessmentId: score.assessment_id, studentId: score.student_id, score: score.score === null ? null : Number(score.score) })), configFor(periodValue), selectedSubject.subject_name, normalizedPeriod ?? undefined); return { studentId: student.id, studentNumber: student.student_number, learnerName: `${student.last_name}, ${student.first_name}`, gender: student.gender, scores: Object.fromEntries(assessments.map((item) => [item.id, data.scores.find((score) => score.assessment_id === item.id && score.student_id === student.id)?.score ?? null])), componentPercentages: Object.fromEntries(result.categories.map((category) => [category.name, category.average])), initialGrade: result.weightedPercentage, termGrade: result.transmutedGrade, descriptor: result.descriptor, status: result.remark, categories: Object.fromEntries(result.categories.map((category) => [category.name, { rawRecorded: category.rawRecorded, rawTotal: category.rawTotal, average: category.average, contribution: category.contribution }])) } }); return { rows, assessments: exportAssessments } }
    const current = buildRows(selectedPeriod); const summary = pupils.map((student) => { const periodGrades = periodsForSchoolYear(selectedClass.school_year).map((item) => { const periodRows = buildRows(item.key).rows.find((row) => row.studentId === student.id); return { label: item.key, grade: periodRows?.termGrade ?? null, status: periodRows?.status ?? "Incomplete" } }); return { ...student, periodGrades } }); return { ...current, summary }
  }, [data, selectedClass, selectedSubject, selectedPeriod, periods])

  const topTenIds = new Set((prepared?.rows ?? []).filter((row) => row.termGrade !== null).sort((a, b) => (b.termGrade ?? 0) - (a.termGrade ?? 0) || a.learnerName.localeCompare(b.learnerName)).slice(0, 10).map((row) => row.studentId))
  const topTenRanks = new Map((prepared?.rows ?? []).filter((row) => row.termGrade !== null).sort((a, b) => (b.termGrade ?? 0) - (a.termGrade ?? 0) || a.learnerName.localeCompare(b.learnerName)).slice(0, 10).map((row, index) => [row.studentId, index + 1]))
  const visibleRows = prepared?.rows.filter((row) => matchesPupilGender(row.gender, genderFilter)).filter((row) => !topTenOnly || topTenIds.has(row.studentId)).filter((row) => row.learnerName.toLowerCase().includes(search.toLowerCase()) || row.studentNumber.toLowerCase().includes(search.toLowerCase())).filter((row) => statusFilter === "all" || (statusFilter === "missing" ? row.status === "Incomplete" : statusFilter === "complete" ? row.status !== "Incomplete" : row.status === "Needs support")).sort((a, b) => sort === "grade-desc" ? (b.termGrade ?? -1) - (a.termGrade ?? -1) || a.learnerName.localeCompare(b.learnerName) : sort === "grade-asc" ? (a.termGrade ?? Number.POSITIVE_INFINITY) - (b.termGrade ?? Number.POSITIVE_INFINITY) || a.learnerName.localeCompare(b.learnerName) : a.learnerName.localeCompare(b.learnerName)) ?? []
  const pageRows = visibleRows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  const filenameBase = selectedClass && selectedSubject ? `ElemBloom_Grade${selectedClass.grade_level}_${selectedClass.section_name}_${selectedSubject.subject_name}_${selectedPeriod}_${selectedClass.school_year}`.replaceAll(/[^a-zA-Z0-9_-]/g, "_") : "ElemBloom_Class_Record"
  function exportCsv() { if (prepared) downloadCsv(`${filenameBase}.csv`, buildClassRecordCsv(prepared.rows, prepared.assessments)); setExportOpen(false) }
  function exportExcel() { if (prepared && selectedClass && selectedSubject) downloadClassRecordWorkbook(`${filenameBase}.xlsx`, prepared.rows, prepared.assessments, selectedPeriod, { classLabel: `${gradeLevelLabel(selectedClass.grade_level)} – ${selectedClass.section_name}`, subject: selectedSubject.subject_name, schoolYear: selectedClass.school_year, weights: savedWeights ?? fallbackWeights }); setExportOpen(false) }
  if (isLoading) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading class records…</p></main>
  if (error) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load class records.</p></main>
  const quarterAssessments = prepared?.assessments ?? []
  const displayWeights = savedWeights ?? fallbackWeights
  const byCategory = categories.map((category) => ({ category, items: quarterAssessments.filter((item) => item.category === category), weight: displayWeights[category] }))
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link href="/classes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Classes</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Class Records</h1>
          <p className="mt-2 text-sm text-muted-foreground">Assessment scores and grades calculated from raw points and saved class policies.</p>
        </div>
        {!isProgressClass && <div className="relative">
          <Button variant="outline" onClick={() => setExportOpen(!exportOpen)} disabled={!prepared}><ArrowDownToLine data-icon="inline-start" />Export <ChevronDown data-icon="inline-end" /></Button>
          {exportOpen && <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border bg-popover p-1 shadow-lg">
            <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={exportCsv}>Export CSV</button>
            <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={exportExcel}><FileSpreadsheet className="size-4" />Export Excel workbook</button>
          </div>}
        </div>}
      </div>
      <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
        <label className="text-xs font-medium text-muted-foreground">School Year<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedClass?.school_year ?? ""} onChange={(event) => { const next = classes.find((item) => item.school_year === event.target.value); setClassId(next?.id ?? ""); setSubjectId("") }}>{[...new Set(classes.map((item) => item.school_year))].map((year) => <option key={year}>{year}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Class / Section<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setSubjectId(""); setPeriod("") }}>{classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Subject<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedSubject?.id ?? ""} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Grading Period<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedPeriod} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label>
      </section>
      {/* {selectedClass && selectedSubject && !isProgressClass && <GradingWeightsPanel key={`${selectedClass.id}:${selectedSubject.id}:${selectedClass.school_year}:${periodKeyForSchoolYear(selectedPeriod, selectedClass.school_year)}`} classId={selectedClass.id} gradeLevel={selectedClass.grade_level} schoolYear={selectedClass.school_year} gradingPeriod={selectedPeriod} savedWeights={savedWeights} fallbackWeights={fallbackWeights} />} */}
      {/* <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-2">
        <button type="button" onClick={() => setView("period")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "period" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod}</button>
        {(periods.length ? periods : [{ short_label: "Q1", display_name: "Quarter 1" }, { short_label: "Q2", display_name: "Quarter 2" }, { short_label: "Q3", display_name: "Quarter 3" }, { short_label: "Q4", display_name: "Quarter 4" }]).filter((item) => item.short_label !== selectedPeriod).map((item) => <button type="button" key={item.short_label} onClick={() => { setPeriod(item.short_label); setView("period") }} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">{item.display_name}</button>)}
        {selectedClass?.grade_level > 1 && <button type="button" onClick={() => setView("summary")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "summary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Term Summary</button>}
      </div> */}
      <section className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium text-primary">{gradeLevelLabel(selectedClass?.grade_level)} – {selectedClass?.section_name}</p>
        <h2 className="mt-1 text-2xl font-semibold">{selectedSubject?.subject_name ?? "Choose a subject"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{selectedClass?.school_year} · {view === "summary" ? "Term Summary" : periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod}</p>
      </section>
      {isProgressClass ? <CompetencyRecordTable pupils={competencyPupils} competencyNames={competencyNames} records={competencyRecords} classId={selectedClass?.id ?? ""} /> : view === "period" ? <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-semibold">{periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod} class record</h3>
            <p className="mt-1 text-sm text-muted-foreground">Display only. Sort and Top 10 use calculated term grades for this class, subject, and period; incomplete grades are excluded. Scroll horizontally to view all activity columns; learner names stay visible. <Link href="/academic-activities" className="font-medium text-primary hover:underline">Edit scores in Academic Activities</Link>.</p>
          </div>
          {!isProgressClass && <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">Sort by term grade
              <select aria-label="Sort class record grades" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="name-asc">Pupil name (A–Z)</option>
                <option value="grade-desc">Grade: highest to lowest</option>
                <option value="grade-asc">Grade: lowest to highest</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <input type="checkbox" checked={topTenOnly} onChange={(event) => setTopTenOnly(event.target.checked)} />
              Top 10 only
            </label>
            <PupilGenderFilter value={genderFilter} onChange={setGenderFilter} />
          </div>}
        </div>
        <details open className="group">
          <summary className="cursor-pointer border-b bg-muted/20 px-4 py-3 text-sm font-medium">Class record grid <span className="ml-1 text-xs font-normal text-muted-foreground">Click to collapse or expand</span></summary>
        <div className="touch-pan-x overscroll-x-contain max-h-[70vh] overflow-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: `${Math.max(1400, quarterAssessments.length * 140 + 620)}px` }}>
            <caption className="sr-only">Read-only class record scores and category totals. PS is percentage score and WS is weighted score.</caption>
            <thead className="sticky top-0 z-[3] bg-primary text-xs text-primary-foreground">
              <tr>
                <th rowSpan={3} className="sticky left-0 z-[2] bg-primary px-4 py-3 text-primary-foreground">Learner</th>
                {byCategory.map(({ category, items, weight }) => <th key={category} colSpan={items.length + 3} className="border-l px-3 py-2 text-center">{category} ({weight}%)</th>)}
                <th rowSpan={3} className="border-l px-3 py-3">Initial Grade</th>
                <th rowSpan={3} className="px-3 py-3">Term Grade</th>
                <th rowSpan={3} className="px-3 py-3">Descriptor</th>
                <th rowSpan={3} className="px-3 py-3">Status</th>
              </tr>
              <tr>
                {byCategory.map(({ category, items }) => <Fragment key={category}>
                  {items.map((assessment) => <th key={assessment.id} className="border-l px-3 py-2 font-normal"><span className="block max-w-28 truncate">{assessment.title}</span></th>)}
                  <th className="border-l px-3 py-2 font-normal">Total</th>
                  <th className="border-l px-3 py-2 font-normal">PS</th>
                  <th className="border-l px-3 py-2 font-normal">WS</th>
                </Fragment>)}
              </tr>
              <tr>
                {byCategory.map(({ category, items, weight }) => <Fragment key={category}>
                  {items.map((assessment) => <th key={assessment.id} className="border-l px-3 py-2 font-normal">Max: {assessment.totalPoints}</th>)}
                  <th className="border-l px-3 py-2 font-normal">Max: {items.reduce((sum, item) => sum + item.totalPoints, 0)}</th>
                  <th className="border-l px-3 py-2 font-normal">100%</th>
                  <th className="border-l px-3 py-2 font-normal">{weight}%</th>
                </Fragment>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.map((row) => <tr key={row.studentId} className="hover:bg-muted/30">
                <td className="sticky left-0 bg-card px-4 py-3"><div className="flex items-center gap-2"><p className="font-medium">{row.learnerName}</p>{topTenRanks.has(row.studentId) && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-800 dark:text-amber-300"><Medal className="size-3.5" />#{topTenRanks.get(row.studentId)}</span>}</div><p className="text-xs text-muted-foreground">{row.studentNumber}</p></td>
                {byCategory.map(({ category, items }) => {
                  const result = row.categories[category]
                  return <Fragment key={category}>
                    {items.map((assessment) => <td key={assessment.id} className="border-l px-3 py-3 text-center tabular-nums">{row.scores[assessment.id] ?? "—"}</td>)}
                    <td className="border-l px-3 py-3 tabular-nums">{result?.rawTotal ? `${result.rawRecorded}/${result.rawTotal}` : "—"}</td>
                    <td className="border-l px-3 py-3 tabular-nums">{result?.average === null || result?.average === undefined ? "—" : `${result.average.toFixed(2)}%`}</td>
                    <td className="border-l px-3 py-3 tabular-nums">{result?.contribution === null || result?.contribution === undefined ? "—" : `${result.contribution.toFixed(2)}%`}</td>
                  </Fragment>
                })}
                <td className="border-l px-3 py-3 font-medium">{row.initialGrade === null ? "—" : `${row.initialGrade.toFixed(2)}%`}</td>
                <td className="px-3 py-3 font-medium">{row.termGrade === null ? "—" : row.termGrade}</td>
                <td className="px-3 py-3">{row.descriptor ?? "—"}</td>
                <td className={`px-3 py-3 ${row.status === "Passed" ? "text-primary" : row.status === "Incomplete" ? "text-muted-foreground" : "text-destructive"}`}>{row.status}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        </details>
        <Pagination page={page} totalItems={visibleRows.length} onPageChange={setPage} />
        {!visibleRows.length && <p className="p-10 text-center text-sm text-muted-foreground">No pupils match the current filters.</p>}
      </section> : <SummaryTable summary={prepared?.summary ?? []} periods={periods.filter((item) => !("legacy" in item && item.legacy))} search={search} genderFilter={genderFilter} onGenderChange={setGenderFilter} />}
    </main>
  )
}

function SummaryTable({ summary, periods, search, genderFilter, onGenderChange }: { summary: Array<{ student_number: string; first_name: string; last_name: string; gender: string | null; periodGrades: Array<{ label: string; grade: number | null; status: string }> }>; periods: Array<{ short_label: string; display_name: string }>; search: string; genderFilter: PupilGenderFilterValue; onGenderChange: (value: PupilGenderFilterValue) => void }) {
  const [page, setPage] = useState(1)
  const rows = sortPupilsAlphabetically(summary.filter((row) => matchesPupilGender(row.gender, genderFilter) && `${row.first_name} ${row.last_name} ${row.student_number}`.toLowerCase().includes(search.toLowerCase())))
  const pageRows = rows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="flex justify-end border-b p-4"><PupilGenderFilter value={genderFilter} onChange={onGenderChange} /></div>
    <div className="max-h-[70vh] overflow-auto">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="sticky top-0 bg-primary text-xs text-primary-foreground"><tr><th className="px-4 py-3">Learner</th>{periods.map((period) => <th key={period.short_label} className="px-4 py-3">{period.display_name}</th>)}<th className="px-4 py-3">Year status</th></tr></thead>
        <tbody className="divide-y">{pageRows.map((row) => { const grades = row.periodGrades.map((item) => item.grade).filter((grade): grade is number => grade !== null); const average = grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null; return <tr key={row.student_number}><td className="px-4 py-4"><p className="font-medium">{row.last_name}, {row.first_name}</p><p className="text-xs text-muted-foreground">{row.student_number}</p></td>{row.periodGrades.map((item) => <td key={item.label} className="px-4 py-4 tabular-nums">{item.grade === null ? "—" : item.grade.toFixed(2)}</td>)}<td className="px-4 py-4 font-medium">{average === null ? "Incomplete" : average.toFixed(2)}</td></tr>})}</tbody>
      </table>
    </div>
    <Pagination page={page} totalItems={rows.length} onPageChange={setPage} />
  </section>
}

function CompetencyRecordTable({ pupils, competencyNames, records, classId }: {
  pupils: Array<{ id: string; student_number: string; first_name: string; last_name: string }>
  competencyNames: string[]
  records: Array<{ student_id: string; competency: string; rating: string }>
  classId: string
}) {
  const [page, setPage] = useState(1)
  const pagePupils = pupils.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
      <div>
        <h3 className="font-semibold">Competency progress record</h3>
        <p className="mt-1 text-sm text-muted-foreground">Categorical progress only; no numeric grade or transmutation is applied.</p>
      </div>
      <Link href="/competency-records" className="text-sm font-medium text-primary hover:underline">Manage competencies</Link>
    </div>
    {competencyNames.length ? <><div className="touch-pan-x overscroll-x-contain max-h-[70vh] overflow-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead className="bg-primary text-xs text-primary-foreground"><tr><th className="sticky left-0 bg-primary px-4 py-3 text-primary-foreground">Pupil</th>{competencyNames.map((name) => <th key={name} className="px-4 py-3">{name}</th>)}</tr></thead>
      <tbody className="divide-y">{pagePupils.map((student) => <tr key={student.id}>
        <td className="sticky left-0 bg-card px-4 py-3"><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-xs text-muted-foreground">{student.student_number}</p></td>
        {competencyNames.map((name) => <td key={name} className="px-4 py-3 text-center font-medium">{records.find((record) => record.student_id === student.id && record.competency === name)?.rating ?? "—"}</td>)}
      </tr>)}</tbody>
    </table></div><Pagination page={page} totalItems={pupils.length} onPageChange={setPage} /></> : <p className="p-8 text-center text-sm text-muted-foreground">No competency ratings are recorded for this learning area and term.</p>}
  </section>
}
