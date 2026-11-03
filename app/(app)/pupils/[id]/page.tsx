"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, FileText, Mail, Pencil, ShieldAlert, XCircle } from "lucide-react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { calculateGrade, type GradingPolicy } from "@/lib/grading-engine"
import { categoryWeightsFor, descriptorForGrade, gradeLevelLabel, isTrimesterSchoolYear, mapehCompositeTermGrade, mapehFinalGrade, normalizeCategoryWeights, periodKeyForSchoolYear, periodLabelForSchoolYear, periodOptionsForSchoolYear } from "@/lib/academic-structure"
import jsPDF from "jspdf"
import { Button } from "@/components/ui/button"

type Student = { id: string; class_id: string; student_number: string; first_name: string; last_name: string; gender: "male" | "female" | null; parent_guardian_name: string | null; parent_guardian_email: string | null; is_active: boolean }
type Assessment = { id: string; class_id: string; school_year: string; activity_id: string | null; subject_offering_id: string | null; grading_category: string | null; title: string; assessment_type: string; subject: string; grading_period: string; assessment_date: string; total_points: number; assessment_scores: { student_id: string; score: number | null }[] }
type Attendance = { id: string; attendance_date: string; status: "present" | "late" | "absent" | "excused" }
type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string }
type GradingSettings = { passing_grade: number; decimal_places: number; rounding_method: string; grading_weights: Record<string, number>; grade_conversion_rules: { bands?: { label: string; min: number; max: number }[] } }
type ClassGradingConfiguration = { class_subject_id: string; school_year: string; grading_period: string; written_work_weight: number; performance_tasks_weight: number; quarterly_exam_weight: number; passing_grade: number; decimal_places: number; rounding_method: string }
type CompetencyRecord = { id: string; subject_offering_id: string; grading_period: string; competency: string; rating: string; notes: string | null }

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(`${value}T00:00:00+08:00`))
const statusLabel = (status: Attendance["status"]) => status.charAt(0).toUpperCase() + status.slice(1)
function throwQueryError(source: string, error: { message: string; code?: string } | null) {
  if (!error) return
  throw new Error(`${source}: ${error.message}${error.code ? ` (${error.code})` : ""}`)
}
async function fetchDetails(id: string) {
  const supabase = createClient()
  const { data: student, error: studentError } = await supabase.from("students").select("id, class_id, student_number, first_name, last_name, gender, parent_guardian_name, parent_guardian_email, is_active").eq("id", id).single()
  throwQueryError("Pupil record", studentError)
  if (!student) throw new Error("Pupil record: no matching pupil was found.")
  const [assessmentResult, classResult, attendanceResult, offeringsResult, competencyResult] = await Promise.all([
    supabase.from("assessments").select("id,class_id,school_year,activity_id,subject_offering_id,grading_category,title,assessment_type,subject,grading_period,assessment_date,total_points,assessment_scores(student_id,score)").eq("class_id", student.class_id).order("assessment_date", { ascending: false }),
    supabase.from("classes").select("id, grade_level, section_name, school_year").eq("id", student.class_id).single(),
    supabase.from("attendance").select("id, attendance_date, status").eq("student_id", id).eq("class_id", student.class_id).order("attendance_date", { ascending: false }),
    supabase.from("class_subjects").select("id,subject_name").eq("class_id", student.class_id).eq("is_active", true),
    supabase.from("competency_records").select("id,subject_offering_id,grading_period,competency,rating,notes").eq("student_id", id),
  ])
  throwQueryError("Academic activities and scores", assessmentResult.error)
  throwQueryError("Class record", classResult.error)
  throwQueryError("Attendance history", attendanceResult.error)
  throwQueryError("Subject offerings", offeringsResult.error)
  throwQueryError("Competency records", competencyResult.error)
  if (!classResult.data) throw new Error("Class record: no class was found for this pupil.")
  const offerings = offeringsResult.data ?? []
  const [{ data: settings, error: settingsError }, configResult] = await Promise.all([
    supabase.from("grading_settings").select("passing_grade,decimal_places,rounding_method,grading_weights,grade_conversion_rules").eq("school_year", classResult.data.school_year).eq("subject_name", "").is("grade_level", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    offerings.length ? supabase.from("class_grading_configurations").select("class_subject_id,school_year,grading_period,written_work_weight,performance_tasks_weight,quarterly_exam_weight,passing_grade,decimal_places,rounding_method").in("class_subject_id", offerings.map((item) => item.id)).eq("school_year", classResult.data.school_year).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
  ])
  throwQueryError("Grading settings", settingsError)
  throwQueryError("Class grading configuration", configResult.error)
  return { student: student as Student, assessments: (assessmentResult.data ?? []) as Assessment[], classRecord: classResult.data as ClassRecord, attendance: (attendanceResult.data ?? []) as Attendance[], settings: (settings ?? null) as GradingSettings | null, offerings, configurations: (configResult.data ?? []) as ClassGradingConfiguration[], competencies: (competencyResult.data ?? []) as CompetencyRecord[] }
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
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [showReport, setShowReport] = useState(false)
  const [reportSubject, setReportSubject] = useState("")
  const [reportPeriod, setReportPeriod] = useState("Full Year")
  const [sendingReport, setSendingReport] = useState(false)
  const [reportSendMessage, setReportSendMessage] = useState("")
  const [reportSendError, setReportSendError] = useState("")

  const attendance = data?.attendance ?? []
  const attendanceYears = [...new Set(attendance.map((item) => item.attendance_date.slice(0, 4)))].sort().reverse()
  const filteredAttendance = attendance.filter((item) => (attendanceYear === "all" || item.attendance_date.startsWith(attendanceYear)) && (!fromDate || item.attendance_date >= fromDate) && (!toDate || item.attendance_date <= toDate))
  const attendanceSummary = useMemo(() => filteredAttendance.reduce((summary, item) => ({ ...summary, [item.status]: summary[item.status] + 1 }), { present: 0, late: 0, absent: 0, excused: 0 }), [filteredAttendance])
  const eligibleDays = attendanceSummary.present + attendanceSummary.late + attendanceSummary.absent
  const attendanceRate = eligibleDays ? Math.round((attendanceSummary.present + attendanceSummary.late) / eligibleDays * 100) : null

  if (isLoading) return <section className="p-8 text-sm text-muted-foreground">Loading pupil profile…</section>
  if (error || !data) return <section className="mx-auto max-w-3xl p-6 lg:p-8"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold text-destructive">Unable to load this pupil profile</h1><p className="mt-2 text-sm text-muted-foreground" role="alert">{error instanceof Error ? error.message : "The pupil profile could not be loaded. Please try again."}</p><Button render={<Link href="/pupils" />} variant="outline" className="mt-4"><ArrowLeft data-icon="inline-start" />Back to pupils</Button></div></section>

  const { student, classRecord } = data
  const isCompetencyClass = classRecord.grade_level <= 1
  const assessments = data.assessments.filter((item) => {
    const itemPeriod = periodKeyForSchoolYear(item.grading_period, classRecord.school_year)
    return !(isTrimesterSchoolYear(classRecord.school_year) && itemPeriod === "Q4")
      && (period === "all" || itemPeriod === period)
      && (subject === "all" || item.subject === subject)
  })
  const scoreForStudent = (item: Assessment) => item.assessment_scores.find((score) => score.student_id === student.id)?.score
  const scored = assessments.flatMap((item) => scoreForStudent(item) == null ? [] : [{ score: Number(scoreForStudent(item)), total: Number(item.total_points), subject: item.subject }])
  const average = !isCompetencyClass && scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score / item.total, 0) / scored.length * 100) : null
  const subjectNames = [...new Set([...data.offerings.map((item) => item.subject_name), ...data.assessments.map((item) => item.subject)])]
  const subjects = classRecord.grade_level >= 2 && subjectNames.includes("Music and Arts") && subjectNames.includes("Physical Education and Health")
    ? [...subjectNames, "MAPEH"]
    : subjectNames
  const availablePeriods = periodOptionsForSchoolYear(classRecord.school_year, data.assessments.map((item) => ({ short_label: item.grading_period, display_name: item.grading_period })))
  const subjectAverages = isCompetencyClass ? [] : subjects.map((name) => { const values = scored.filter((item) => item.subject === name); return { name, value: values.length ? Math.round(values.reduce((sum, item) => sum + item.score / item.total, 0) / values.length * 100) : 0 } }).filter((item) => item.value > 0)
  const reportPeriods = periodOptionsForSchoolYear(classRecord.school_year, data.assessments
    .filter((item) => item.school_year === classRecord.school_year)
    .map((item) => ({ short_label: item.grading_period, display_name: item.grading_period })))
  const reportRows = reportPeriods.map(({ short_label, display_name }) => {
    const reportKey = periodKeyForSchoolYear(short_label, classRecord.school_year)
    const subjectNames = reportSubject === "MAPEH" ? ["Music and Arts", "Physical Education and Health"] : [reportSubject]
    const componentResults = subjectNames.map((subjectName) => {
      const periodAssessments = data.assessments.filter((item) => item.subject === subjectName && periodKeyForSchoolYear(item.grading_period, classRecord.school_year) === reportKey && item.school_year === classRecord.school_year)
      const offeringId = data.offerings.find((item) => item.subject_name === subjectName)?.id
      const config = data.configurations.find((item) => item.class_subject_id === offeringId && item.school_year === classRecord.school_year && periodKeyForSchoolYear(item.grading_period, classRecord.school_year) === reportKey)
      const fallbackWeights = categoryWeightsFor(classRecord.grade_level, subjectName)
      const policy: GradingPolicy = config ? {
        passingGrade: Number(config.passing_grade),
        decimalPlaces: Number(config.decimal_places),
        roundingMethod: config.rounding_method as GradingPolicy["roundingMethod"],
        weights: { "Written/Oral Works": Number(config.written_work_weight), "Product/Performance Tasks": Number(config.performance_tasks_weight), Examinations: Number(config.quarterly_exam_weight) },
        useTransmutation: isTrimesterSchoolYear(classRecord.school_year),
      } : {
        passingGrade: Number(data.settings?.passing_grade ?? 75),
        decimalPlaces: Number(data.settings?.decimal_places ?? 2),
        roundingMethod: (data.settings?.rounding_method ?? "half_up") as GradingPolicy["roundingMethod"],
        weights: isTrimesterSchoolYear(classRecord.school_year) || isCompetencyClass ? fallbackWeights : normalizeCategoryWeights(data.settings?.grading_weights ?? null, fallbackWeights),
        useTransmutation: isTrimesterSchoolYear(classRecord.school_year),
      }
      const result = isCompetencyClass ? null : calculateGrade(student.id, periodAssessments.map((item) => ({
        id: item.id,
        assessmentType: item.assessment_type,
        gradingCategory: item.grading_category,
        gradingPeriod: item.grading_period,
        subject: item.subject,
        totalPoints: Number(item.total_points),
      })), periodAssessments.flatMap((item) => item.assessment_scores.filter((score) => score.student_id === student.id).map((score) => ({
        assessmentId: item.id,
        studentId: score.student_id,
        score: score.score === null ? null : Number(score.score),
      }))), policy, subjectName, reportKey ?? undefined)
      const missingCategories = result?.categories.filter((category) => category.weight > 0 && category.total === 0).map((category) => category.name) ?? []
      const weightsTotal = Object.values(policy.weights).reduce((sum, weight) => sum + Number(weight), 0)
      const configurationAvailable = weightsTotal === 100 && (Boolean(config) || Boolean(data.settings) || isTrimesterSchoolYear(classRecord.school_year))
      const status = isCompetencyClass ? "Progress-based; numeric grade not applicable" : !configurationAvailable ? "Missing grading configuration" : result?.status === "incomplete" ? "Incomplete scores" : missingCategories.length ? `Missing ${missingCategories.join(", ")}` : result?.remark === "Unverified" ? "Grade unverified" : result?.remark ?? "Incomplete"
      const recorded = periodAssessments.filter((item) => scoreForStudent(item) !== null && scoreForStudent(item) !== undefined).length
      return { subjectName, result, status, configurationAvailable, passingGrade: policy.passingGrade, recorded }
    })
    const result = componentResults.length === 1 ? componentResults[0].result : null
    const componentGrades = componentResults.map((item) => ({ subject: item.subjectName, grade: item.result?.transmutedGrade ?? null }))
    const final = reportSubject === "MAPEH"
      ? mapehCompositeTermGrade(componentGrades[0]?.grade ?? null, componentGrades[1]?.grade ?? null)
      : result?.transmutedGrade ?? null
    const configurationAvailable = isCompetencyClass || componentResults.every((item) => item.configurationAvailable)
    const status = isCompetencyClass
      ? "Progress-based; numeric grade not applicable"
      : reportSubject === "MAPEH"
        ? final === null ? componentResults.find((item) => item.status !== "Passed" && item.status !== "Needs support")?.status ?? "MAPEH component grades incomplete or unverified" : final >= 75 ? "Passed" : "Needs support"
        : componentResults[0]?.status ?? "Incomplete"
    return {
      quarter: display_name,
      key: short_label,
      initial: reportSubject === "MAPEH" ? null : result?.weightedPercentage ?? null,
      final,
      descriptor: descriptorForGrade(final)?.label ?? null,
      componentGrades,
      count: componentResults.reduce((sum, item) => sum + item.recorded, 0),
      status,
      configurationAvailable,
      passingGrade: Math.round(componentResults.reduce((sum, item) => sum + item.passingGrade, 0) / Math.max(1, componentResults.length)),
      categories: (result?.categories ?? []).map((category) => ({
        name: category.name,
        weight: category.weight,
        average: category.average,
        contribution: category.contribution,
        rawRecorded: category.rawRecorded,
        rawTotal: category.rawTotal,
      })),
    }
  })
  const selectedReportRows = reportRows.filter((row) => reportPeriod === "Full Year" ? !(isTrimesterSchoolYear(classRecord.school_year) && row.key === "Q4") : row.quarter === reportPeriod)
  const reportHasSettings = selectedReportRows.length > 0 && selectedReportRows.every((row) => row.configurationAvailable)
  const reportProgressRows = data.competencies.filter((record) => {
    const recordSubject = data.offerings.find((item) => item.id === record.subject_offering_id)?.subject_name
    const recordPeriod = periodKeyForSchoolYear(record.grading_period, classRecord.school_year)
    return recordSubject === reportSubject && (reportPeriod === "Full Year" ? !(isTrimesterSchoolYear(classRecord.school_year) && recordPeriod === "Q4") : recordPeriod === periodKeyForSchoolYear(reportPeriods.find((item) => item.display_name === reportPeriod)?.short_label, classRecord.school_year))
  })
  const reportHasConvertedGrades = selectedReportRows.length > 0 && selectedReportRows.every((row) => row.final !== null)
  const mapehFinal = reportSubject === "MAPEH" ? mapehFinalGrade(reportPeriods.filter((item) => item.short_label !== "Q4").map((item) => reportRows.find((row) => row.key === item.short_label)?.final ?? null)) : null
  const passingGradeLabels = [...new Set(selectedReportRows.map((row) => `${row.passingGrade}%`))]
  async function buildReportPdf() {
    const logoResponse = await fetch("/logo.png")
    if (!logoResponse.ok) throw new Error("The ElemBloom logo could not be loaded for the report card.")
    const logoBlob = await logoResponse.blob()
    const logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error("The ElemBloom logo could not be read for the report card."))
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The ElemBloom logo could not be converted for the report card."))
      reader.readAsDataURL(logoBlob)
    })
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15
    const tableWidth = pageWidth - margin * 2
    const generatedDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date())
    const reportTitle = "PUPIL ACADEMIC REPORT CARD"

    pdf.setFillColor(46, 139, 87)
    pdf.rect(0, 0, pageWidth, 31, "F")
    pdf.setFillColor(255, 255, 255)
    pdf.roundedRect(margin, 3, 37, 25, 2, 2, "F")
    pdf.addImage(logoDataUrl, "PNG", margin + 1, 4, 35, 23)
    pdf.setTextColor(255, 255, 255)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(10)
    pdf.text(reportTitle, margin + 42, 17)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.text(`Generated ${generatedDate}`, pageWidth - margin, 20, { align: "right" })

    pdf.setTextColor(30, 41, 59)
    pdf.setFillColor(245, 248, 251)
    pdf.roundedRect(margin, 37, tableWidth, 27, 2, 2, "F")
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(13)
    pdf.text(`${student.last_name}, ${student.first_name}`, margin + 5, 45)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.text(`Student no. ${student.student_number}  |  Gender: ${student.gender ?? "Not recorded"}`, margin + 5, 52)
    pdf.text(`${gradeLevelLabel(classRecord.grade_level)} – ${classRecord.section_name}  |  School year ${classRecord.school_year}`, margin + 5, 59)
    pdf.text(`Subject: ${reportSubject || "Not selected"}  |  Report period: ${reportPeriod}`, pageWidth - margin - 5, 45, { align: "right" })
    pdf.setTextColor(71, 85, 105)
    pdf.text(isCompetencyClass ? "Categorical competency progress is shown. Numeric grades do not apply." : "Grades use assessment scores and saved grading policies.", pageWidth - margin - 5, 53, { align: "right" })

    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(11)
    pdf.setTextColor(30, 41, 59)
    pdf.text(isCompetencyClass ? "Competency progress results" : "Term academic results", margin, 73)

    let y = 78
    if (isCompetencyClass) {
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(10)
      pdf.text("Term · Competency / progress area · Rating · Notes", margin, y)
      y += 7
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(9)
      if (reportProgressRows.length) {
        reportProgressRows.forEach((record) => {
          const periodName = reportPeriods.find((item) => periodKeyForSchoolYear(item.short_label, classRecord.school_year) === periodKeyForSchoolYear(record.grading_period, classRecord.school_year))?.display_name ?? periodLabelForSchoolYear(record.grading_period, classRecord.school_year)
          const line = `${periodName} · ${record.competency}: ${record.rating}${record.notes ? ` · ${record.notes}` : ""}`
          const lines = pdf.splitTextToSize(line, tableWidth)
          const lineHeight = lines.length * 5
          if (y + lineHeight > pageHeight - 40) {
            pdf.addPage()
            y = 20
          }
          pdf.text(lines, margin, y)
          y += lineHeight + 1
        })
      } else {
        pdf.text("No competency progress ratings recorded for this subject and scope.", margin, y)
        y += 5
      }
    } else {
      const widths = [30, 43, 43, 48, 34, 36, tableWidth - 234]
      const headers = ["Term", "Written/Oral Works\nPS / WS", "Product/Performance Tasks\nPS / WS", "Examinations\nPS / WS", "Initial Grade", "Term Grade", "Recorded / Status"]
      let x = margin
      const headerHeight = 14
      pdf.setFillColor(232, 245, 236)
      pdf.rect(margin, y, tableWidth, headerHeight, "F")
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(8)
      pdf.setTextColor(30, 41, 59)
      headers.forEach((header, index) => {
        pdf.text(header.split("\n"), x + 2, y + (header.includes("\n") ? 5 : 8))
        x += widths[index]
      })
      y += headerHeight

      selectedReportRows.forEach((row, rowIndex) => {
        const rowHeight = 17
        if (y + rowHeight > pageHeight - 40) {
          pdf.addPage()
          y = 20
        }
        pdf.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 250, rowIndex % 2 === 0 ? 255 : 252)
        pdf.rect(margin, y, tableWidth, rowHeight, "F")
        pdf.setDrawColor(218, 226, 233)
        pdf.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight)
        const categoryCell = (name: string) => {
          const category = row.categories.find((item) => item.name === name)
          if (!category || category.average === null) return "—"
          return `${category.average.toFixed(1)}% / ${category.contribution?.toFixed(1) ?? "—"}%  (${category.weight}%)`
        }
        const cells = [
          row.quarter,
          categoryCell("Written/Oral Works"),
          categoryCell("Product/Performance Tasks"),
          categoryCell("Examinations"),
          row.initial === null ? "Incomplete" : `${row.initial.toFixed(2)}%`,
          row.final == null ? "—" : `${row.final}`,
          `${row.count} assessment${row.count === 1 ? "" : "s"}\n${row.status}`,
        ]
        x = margin
        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(8)
        pdf.setTextColor(51, 65, 85)
        cells.forEach((cell, index) => {
          pdf.text(pdf.splitTextToSize(cell, widths[index] - 4), x + 2, y + 6)
          x += widths[index]
        })
        y += rowHeight
      })
    }

    y += 4
    if (y > pageHeight - 42) {
      pdf.addPage()
      y = 20
    }
    if (reportSubject === "MAPEH" && reportPeriod === "Full Year" && mapehFinal !== null) {
      y += 3
      pdf.setFont("helvetica", "bold")
      pdf.text(`MAPEH final grade: ${mapehFinal}`, margin, y)
    }

    const note = isCompetencyClass
      ? "Kinder and Grade 1 progress is categorical. Numeric grades and numeric transmutation are not applicable."
      : reportHasConvertedGrades
        ? "Term grades use the template helper conversion."
        : reportHasSettings
          ? "Initial grades are shown. The selected period does not have a verified numeric conversion rule."
          : "Grading configuration is missing or incomplete for one or more selected terms. Results are informational and must not be treated as official."
    pdf.setFont("helvetica", "italic")
    pdf.setFontSize(8)
    pdf.setTextColor(100, 116, 139)
    pdf.text(pdf.splitTextToSize(note, tableWidth), margin, y)
    y += 9
    pdf.setDrawColor(148, 163, 184)
    pdf.line(margin, Math.min(y + 4, pageHeight - 16), margin + 70, Math.min(y + 4, pageHeight - 16))
    pdf.line(pageWidth - margin - 70, Math.min(y + 4, pageHeight - 16), pageWidth - margin, Math.min(y + 4, pageHeight - 16))
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(8)
    pdf.text("Class adviser", margin, Math.min(y + 9, pageHeight - 7))
    pdf.text("Parent / guardian", pageWidth - margin, Math.min(y + 9, pageHeight - 7), { align: "right" })
    return pdf
  }
  async function downloadReport() {
    setReportSendError("")
    try {
      const pdf = await buildReportPdf()
      pdf.save(`${student.last_name}-${reportSubject || "subject"}-report-card.pdf`)
    } catch (pdfError) {
      setReportSendError(pdfError instanceof Error ? pdfError.message : "The report card PDF could not be generated.")
    }
  }
  async function sendReportCard() {
    if (!student.parent_guardian_email) {
      setReportSendError("Add a parent or guardian email to the pupil record before sending.")
      return
    }
    if (!reportSubject) {
      setReportSendError("Choose a subject before sending the report card.")
      return
    }
    setSendingReport(true)
    setReportSendError("")
    setReportSendMessage("")
    try {
      const pdfData = (await buildReportPdf()).output("datauristring").split(",")[1]
      if (!pdfData) throw new Error("The report card PDF could not be generated.")
      const scope = reportPeriod === "Full Year" ? "Full Year" : reportPeriod
      const fileName = `${student.last_name}-${reportSubject}-${scope}-report-card.pdf`.replace(/[^a-zA-Z0-9._-]/g, "-")
      const response = await fetch("/api/parent-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          to: student.parent_guardian_email,
          subject: `${reportPeriod} report card for ${student.first_name} ${student.last_name} - ${reportSubject}`,
          message: `Dear ${student.parent_guardian_name || "Parent/Guardian"},\n\nAttached is ${student.first_name} ${student.last_name}'s ${reportPeriod.toLowerCase()} academic report card for ${reportSubject}.\n\nNumeric grades are shown only where the grading configuration and approved conversion rule are available.\n\nPlease contact the class adviser if you have any questions.\n\nElemBloom`,
          type: "report_card",
          attachment: { fileName, mimeType: "application/pdf", base64: pdfData },
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? "The report card could not be sent.")
      setReportSendMessage(result.logged === false
        ? `Report card sent to ${student.parent_guardian_email}, but ElemBloom could not record the sent-message history.`
        : `Report card sent to ${student.parent_guardian_email}.`)
    } catch (sendError) {
      setReportSendError(sendError instanceof Error ? sendError.message : "The report card could not be sent.")
    } finally {
      setSendingReport(false)
    }
  }

  return <section className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
    <Button render={<Link href="/pupils" />} variant="ghost" className="w-fit"><ArrowLeft data-icon="inline-start" />Back to pupils</Button>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Pupil profile</p><h1 className="mt-1 text-3xl font-bold">{student.first_name} {student.last_name}</h1><p className="mt-2 text-muted-foreground">Student no. {student.student_number} · {student.gender ?? "Gender not set"} · {gradeLevelLabel(classRecord.grade_level)} · {classRecord.section_name} · {classRecord.school_year}</p></div><div className="flex gap-2"><Button type="button" onClick={() => { setReportSubject(subjects[0] ?? ""); setReportSendError(""); setReportSendMessage(""); setShowReport(true) }} variant="outline"><FileText data-icon="inline-start" />View report card</Button><Button render={<Link href="/pupils" />} variant="outline"><Pencil data-icon="inline-start" />Edit pupil</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Academic average" value={average == null ? "—" : `${average}%`} tone="text-primary" /><Stat label="Attendance rate" value={attendanceRate == null ? "—" : `${attendanceRate}%`} tone="text-emerald-600" /><Stat label="Present / late" value={`${attendanceSummary.present} / ${attendanceSummary.late}`} tone="text-primary" /><Stat label="Absent" value={attendanceSummary.absent} tone="text-destructive" /><div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parent/guardian</p><p className="mt-2 truncate font-semibold">{student.parent_guardian_name || "Not recorded"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{student.parent_guardian_email || "No email recorded"}</p></div></div>
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Attendance History</h2>
            <p className="mt-1 text-sm text-muted-foreground">Saved attendance records for this pupil. Excused records are excluded from the rate.</p>
          </div>
          <CalendarDays className="text-primary" />
        </div>
        <div className="grid gap-3 border-b p-5 sm:grid-cols-3">
          <label className="grid gap-1 text-xs font-medium">School year
            <select aria-label="Attendance school year" value={attendanceYear} onChange={(event) => setAttendanceYear(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="all">All years</option>{attendanceYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">From
            <input aria-label="Attendance from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium">To
            <input aria-label="Attendance to date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b p-5 sm:grid-cols-4">
          <Stat label="Present" value={attendanceSummary.present} tone="text-emerald-600" />
          <Stat label="Late" value={attendanceSummary.late} tone="text-amber-600" />
          <Stat label="Absent" value={attendanceSummary.absent} tone="text-destructive" />
          <Stat label="Excused" value={attendanceSummary.excused} tone="text-muted-foreground" />
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Attendance calendar</h3>
              <p className="mt-1 text-sm text-muted-foreground">Recorded attendance only; blank dates have no saved record.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</Button>
              <span className="min-w-32 text-center text-sm font-medium">{calendarMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</span>
              <Button type="button" variant="outline" size="sm" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-1 font-medium">{day}</span>)}
            {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map((_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, index) => {
              const date = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`
              const entries = filteredAttendance.filter((item) => item.attendance_date === date)
              const entry = entries[0]
              const colors: Record<string, string> = { present: "bg-emerald-500", late: "bg-amber-500", absent: "bg-red-500", excused: "bg-slate-400" }
              return <div key={date} title={entry ? `${formatDate(date)} · ${statusLabel(entry.status)}${entries.length > 1 ? ` · ${entries.length} records` : ""}` : `${formatDate(date)} · No record`} className="group relative flex min-h-9 items-center justify-center rounded-md border bg-background text-sm">
                <span>{index + 1}</span>{entry && <span aria-label={statusLabel(entry.status)} className={`absolute bottom-1 size-1.5 rounded-full ${colors[entry.status]}`} />}
              </div>
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {[["Present", "bg-emerald-500"], ["Late", "bg-amber-500"], ["Absent", "bg-red-500"], ["Excused", "bg-slate-400"]].map(([label, color]) => <span key={label} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${color}`} />{label}</span>)}
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card"><div className="border-b p-5"><h2 className="font-semibold">Academic overview</h2><p className="mt-1 text-sm text-muted-foreground">Average score by subject from recorded assessments.</p></div>{subjectAverages.length ? <div className="flex flex-col gap-5 p-5">{subjectAverages.map((item) => <div key={item.name}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{item.name}</span><span className="text-muted-foreground">{item.value}%</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.value}%` }} /></div></div>)}</div> : <div className="p-10 text-center text-sm text-muted-foreground">No academic scores available</div>}</div>
    </div>
    <div className="rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Assessment records</h2><p className="mt-1 text-sm text-muted-foreground">Only records saved for this pupil are shown.</p></div><div className="flex gap-2"><select aria-label="Filter grading period" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All periods</option>{availablePeriods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select><select aria-label="Filter subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All subjects</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></div></div>{assessments.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Assessment</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Period</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Score</th></tr></thead><tbody className="divide-y">{assessments.map((item) => { const score = scoreForStudent(item); return <tr key={item.id}><td className="px-5 py-3 font-medium">{item.title}<p className="text-xs text-muted-foreground">{item.assessment_type}</p></td><td className="px-5 py-3">{item.subject}</td><td className="px-5 py-3">{periodLabelForSchoolYear(item.grading_period, classRecord.school_year)}</td><td className="px-5 py-3">{formatDate(item.assessment_date)}</td><td className="px-5 py-3 font-medium">{score == null ? "Not recorded" : `${score} / ${item.total_points}`}</td></tr>})}</tbody></table></div> : <div className="p-10 text-center text-sm text-muted-foreground">No assessments match the selected filters.</div>}</div>
    {showReport && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="report-card-title">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-primary">ElemBloom report card</p><h2 id="report-card-title" className="text-2xl font-bold">{student.first_name} {student.last_name}</h2><p className="text-sm text-muted-foreground">{student.student_number} · {gradeLevelLabel(classRecord.grade_level)} · {classRecord.section_name} · {classRecord.school_year}</p></div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={downloadReport}>Download PDF</Button><Button type="button" onClick={sendReportCard} disabled={sendingReport || !student.parent_guardian_email || !reportSubject}><Mail data-icon="inline-start" />{sendingReport ? "Sending…" : "Send to parent/guardian"}</Button><Button type="button" variant="outline" onClick={() => setShowReport(false)}>Close</Button></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Subject<select disabled={sendingReport} className="mt-2 w-full rounded-lg border bg-background px-3 py-2" value={reportSubject} onChange={(event) => { setReportSubject(event.target.value); setReportSendError(""); setReportSendMessage("") }}>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-sm font-medium">Scope<select disabled={sendingReport} className="mt-2 w-full rounded-lg border bg-background px-3 py-2" value={reportPeriod} onChange={(event) => { setReportPeriod(event.target.value); setReportSendError(""); setReportSendMessage("") }}><option>Full Year</option>{reportPeriods.map((item) => <option key={item.short_label}>{item.display_name}</option>)}</select></label>
          {!isCompetencyClass && <div className="rounded-lg border bg-muted/30 p-3 text-sm">Passing grade: <strong>{passingGradeLabels.length ? passingGradeLabels.join(" / ") : "Not configured"}</strong><p className="mt-1 text-xs text-muted-foreground">Uses the selected subject’s saved term policy when available.</p></div>}
        </div>
        {!isCompetencyClass && !reportHasSettings && <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">Grading settings are missing or weights do not total 100%. This report is informational and cannot be presented as an official final grade.</p>}
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">{isCompetencyClass ? "Kinder and Grade 1 use categorical competency progress; numeric grade calculations do not apply." : `Academic results use assessment scores and saved grading weights only; attendance is excluded. ${reportHasConvertedGrades ? "Term conversion follows the workbook helper table." : "Grades without an available conversion rule remain unverified."}`}</p>
        {!student.parent_guardian_email && <p className="mt-4 rounded-lg border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">Add a parent or guardian email to this pupil’s record to enable sending.</p>}
        {reportSendError && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{reportSendError}</p>}
        {reportSendMessage && <p className="mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary" role="status">{reportSendMessage}</p>}
        {!isCompetencyClass && reportSubject && <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3">Term</th><th className="px-3 py-3">Written/Oral Works<br />PS / WS (weight)</th><th className="px-3 py-3">Product/Performance Tasks<br />PS / WS (weight)</th><th className="px-3 py-3">Examinations<br />PS / WS (weight)</th><th className="px-3 py-3">Initial grade</th><th className="px-3 py-3">Term grade</th><th className="px-3 py-3">Recorded / status</th></tr></thead>
            <tbody className="divide-y">{selectedReportRows.map((row) => {
              const categoryCell = (name: string) => {
                const category = row.categories.find((item) => item.name === name)
                return category?.average == null ? "—" : `${category.average.toFixed(2)}% / ${category.contribution?.toFixed(2) ?? "—"}% (${category.weight}%)`
              }
              return <tr key={row.quarter}>
                <td className="px-3 py-3 font-medium">{row.quarter}</td>
                <td className="px-3 py-3">{categoryCell("Written/Oral Works")}</td>
                <td className="px-3 py-3">{categoryCell("Product/Performance Tasks")}</td>
                <td className="px-3 py-3">{categoryCell("Examinations")}</td>
                <td className="px-3 py-3">{row.initial == null ? "Incomplete" : `${row.initial.toFixed(2)}%`}</td>
                <td className="px-3 py-3">{row.final == null ? "—" : row.final}</td>
                <td className="px-3 py-3">{row.count} assessment{row.count === 1 ? "" : "s"}<br /><span className="text-xs text-muted-foreground">{row.status}</span></td>
              </tr>
            })}</tbody>
          </table>
        </div>}
        {isCompetencyClass && reportSubject && <section className="mt-6 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm"><thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3">Term</th><th className="px-3 py-3">Competency / progress area</th><th className="px-3 py-3">Rating</th><th className="px-3 py-3">Notes</th></tr></thead><tbody className="divide-y">{reportProgressRows.map((record) => <tr key={record.id}><td className="px-3 py-3">{periodLabelForSchoolYear(record.grading_period, classRecord.school_year)}</td><td className="px-3 py-3">{record.competency}</td><td className="px-3 py-3 font-medium">{record.rating}</td><td className="px-3 py-3 text-muted-foreground">{record.notes || "—"}</td></tr>)}</tbody></table>
          {!reportProgressRows.length && <p className="p-6 text-center text-sm text-muted-foreground">No progress ratings are recorded for this subject and selected scope.</p>}
        </section>}
        {reportSubject && <p className="mt-5 rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">Performance summary: {reportSubject === "MAPEH" ? mapehFinal === null ? "All three verified term composites are required before a MAPEH final grade can be calculated." : `MAPEH final grade: ${mapehFinal}. Term composites are the rounded average of Music and Arts and Physical Education and Health.` : isCompetencyClass ? `${reportProgressRows.length} categorical progress rating${reportProgressRows.length === 1 ? "" : "s"} recorded; numeric grade calculations do not apply.` : reportRows.some((row) => row.final != null) ? `Current grading-engine results for ${reportSubject} use the template helper where available.` : `More recorded assessments are needed before a reliable report can be calculated for ${reportSubject}.`}</p>}
      </div>
    </div>}
  </section>
}
