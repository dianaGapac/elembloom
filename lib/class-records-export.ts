import * as XLSX from "xlsx"
import { academicCategories } from "@/lib/academic-structure"

export type ExportRow = {
  studentNumber: string
  learnerName: string
  scores: Record<string, number | null>
  componentPercentages: Record<string, number | null>
  categories: Record<string, {
    rawRecorded: number
    rawTotal: number
    average: number | null
    contribution: number | null
  }>
  initialGrade: number | null
  termGrade: number | null
  descriptor: string | null
  status: string
}

export type ExportAssessment = { id: string; title: string; category: string; totalPoints: number; assessmentDate: string }
export type ExportContext = { classLabel: string; subject: string; schoolYear: string; weights: Record<string, number> }
export type FinalGradeExportRow = {
  studentNumber: string
  learnerName: string
  periodGrades: Array<{ label: string; grade: number | null; descriptor: string | null; remarks: string }>
}
export type ProgressExportRow = {
  studentNumber: string
  learnerName: string
  competencies: Record<string, string>
  whatChildCanDo: string
  learningToImprove: string
  teacherComments: string
}
export type FinalProgressExportRow = {
  studentNumber: string
  learnerName: string
  terms: Array<{
    label: string
    competencies: Record<string, string>
    whatChildCanDo: string
    learningToImprove: string
    teacherComments: string
  }>
}

const categories = academicCategories

function percentage(value: number | null) {
  return value === null ? "" : `${value.toFixed(2)}%`
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildClassRecordCsv(rows: ExportRow[], assessments: ExportAssessment[]) {
  const headers = [
    "Student Number",
    "Learner Name",
    ...categories.flatMap((category) => [
      ...assessments.filter((assessment) => assessment.category === category).map((assessment) => `${assessment.title} / ${assessment.totalPoints}`),
      `${category} Total`,
      `${category} PS`,
      `${category} WS`,
    ]),
    "Initial Grade",
    "Term Grade",
    "Descriptor",
    "Grade Status",
  ]
  const lines = [headers.map(csvCell).join(",")]
  for (const row of rows) {
    const categoryValues = categories.flatMap((category) => {
      const categoryAssessments = assessments.filter((assessment) => assessment.category === category)
      const result = row.categories[category]
      return [
        ...categoryAssessments.map((assessment) => row.scores[assessment.id] ?? ""),
        result?.rawTotal ? `${result.rawRecorded}/${result.rawTotal}` : "",
        percentage(result?.average ?? null),
        percentage(result?.contribution ?? null),
      ]
    })
    lines.push([row.studentNumber, row.learnerName, ...categoryValues, row.initialGrade ?? "", row.termGrade ?? "", row.descriptor ?? "", row.status].map(csvCell).join(","))
  }
  return `\uFEFF${lines.join("\n")}`
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export function buildFinalGradesCsv(
  rows: FinalGradeExportRow[],
  periods: Array<{ short_label: string; display_name: string }>,
) {
  const headers = [
    "Student Number",
    "Learner Name",
    ...periods.flatMap((period) => [
      `${period.display_name} Final Grade`,
      `${period.display_name} Descriptor`,
      `${period.display_name} Remarks`,
    ]),
    "Year Average",
  ]
  const lines = [headers.map(csvCell).join(",")]
  for (const row of rows) {
    const termResults = periods.map((period) =>
      row.periodGrades.find((item) => item.label === period.short_label),
    )
    const grades = termResults.map((item) => item?.grade ?? null)
    const recordedGrades = grades.filter((grade): grade is number => grade !== null)
    const yearAverage = recordedGrades.length
      ? recordedGrades.reduce((sum, grade) => sum + grade, 0) / recordedGrades.length
      : null
    lines.push(
      [
        row.studentNumber,
        row.learnerName,
        ...termResults.flatMap((item) => [
          item?.grade ?? "",
          item?.descriptor ?? "",
          item?.remarks ?? "",
        ]),
        yearAverage === null ? "" : yearAverage.toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    )
  }
  return `\uFEFF${lines.join("\n")}`
}

export function downloadFinalGradesWorkbook(
  filename: string,
  rows: FinalGradeExportRow[],
  periods: Array<{ short_label: string; display_name: string }>,
  context: { classLabel: string; subject: string; schoolYear: string },
) {
  const headers = [
    "Student Number",
    "Learner Name",
    ...periods.flatMap((period) => [
      `${period.display_name} Final Grade`,
      `${period.display_name} Descriptor`,
      `${period.display_name} Remarks`,
    ]),
    "Year Average",
  ]
  const values: unknown[][] = [
    [`${context.classLabel} · ${context.subject} · ${context.schoolYear} · Final Grades`],
    headers,
    ...rows.map((row) => {
      const termResults = periods.map((period) =>
        row.periodGrades.find((item) => item.label === period.short_label),
      )
      const grades = termResults.map((item) => item?.grade ?? null)
      const recordedGrades = grades.filter((grade): grade is number => grade !== null)
      const yearAverage = recordedGrades.length
        ? recordedGrades.reduce((sum, grade) => sum + grade, 0) / recordedGrades.length
        : null
      return [
        row.studentNumber,
        row.learnerName,
        ...termResults.flatMap((item) => [
          item?.grade ?? "",
          item?.descriptor ?? "",
          item?.remarks ?? "",
        ]),
        yearAverage ?? "",
      ]
    }),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(values)
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    ...periods.flatMap(() => [{ wch: 22 }, { wch: 28 }, { wch: 22 }]),
    { wch: 16 },
  ]
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 1, c: 0 },
      e: { r: rows.length + 1, c: headers.length - 1 },
    }),
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Final Grades")
  XLSX.writeFile(workbook, filename)
}

