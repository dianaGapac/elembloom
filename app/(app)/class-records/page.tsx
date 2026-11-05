"use client"

import Link from "next/link"
import { Fragment, useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowDownToLine, ArrowLeft, ChevronDown, FileSpreadsheet, Medal, Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination"
import { matchesPupilGender, PupilGenderFilter, sortPupilsAlphabetically, type PupilGenderFilterValue } from "@/components/pupils/gender-filter"
import { calculateGrade, type GradingPolicy } from "@/lib/grading-engine"
import { buildClassRecordCsv, buildFinalGradesCsv, buildFinalProgressCsv, buildProgressRecordCsv, downloadClassRecordWorkbook, downloadCsv, downloadFinalGradesWorkbook, downloadFinalProgressWorkbook, downloadProgressRecordWorkbook, type ExportAssessment, type ExportRow, type FinalGradeExportRow, type FinalProgressExportRow, type ProgressExportRow } from "@/lib/class-records-export"
import { academicCategories as categories, categoryWeightsFor, earlyLearningPolicies, gradeLevelLabel, gradeOnePaceCompetenciesForSubject, gradingPeriodsForGrade, kinderCompetencyList, periodKeyForSchoolYear, type CategoryWeights } from "@/lib/academic-structure"

const supabase = createClient()
const fallbackCategory = (type: string) => (["Project", "Performance Task", "Performance Tasks", "Product/Performance Tasks", "Product / Performance Tasks"].includes(type) ? "Product/Performance Tasks" : ["Quarterly Exam", "Quarterly Examination", "Periodic Examination", "Quarterly Assessment", "Examinations"].includes(type) ? "Examinations" : "Written/Oral Works")

const fetcher = async () => {
  const [classes, subjects, periods, students, enrollments, assessments, scores, configs, settings, competencies, reports] = await Promise.all([
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
    supabase.from("early_learning_reports").select("id,class_id,student_id,school_year,grading_period,what_child_can_do,learning_to_improve,teacher_comments"),
  ])
  for (const result of [classes, subjects, periods, students, enrollments, assessments, scores, configs, settings, competencies, reports]) if (result.error) throw new Error(result.error.message)
  return { classes: classes.data ?? [], subjects: subjects.data ?? [], periods: periods.data ?? [], students: students.data ?? [], enrollments: enrollments.data ?? [], assessments: assessments.data ?? [], scores: scores.data ?? [], configs: configs.data ?? [], settings: settings.data, competencies: competencies.data ?? [], reports: reports.data ?? [] }
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
  const [mounted, setMounted] = useState(false)
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
  useEffect(() => setMounted(true), [])
  const classes = data?.classes ?? []
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0]
  const subjects = (data?.subjects ?? []).filter((item) => item.class_id === selectedClass?.id)
  const selectedSubject = subjects.find((item) => item.id === subjectId) ?? subjects[0]
  const storedPeriods = data?.periods?.filter((item) => !selectedClass?.school_year || item.school_year === selectedClass.school_year) ?? []
  const periods = gradingPeriodsForGrade(selectedClass?.grade_level, selectedClass?.school_year, storedPeriods)
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
  const paceCompetencies = selectedClass?.grade_level === 1
    ? gradeOnePaceCompetenciesForSubject(selectedSubject?.subject_name, selectedPeriod)
    : []
  const kinderCompetencies = selectedClass?.grade_level === 0
    ? kinderCompetencyList().map((item) => item.key)
    : []
  const competencyNames = [...new Set([
    ...paceCompetencies,
    ...kinderCompetencies,
    ...competencyRecords.map((item) => item.competency).filter((name) => !paceCompetencies.includes(name)),
  ])]
  const competencyPupils = isProgressClass
    ? sortPupilsAlphabetically((data?.students ?? []).filter((student) =>
        student.class_id === selectedClass?.id &&
        (data?.enrollments ?? []).some((enrollment) => enrollment.class_id === selectedClass?.id && enrollment.student_id === student.id),
      ))
    : []
  const termReports = (data?.reports ?? []).filter((report) =>
    report.class_id === selectedClass?.id &&
    report.school_year === selectedClass?.school_year &&
    report.grading_period === selectedPeriod,
  )

  const prepared = useMemo(() => {
    if (!selectedClass || selectedClass.grade_level <= 1 || !selectedSubject || !data) return null
    const configFor = (periodValue: string): GradingPolicy => { const config = data.configs.find((item) => item.class_subject_id === selectedSubject.id && item.school_year === selectedClass.school_year && periodKeyForSchoolYear(item.grading_period, selectedClass.school_year) === periodKeyForSchoolYear(periodValue, selectedClass.school_year)); return config ? { passingGrade: Number(config.passing_grade), decimalPlaces: Number(config.decimal_places), roundingMethod: config.rounding_method as GradingPolicy["roundingMethod"], useTransmutation: Number(selectedClass.school_year.match(/\d{4}/)?.[0]) >= 2026, weights: { "Written/Oral Works": Number(config.written_work_weight), "Product/Performance Tasks": Number(config.performance_tasks_weight), Examinations: Number(config.quarterly_exam_weight) } } : { passingGrade: 75, decimalPlaces: 2, roundingMethod: "half_up", useTransmutation: Number(selectedClass.school_year.match(/\d{4}/)?.[0]) >= 2026, weights: categoryWeightsFor(selectedClass.grade_level, selectedSubject.subject_name) } }
    const pupils = sortPupilsAlphabetically(data.students.filter((student) => student.class_id === selectedClass.id && data.enrollments.some((item) => item.class_id === selectedClass.id && item.student_id === student.id)))
    const buildRows = (periodValue: string): { rows: RecordRow[]; assessments: ExportAssessment[] } => { const normalizedPeriod = periodKeyForSchoolYear(periodValue, selectedClass.school_year); const assessments = data.assessments.filter((item) => item.class_id === selectedClass.id && item.subject === selectedSubject.subject_name && periodKeyForSchoolYear(item.grading_period, selectedClass.school_year) === normalizedPeriod && item.school_year === selectedClass.school_year); const exportAssessments = assessments.map((item) => ({ id: item.id, title: item.title, category: item.grading_category ? fallbackCategory(item.grading_category) : fallbackCategory(item.assessment_type), totalPoints: Number(item.total_points), assessmentDate: item.activity_date || item.assessment_date })); const rows = pupils.map((student) => { const result = calculateGrade(student.id, assessments.map((item) => ({ id: item.id, assessmentType: item.assessment_type, gradingCategory: item.grading_category, gradingPeriod: periodKeyForSchoolYear(item.grading_period, selectedClass.school_year) ?? item.grading_period, subject: item.subject, totalPoints: Number(item.total_points) })), data.scores.map((score) => ({ assessmentId: score.assessment_id, studentId: score.student_id, score: score.score === null ? null : Number(score.score) })), configFor(periodValue), selectedSubject.subject_name, normalizedPeriod ?? undefined); return { studentId: student.id, studentNumber: student.student_number, learnerName: `${student.last_name}, ${student.first_name}`, gender: student.gender, scores: Object.fromEntries(assessments.map((item) => [item.id, data.scores.find((score) => score.assessment_id === item.id && score.student_id === student.id)?.score ?? null])), componentPercentages: Object.fromEntries(result.categories.map((category) => [category.name, category.average])), initialGrade: result.weightedPercentage, termGrade: result.transmutedGrade, descriptor: result.descriptor, status: result.remark, categories: Object.fromEntries(result.categories.map((category) => [category.name, { rawRecorded: category.rawRecorded, rawTotal: category.rawTotal, average: category.average, contribution: category.contribution }])) } }); return { rows, assessments: exportAssessments } }
    const current = buildRows(selectedPeriod); const summary = pupils.map((student) => { const periodGrades = periods.map((item) => { const periodRows = buildRows(item.short_label).rows.find((row) => row.studentId === student.id); return { label: item.short_label, grade: periodRows?.termGrade ?? null, descriptor: periodRows?.descriptor ?? null, remarks: periodRows?.status ?? "Incomplete" } }); return { ...student, periodGrades } }); return { ...current, summary }
  }, [data, selectedClass, selectedSubject, selectedPeriod, periods])

  const topTenIds = new Set((prepared?.rows ?? []).filter((row) => row.termGrade !== null).sort((a, b) => (b.termGrade ?? 0) - (a.termGrade ?? 0) || a.learnerName.localeCompare(b.learnerName)).slice(0, 10).map((row) => row.studentId))
  const topTenRanks = new Map((prepared?.rows ?? []).filter((row) => row.termGrade !== null).sort((a, b) => (b.termGrade ?? 0) - (a.termGrade ?? 0) || a.learnerName.localeCompare(b.learnerName)).slice(0, 10).map((row, index) => [row.studentId, index + 1]))
  const visibleRows = prepared?.rows.filter((row) => matchesPupilGender(row.gender, genderFilter)).filter((row) => !topTenOnly || topTenIds.has(row.studentId)).filter((row) => row.learnerName.toLowerCase().includes(search.toLowerCase()) || row.studentNumber.toLowerCase().includes(search.toLowerCase())).filter((row) => statusFilter === "all" || (statusFilter === "missing" ? row.status === "Incomplete" : statusFilter === "complete" ? row.status !== "Incomplete" : row.status === "Needs support")).sort((a, b) => sort === "grade-desc" ? (b.termGrade ?? -1) - (a.termGrade ?? -1) || a.learnerName.localeCompare(b.learnerName) : sort === "grade-asc" ? (a.termGrade ?? Number.POSITIVE_INFINITY) - (b.termGrade ?? Number.POSITIVE_INFINITY) || a.learnerName.localeCompare(b.learnerName) : a.learnerName.localeCompare(b.learnerName)) ?? []
  const pageRows = visibleRows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  const filenameBase = selectedClass && selectedSubject ? `ElemBloom_Grade${selectedClass.grade_level}_${selectedClass.section_name}_${selectedSubject.subject_name}_${selectedPeriod}_${selectedClass.school_year}`.replaceAll(/[^a-zA-Z0-9_-]/g, "_") : "ElemBloom_Class_Record"
  const summaryPeriods = periods.filter((item) => !("legacy" in item && item.legacy))
  const finalGradeRows: FinalGradeExportRow[] = (prepared?.summary ?? []).map((row) => ({
    studentNumber: row.student_number,
    learnerName: `${row.last_name}, ${row.first_name}`,
    periodGrades: row.periodGrades.map(({ label, grade, descriptor, remarks }) => ({ label, grade, descriptor, remarks })),
  }))
  const progressExportRows: ProgressExportRow[] = competencyPupils.map((student) => {
    const report = termReports.find((item) => item.student_id === student.id)
    return {
      studentNumber: student.student_number,
      learnerName: `${student.last_name}, ${student.first_name}`,
      competencies: Object.fromEntries(competencyNames.map((name) => {
        const rating = competencyRecords.find((item) => item.student_id === student.id && item.competency === name)?.rating
        const descriptor = earlyLearningPolicies[selectedClass?.grade_level as 0 | 1]?.ratings.find((item) => item.value === rating)
        return [name, rating ? `${rating}${descriptor ? ` — ${descriptor.label}` : ""}` : ""]
      })),
      whatChildCanDo: report?.what_child_can_do ?? "",
      learningToImprove: report?.learning_to_improve ?? "",
      teacherComments: report?.teacher_comments ?? "",
    }
  })
  const finalProgressRows: FinalProgressExportRow[] = competencyPupils.map((student) => ({
    studentNumber: student.student_number,
    learnerName: `${student.last_name}, ${student.first_name}`,
    terms: summaryPeriods.map((term) => {
      const termCompetencies = selectedClass?.grade_level === 1
        ? gradeOnePaceCompetenciesForSubject(selectedSubject?.subject_name, term.short_label)
        : kinderCompetencies
      const records = (data?.competencies ?? []).filter((record) =>
        record.class_id === selectedClass?.id &&
        record.subject_offering_id === selectedSubject?.id &&
        record.student_id === student.id &&
        periodKeyForSchoolYear(record.grading_period, selectedClass?.school_year) === periodKeyForSchoolYear(term.short_label, selectedClass?.school_year),
      )
      const report = (data?.reports ?? []).find((item) =>
        item.class_id === selectedClass?.id &&
        item.student_id === student.id &&
        item.school_year === selectedClass?.school_year &&
        periodKeyForSchoolYear(item.grading_period, selectedClass?.school_year) === periodKeyForSchoolYear(term.short_label, selectedClass?.school_year),
      )
      const policy = earlyLearningPolicies[selectedClass?.grade_level as 0 | 1]
      return {
        label: term.display_name,
        competencies: Object.fromEntries(termCompetencies.flatMap((name) => {
          const rating = records.find((record) => record.competency === name)?.rating
          const descriptor = policy?.ratings.find((item) => item.value === rating)
          return rating ? [[name, `${rating}${descriptor ? ` — ${descriptor.label}` : ""}`]] : []
        })),
        whatChildCanDo: report?.what_child_can_do ?? "",
        learningToImprove: report?.learning_to_improve ?? "",
        teacherComments: report?.teacher_comments ?? "",
      }
    }),
  }))
  const progressSummaryRows = competencyPupils.map((student) => ({
    id: student.id,
    studentNumber: student.student_number,
    learnerName: `${student.last_name}, ${student.first_name}`,
    first_name: student.first_name,
    last_name: student.last_name,
    gender: student.gender,
    terms: finalProgressRows.find((row) => row.studentNumber === student.student_number)?.terms.map((term) => {
      const termCompetencies = selectedClass?.grade_level === 1
        ? gradeOnePaceCompetenciesForSubject(selectedSubject?.subject_name, summaryPeriods.find((item) => item.display_name === term.label)?.short_label)
        : kinderCompetencies
      const termKey = periodKeyForSchoolYear(summaryPeriods.find((item) => item.display_name === term.label)?.short_label, selectedClass?.school_year)
      const termRecords = (data?.competencies ?? []).filter((record) =>
        record.class_id === selectedClass?.id &&
        record.subject_offering_id === selectedSubject?.id &&
        record.student_id === student.id &&
        periodKeyForSchoolYear(record.grading_period, selectedClass?.school_year) === termKey,
      )
      const ratingCounts = Object.fromEntries((earlyLearningPolicies[selectedClass?.grade_level as 0 | 1]?.ratings ?? []).map((rating) => [
        rating.value,
        termRecords.filter((record) => record.rating === rating.value && termCompetencies.includes(record.competency)).length,
      ]))
      return {
        label: term.label,
        ratedCount: termCompetencies.filter((name) => termRecords.some((record) => record.competency === name)).length,
        totalCompetencies: termCompetencies.length,
        ratingCounts,
        narrativeEntered: Boolean(term.whatChildCanDo.trim() || term.learningToImprove.trim() || term.teacherComments.trim()),
      }
    }) ?? [],
  }))
  const summaryFilename = selectedClass && selectedSubject
    ? `ElemBloom_Grade${selectedClass.grade_level}_${selectedClass.section_name}_${selectedSubject.subject_name}_Final_Grades_${selectedClass.school_year}`.replaceAll(/[^a-zA-Z0-9_-]/g, "_")
    : "ElemBloom_Final_Grades"
  const progressFilename = selectedClass && selectedSubject
    ? `ElemBloom_Grade${selectedClass.grade_level}_${selectedClass.section_name}_${selectedSubject.subject_name}_${selectedPeriod}_${selectedClass.school_year}_Progress_Records`.replaceAll(/[^a-zA-Z0-9_-]/g, "_")
    : "ElemBloom_Progress_Records"
  function exportCsv() {
    if (isProgressClass && selectedClass && selectedSubject) {
      if (view === "summary") {
        downloadCsv(`${progressFilename.replace("_Progress_Records", "_Final_Progress_Summary")}.csv`, buildFinalProgressCsv(finalProgressRows))
      } else {
        downloadCsv(`${progressFilename}.csv`, buildProgressRecordCsv(progressExportRows, competencyNames))
      }
    } else if (prepared) {
      downloadCsv(
        `${view === "summary" ? summaryFilename : filenameBase}.csv`,
        view === "summary"
          ? buildFinalGradesCsv(finalGradeRows, summaryPeriods)
          : buildClassRecordCsv(prepared.rows, prepared.assessments),
      )
    }
    setExportOpen(false)
  }
  function exportExcel() {
    if (isProgressClass && selectedClass && selectedSubject) {
      if (view === "summary") {
        downloadFinalProgressWorkbook(`${progressFilename.replace("_Progress_Records", "_Final_Progress_Summary")}.xlsx`, finalProgressRows, {
          classLabel: `${gradeLevelLabel(selectedClass.grade_level)} – ${selectedClass.section_name}`,
          subject: selectedSubject.subject_name,
          schoolYear: selectedClass.school_year,
        })
      } else {
        downloadProgressRecordWorkbook(`${progressFilename}.xlsx`, progressExportRows, competencyNames, {
          classLabel: `${gradeLevelLabel(selectedClass.grade_level)} – ${selectedClass.section_name}`,
          subject: selectedSubject.subject_name,
          term: periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod,
          schoolYear: selectedClass.school_year,
        })
      }
    } else if (prepared && selectedClass && selectedSubject) {
      if (view === "summary") {
        downloadFinalGradesWorkbook(`${summaryFilename}.xlsx`, finalGradeRows, summaryPeriods, {
          classLabel: `${gradeLevelLabel(selectedClass.grade_level)} – ${selectedClass.section_name}`,
          subject: selectedSubject.subject_name,
          schoolYear: selectedClass.school_year,
        })
      } else {
        downloadClassRecordWorkbook(`${filenameBase}.xlsx`, prepared.rows, prepared.assessments, selectedPeriod, {
          classLabel: `${gradeLevelLabel(selectedClass.grade_level)} – ${selectedClass.section_name}`,
          subject: selectedSubject.subject_name,
          schoolYear: selectedClass.school_year,
          weights: savedWeights ?? fallbackWeights,
        })
      }
    }
    setExportOpen(false)
  }
  if (!mounted || isLoading) return <div className="mx-auto max-w-7xl p-6"><p suppressHydrationWarning className="text-sm text-muted-foreground">Loading class records…</p></div>
  if (error) return <div className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load class records.</p></div>
  const quarterAssessments = prepared?.assessments ?? []
  const displayWeights = savedWeights ?? fallbackWeights
  const byCategory = categories.map((category) => ({ category, items: quarterAssessments.filter((item) => item.category === category), weight: displayWeights[category] }))
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link href="/classes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Classes</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Class Records</h1>
          <p className="mt-2 text-sm text-muted-foreground">{isProgressClass ? "View term-based competency ratings for Kinder and Grade 1. Grade 1 uses its PACE A–E scale without numeric grades or transmutation." : "Assessment scores and grades calculated from raw points and saved class policies."}</p>
        </div>
        <div className="relative">
          <Button variant="outline" onClick={() => setExportOpen(!exportOpen)} disabled={isProgressClass ? !selectedClass || !selectedSubject || !data : !prepared}><ArrowDownToLine data-icon="inline-start" />Export <ChevronDown data-icon="inline-end" /></Button>
          {exportOpen && <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border bg-popover p-1 shadow-lg">
            <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={exportCsv}>{isProgressClass ? view === "summary" ? "Export final progress CSV" : "Export progress records CSV" : view === "summary" ? "Export final grades CSV" : "Export CSV"}</button>
            <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={exportExcel}><FileSpreadsheet className="size-4" />{isProgressClass ? view === "summary" ? "Export final progress Excel" : "Export progress records Excel" : view === "summary" ? "Export final grades Excel" : "Export Excel workbook"}</button>
          </div>}
        </div>
      </div>
      <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
        <label className="text-xs font-medium text-muted-foreground">School Year<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedClass?.school_year ?? ""} onChange={(event) => { const next = classes.find((item) => item.school_year === event.target.value); setClassId(next?.id ?? ""); setSubjectId("") }}>{[...new Set(classes.map((item) => item.school_year))].map((year) => <option key={year}>{year}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Class / Section<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setSubjectId(""); setPeriod("") }}>{classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Subject<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedSubject?.id ?? ""} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Grading Period<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedPeriod} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label>
      </section>
      {/* {selectedClass && selectedSubject && !isProgressClass && <GradingWeightsPanel key={`${selectedClass.id}:${selectedSubject.id}:${selectedClass.school_year}:${periodKeyForSchoolYear(selectedPeriod, selectedClass.school_year)}`} classId={selectedClass.id} gradeLevel={selectedClass.grade_level} schoolYear={selectedClass.school_year} gradingPeriod={selectedPeriod} savedWeights={savedWeights} fallbackWeights={fallbackWeights} />} */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-2">
        <button type="button" onClick={() => setView("period")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "period" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod}</button>
        {selectedClass && <button type="button" onClick={() => setView("summary")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "summary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{isProgressClass ? "Final Progress Summary" : "Final Grades by Term"}</button>}
      </div>
      <section className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium text-primary">{gradeLevelLabel(selectedClass?.grade_level)} – {selectedClass?.section_name}</p>
        <h2 className="mt-1 text-2xl font-semibold">{selectedSubject?.subject_name ?? "Choose a subject"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{selectedClass?.school_year} · {view === "summary" ? "Term Summary" : periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod}</p>
      </section>
      {isProgressClass ? view === "summary" ? <ProgressSummaryTable
        rows={progressSummaryRows}
        periods={summaryPeriods}
        ratings={earlyLearningPolicies[selectedClass.grade_level as 0 | 1].ratings.map((rating) => ({ value: rating.value, label: rating.label }))}
        search={search}
        genderFilter={genderFilter}
        onGenderChange={setGenderFilter}
      /> : <CompetencyRecordTable key={`${selectedClass.id}:${selectedSubject?.id ?? ""}:${selectedPeriod}`} pupils={competencyPupils} competencyNames={competencyNames} records={competencyRecords} reports={termReports} classId={selectedClass.id} subjectId={selectedSubject?.id ?? ""} period={selectedPeriod} gradeLevel={selectedClass.grade_level} subjectName={selectedSubject?.subject_name ?? ""} termName={periods.find((item) => item.short_label === selectedPeriod)?.display_name ?? selectedPeriod} /> : view === "period" ? <section className="overflow-hidden rounded-xl border bg-card">
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
      </section> : <SummaryTable summary={prepared?.summary ?? []} periods={summaryPeriods} search={search} genderFilter={genderFilter} onGenderChange={setGenderFilter} />}
    </div>
  )
}

function SummaryTable({ summary, periods, search, genderFilter, onGenderChange }: { summary: Array<{ student_number: string; first_name: string; last_name: string; gender: string | null; periodGrades: Array<{ label: string; grade: number | null; descriptor: string | null; remarks: string }> }>; periods: Array<{ short_label: string; display_name: string }>; search: string; genderFilter: PupilGenderFilterValue; onGenderChange: (value: PupilGenderFilterValue) => void }) {
  const [page, setPage] = useState(1)
  const rows = sortPupilsAlphabetically(summary.filter((row) => matchesPupilGender(row.gender, genderFilter) && `${row.first_name} ${row.last_name} ${row.student_number}`.toLowerCase().includes(search.toLowerCase())))
  const pageRows = rows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="flex justify-end border-b p-4"><PupilGenderFilter value={genderFilter} onChange={onGenderChange} /></div>
    <div className="max-h-[70vh] overflow-auto">
      <table className="min-w-[1100px] w-full text-left text-sm">
        <thead className="sticky top-0 bg-primary text-xs text-primary-foreground">
          <tr><th rowSpan={2} className="px-4 py-3">Learner</th>{periods.map((period) => <th key={period.short_label} colSpan={3} className="px-4 py-3 text-center">{period.display_name}</th>)}<th rowSpan={2} className="px-4 py-3">Year Average</th></tr>
          <tr>{periods.map((period) => <Fragment key={period.short_label}><th className="px-4 py-2">Final Grade</th><th className="px-4 py-2">Descriptor</th><th className="px-4 py-2">Remarks</th></Fragment>)}</tr>
        </thead>
        <tbody className="divide-y">{pageRows.map((row) => { const grades = periods.map((period) => row.periodGrades.find((item) => item.label === period.short_label)?.grade ?? null).filter((grade): grade is number => grade !== null); const average = grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null; return <tr key={row.student_number}><td className="px-4 py-4"><p className="font-medium">{row.last_name}, {row.first_name}</p><p className="text-xs text-muted-foreground">{row.student_number}</p></td>{periods.map((period) => { const result = row.periodGrades.find((item) => item.label === period.short_label); return <Fragment key={period.short_label}><td className="px-4 py-4 tabular-nums">{result?.grade == null ? "—" : result.grade.toFixed(2)}</td><td className="px-4 py-4">{result?.descriptor ?? "—"}</td><td className="px-4 py-4">{result?.remarks ?? "Incomplete"}</td></Fragment>})}<td className="px-4 py-4 font-medium">{average === null ? "Incomplete" : average.toFixed(2)}</td></tr>})}</tbody>
      </table>
    </div>
    <Pagination page={page} totalItems={rows.length} onPageChange={setPage} />
  </section>
}

function ProgressSummaryTable({
  rows,
  periods,
  ratings,
  search,
  genderFilter,
  onGenderChange,
}: {
  rows: Array<{
    id: string
    studentNumber: string
    learnerName: string
    first_name: string
    last_name: string
    gender: string | null
    terms: Array<{
      label: string
      ratedCount: number
      totalCompetencies: number
      ratingCounts: Record<string, number>
      narrativeEntered: boolean
    }>
  }>
  periods: Array<{ short_label: string; display_name: string }>
  ratings: Array<{ value: string; label: string }>
  search: string
  genderFilter: PupilGenderFilterValue
  onGenderChange: (value: PupilGenderFilterValue) => void
}) {
  const [page, setPage] = useState(1)
  const visibleRows = sortPupilsAlphabetically(rows.filter((row) =>
    matchesPupilGender(row.gender, genderFilter) &&
    `${row.learnerName} ${row.studentNumber}`.toLowerCase().includes(search.toLowerCase()),
  ))
  const pageRows = visibleRows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold">Final progress summary</h3>
        <p className="text-sm text-muted-foreground">Term-by-term competency ratings and narrative completion. Kinder and Grade 1 use descriptive ratings, not numeric final grades.</p>
        <p className="mt-1 text-xs text-muted-foreground">{ratings.map((rating) => `${rating.value}: ${rating.label}`).join(" · ")}</p>
      </div>
      <PupilGenderFilter value={genderFilter} onChange={onGenderChange} />
    </div>
    <div className="max-h-[70vh] overflow-auto">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="sticky top-0 bg-primary text-xs text-primary-foreground">
          <tr>
            <th className="sticky left-0 bg-primary px-4 py-3 text-primary-foreground">Learner</th>
            {periods.map((period) => <th key={period.short_label} className="px-4 py-3">{period.display_name} progress</th>)}
          </tr>
        </thead>
        <tbody className="divide-y">
          {pageRows.map((row) => <tr key={row.id}>
            <td className="sticky left-0 bg-card px-4 py-3">
              <p className="font-medium">{row.learnerName}</p>
              <p className="text-xs text-muted-foreground">{row.studentNumber}</p>
            </td>
            {periods.map((period) => {
              const term = row.terms.find((item) => item.label === period.display_name)
              return <td key={period.short_label} className="px-4 py-3">
                <p className="tabular-nums">{term?.ratedCount ?? 0} / {term?.totalCompetencies ?? 0} competencies rated</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ratings.map((rating) => `${rating.value} ${term?.ratingCounts[rating.value] ?? 0}`).join(" · ")}
                </p>
                <p className={`mt-1 text-xs ${term?.narrativeEntered ? "text-primary" : "text-muted-foreground"}`}>
                  {term?.narrativeEntered ? "Narrative entered" : "No narrative"}
                </p>
              </td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    {!pageRows.length && <p className="p-8 text-center text-sm text-muted-foreground">No pupils match the selected filters.</p>}
    <Pagination page={page} totalItems={visibleRows.length} onPageChange={setPage} />
  </section>
}

function CompetencyRecordTable({ pupils, competencyNames, records, reports, classId, subjectId, period, gradeLevel, subjectName, termName }: {
  pupils: Array<{ id: string; student_number: string; first_name: string; last_name: string }>
  competencyNames: string[]
  records: Array<{ student_id: string; competency: string; rating: string }>
  reports: Array<{ student_id: string; what_child_can_do: string; learning_to_improve: string; teacher_comments: string }>
  classId: string
  subjectId: string
  period: string
  gradeLevel: number
  subjectName: string
  termName: string
}) {
  const [page, setPage] = useState(1)
  const pagePupils = pupils.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  if (gradeLevel <= 1) {
    const isGradeOne = gradeLevel === 1
    return <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold">{isGradeOne ? "Grade 1 pupils" : "Kinder pupils"} · {subjectName}</h3>
          <p className="text-sm text-muted-foreground">{termName} · Open a pupil to enter or update {isGradeOne ? "PACE ratings" : "competency ratings"} and their term narrative. Numeric grades do not apply.</p>
        </div>
        <Link href="/competency-records" className="text-sm font-medium text-primary hover:underline">Manage competencies</Link>
      </div>
      {pupils.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-primary text-xs text-primary-foreground"><tr><th className="px-4 py-3">Pupil</th><th className="px-4 py-3">Student number</th><th className="px-4 py-3">{isGradeOne ? "PACE progress" : "Competency progress"}</th><th className="px-4 py-3">Term narrative</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y">{pagePupils.map((pupil) => {
            const ratedCount = competencyNames.filter((name) => records.some((record) => record.student_id === pupil.id && record.competency === name)).length
            const report = reports.find((item) => item.student_id === pupil.id)
            const hasNarrative = Boolean(report?.what_child_can_do.trim() || report?.learning_to_improve.trim())
            const editHref = `/competency-records?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}&studentId=${encodeURIComponent(pupil.id)}&period=${encodeURIComponent(period)}`
            return <tr key={pupil.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{pupil.last_name}, {pupil.first_name}</td>
              <td className="px-4 py-3 text-muted-foreground">{pupil.student_number}</td>
              <td className="px-4 py-3">{ratedCount} / {competencyNames.length} {isGradeOne ? "PACE ratings" : "competencies rated"}</td>
              <td className="px-4 py-3">{hasNarrative ? <span className="text-primary">Entered</span> : <span className="text-muted-foreground">Not entered</span>}</td>
              <td className="px-4 py-3 text-right"><Link href={editHref} className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">View / Edit</Link></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <p className="p-8 text-center text-sm text-muted-foreground">There are no enrolled pupils in this class.</p>}
      <Pagination page={page} totalItems={pupils.length} onPageChange={setPage} />
    </section>
  }
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
      <div>
        <h3 className="font-semibold">{earlyLearningPolicies[gradeLevel as 0 | 1].name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{earlyLearningPolicies[gradeLevel as 0 | 1].description}</p>
      </div>
      <Link href="/competency-records" className="text-sm font-medium text-primary hover:underline">Manage competencies</Link>
    </div>
    {competencyNames.length ? <><div className="touch-pan-x overscroll-x-contain max-h-[70vh] overflow-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead className="bg-primary text-xs text-primary-foreground"><tr><th className="sticky left-0 bg-primary px-4 py-3 text-primary-foreground">Pupil</th>{competencyNames.map((name) => <th key={name} className="px-4 py-3">{name}</th>)}</tr></thead>
      <tbody className="divide-y">{pagePupils.map((student) => <tr key={student.id}>
        <td className="sticky left-0 bg-card px-4 py-3"><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-xs text-muted-foreground">{student.student_number}</p></td>
        {competencyNames.map((name) => {
          const rating = records.find((record) => record.student_id === student.id && record.competency === name)?.rating
          const descriptor = earlyLearningPolicies[gradeLevel as 0 | 1].ratings.find((item) => item.value === rating)
          return <td key={name} className="px-4 py-3 text-center font-medium" title={descriptor?.description}>{rating ? `${rating} — ${descriptor?.label ?? "Unknown rating"}` : "—"}</td>
        })}
      </tr>)}</tbody>
    </table></div><Pagination page={page} totalItems={pupils.length} onPageChange={setPage} /></> : <p className="p-8 text-center text-sm text-muted-foreground">No competency ratings are recorded for this learning area and term.</p>}
  </section>
}