export function buildProgressRecordCsv(rows: ProgressExportRow[], competencyNames: string[]) {
  const headers = [
    "Student Number",
    "Learner Name",
    ...competencyNames,
    "What the Child Can Do",
    "Learning to Improve",
    "Teacher Comments",
  ]
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.studentNumber,
        row.learnerName,
        ...competencyNames.map((name) => row.competencies[name] ?? ""),
        row.whatChildCanDo,
        row.learningToImprove,
        row.teacherComments,
      ]
        .map(csvCell)
        .join(","),
    ),
  ]
  return `\uFEFF${lines.join("\n")}`
}

export function downloadProgressRecordWorkbook(
  filename: string,
  rows: ProgressExportRow[],
  competencyNames: string[],
  context: { classLabel: string; subject: string; term: string; schoolYear: string },
) {
  const headers = [
    "Student Number",
    "Learner Name",
    ...competencyNames,
    "What the Child Can Do",
    "Learning to Improve",
    "Teacher Comments",
  ]
  const values: unknown[][] = [
    [`${context.classLabel} · ${context.subject} · ${context.term} · ${context.schoolYear}`],
    headers,
    ...rows.map((row) => [
      row.studentNumber,
      row.learnerName,
      ...competencyNames.map((name) => row.competencies[name] ?? ""),
      row.whatChildCanDo,
      row.learningToImprove,
      row.teacherComments,
    ]),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(values)
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    ...competencyNames.map(() => ({ wch: 32 })),
    { wch: 40 },
    { wch: 40 },
    { wch: 40 },
  ]
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 1, c: 0 },
      e: { r: rows.length + 1, c: headers.length - 1 },
    }),
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Progress Records")
  XLSX.writeFile(workbook, filename)
}

function finalProgressExportData(rows: FinalProgressExportRow[]) {
  const competencyNames = [...new Set(rows.flatMap((row) =>
    row.terms.flatMap((term) => Object.keys(term.competencies)),
  ))]
  return {
    competencyNames,
    records: rows.flatMap((row) => row.terms.map((term) => ({
      studentNumber: row.studentNumber,
      learnerName: row.learnerName,
      term: term.label,
      competencies: term.competencies,
      whatChildCanDo: term.whatChildCanDo,
      learningToImprove: term.learningToImprove,
      teacherComments: term.teacherComments,
    }))),
  }
}

export function buildFinalProgressCsv(rows: FinalProgressExportRow[]) {
  const { competencyNames, records } = finalProgressExportData(rows)
  const headers = [
    "Student Number",
    "Learner Name",
    "Term",
    ...competencyNames,
    "What the Child Can Do",
    "Learning to Improve",
    "Teacher Comments",
  ]
  const lines = [
    headers.map(csvCell).join(","),
    ...records.map((record) => [
      record.studentNumber,
      record.learnerName,
      record.term,
      ...competencyNames.map((name) => record.competencies[name] ?? ""),
      record.whatChildCanDo,
      record.learningToImprove,
      record.teacherComments,
    ].map(csvCell).join(",")),
  ]
  return `\uFEFF${lines.join("\n")}`
}

export function downloadFinalProgressWorkbook(
  filename: string,
  rows: FinalProgressExportRow[],
  context: { classLabel: string; subject: string; schoolYear: string },
) {
  const { competencyNames, records } = finalProgressExportData(rows)
  const headers = [
    "Student Number",
    "Learner Name",
    "Term",
    ...competencyNames,
    "What the Child Can Do",
    "Learning to Improve",
    "Teacher Comments",
  ]
  const values: unknown[][] = [
    [`${context.classLabel} · ${context.subject} · ${context.schoolYear} · Final Progress Summary`],
    headers,
    ...records.map((record) => [
      record.studentNumber,
      record.learnerName,
      record.term,
      ...competencyNames.map((name) => record.competencies[name] ?? ""),
      record.whatChildCanDo,
      record.learningToImprove,
      record.teacherComments,
    ]),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(values)
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 18 },
    ...competencyNames.map(() => ({ wch: 32 })),
    { wch: 40 },
    { wch: 40 },
    { wch: 40 },
  ]
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 1, c: 0 },
      e: { r: records.length + 1, c: headers.length - 1 },
    }),
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Final Progress")
  XLSX.writeFile(workbook, filename)
}

export function downloadClassRecordWorkbook(filename: string, rows: ExportRow[], assessments: ExportAssessment[], periodLabel: string, context?: ExportContext) {
  const workbook = XLSX.utils.book_new()
  const headerRow = 4
  const columnHeadersRow = 5
  const highestScoreRow = 6
  const firstLearnerRow = highestScoreRow + 1
  const values: unknown[][] = [
    [`${periodLabel} Class Record`],
    [context ? `${context.classLabel} · ${context.subject} · ${context.schoolYear}` : periodLabel],
    [context ? `Grading weights: ${categories.map((category) => `${category} ${context.weights[category] ?? 0}%`).join(" · ")}` : ""],
    ["PS = Percentage Score · WS = Weighted Score"],
    [],
    [],
    ["Highest Possible Score"],
  ]
  const merges: XLSX.Range[] = []
  const columnWidths: XLSX.ColInfo[] = [{ wch: 18 }, { wch: 28 }]
  let column = 2
  values[headerRow] = ["Learner Information", ""]
  values[columnHeadersRow] = ["Student Number", "Learner Name"]
  values[highestScoreRow] = ["Highest Possible Score", ""]

  for (const category of categories) {
    const categoryAssessments = assessments.filter((assessment) => assessment.category === category)
    const categoryStart = column
    values[headerRow][categoryStart] = context ? `${category} (${context.weights[category] ?? 0}%)` : category
    for (const assessment of categoryAssessments) {
      values[columnHeadersRow].push(assessment.title)
      values[highestScoreRow].push(assessment.totalPoints)
      columnWidths.push({ wch: Math.max(14, Math.min(assessment.title.length + 2, 26)) })
      column += 1
    }
    values[columnHeadersRow].push("Total", "PS", "WS")
    values[highestScoreRow].push(categoryAssessments.reduce((sum, assessment) => sum + assessment.totalPoints, 0), 100, context ? `${context.weights[category] ?? 0}%` : "")
    columnWidths.push({ wch: 14 }, { wch: 10 }, { wch: 10 })
    column += 3
    merges.push({ s: { r: headerRow, c: categoryStart }, e: { r: headerRow, c: column - 1 } })
  }

  const initialGradeColumn = column
  values[headerRow][initialGradeColumn] = "Initial Grade"
  values[headerRow][initialGradeColumn + 1] = "Term Grade"
  values[headerRow][initialGradeColumn + 2] = "Descriptor"
  values[headerRow][initialGradeColumn + 3] = "Grade Status"
  values[columnHeadersRow].push("Initial Grade", "Term Grade", "Descriptor", "Grade Status")
  values[highestScoreRow].push("", "", "", "")
  columnWidths.push({ wch: 15 }, { wch: 16 }, { wch: 16 }, { wch: 18 })
  column += 4
  for (const row of [0, 1, 2, 3]) merges.push({ s: { r: row, c: 0 }, e: { r: row, c: column - 1 } })
  merges.push({ s: { r: headerRow, c: 0 }, e: { r: headerRow, c: 1 } })
  for (const gradeColumn of [initialGradeColumn, initialGradeColumn + 1, initialGradeColumn + 2, initialGradeColumn + 3]) {
    merges.push({ s: { r: headerRow, c: gradeColumn }, e: { r: highestScoreRow, c: gradeColumn } })
  }

  for (const row of rows) {
    const valuesForRow: unknown[] = [row.studentNumber, row.learnerName]
    for (const category of categories) {
      const categoryAssessments = assessments.filter((assessment) => assessment.category === category)
      const result = row.categories[category]
      valuesForRow.push(...categoryAssessments.map((assessment) => row.scores[assessment.id] ?? ""))
      valuesForRow.push(
        result?.rawTotal ? `${result.rawRecorded}/${result.rawTotal}` : "",
        percentage(result?.average ?? null),
        percentage(result?.contribution ?? null),
      )
    }
    valuesForRow.push(row.initialGrade ?? "", row.termGrade ?? "", row.descriptor ?? "", row.status)
    values.push(valuesForRow)
  }

  const recordSheet = XLSX.utils.aoa_to_sheet(values)
  recordSheet["!merges"] = merges
  recordSheet["!cols"] = columnWidths
  recordSheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: firstLearnerRow + rows.length - 1, c: column - 1 } }) }
  XLSX.utils.book_append_sheet(workbook, recordSheet, "Class Record")

  const summaryValues: unknown[][] = [
    [`${periodLabel} Grade Summary`],
    [context ? `${context.classLabel} · ${context.subject} · ${context.schoolYear}` : periodLabel],
    ["Student Number", "Learner Name", "Initial Grade", "Term Grade", "Descriptor", "Grade Status"],
    ...rows.map((row) => [row.studentNumber, row.learnerName, row.initialGrade ?? "", row.termGrade ?? "", row.descriptor ?? "", row.status]),
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryValues)
  summarySheet["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Grade Summary")
  XLSX.writeFile(workbook, filename)
}
