import * as XLSX from "xlsx"

export type ExportRow = {
  studentNumber: string
  learnerName: string
  scores: Record<string, number | null>
  componentPercentages: Record<string, number | null>
  initialGrade: number | null
  quarterlyGrade: number | null
  status: string
}

export type ExportAssessment = { id: string; title: string; category: string; totalPoints: number; assessmentDate: string }

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildClassRecordCsv(rows: ExportRow[], assessments: ExportAssessment[]) {
  const headers = ["Student Number", "Learner Name", ...assessments.map((assessment) => `${assessment.title} / ${assessment.totalPoints}`), "Initial Grade", "Quarterly Grade", "Grade Status"]
  const lines = [headers.map(csvCell).join(",")]
  for (const row of rows) lines.push([row.studentNumber, row.learnerName, ...assessments.map((assessment) => row.scores[assessment.id] ?? ""), row.initialGrade ?? "", row.quarterlyGrade ?? "", row.status].map(csvCell).join(","))
  return `\uFEFF${lines.join("\n")}`
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export function downloadClassRecordWorkbook(filename: string, rows: ExportRow[], assessments: ExportAssessment[], periodLabel: string) {
  const learnerInfo = rows.map((row) => ({ "Student Number": row.studentNumber, "Learner Name": row.learnerName }))
  const written = rows.map((row) => ({ "Student Number": row.studentNumber, "Learner Name": row.learnerName, ...Object.fromEntries(assessments.filter((assessment) => assessment.category === "Written Work").map((assessment) => [assessment.title, row.scores[assessment.id] ?? ""])), "Percentage": row.componentPercentages["Written Work"] ?? "" }))
  const performance = rows.map((row) => ({ "Student Number": row.studentNumber, "Learner Name": row.learnerName, ...Object.fromEntries(assessments.filter((assessment) => assessment.category === "Performance Tasks").map((assessment) => [assessment.title, row.scores[assessment.id] ?? ""])), "Percentage": row.componentPercentages["Performance Tasks"] ?? "" }))
  const examination = rows.map((row) => ({ "Student Number": row.studentNumber, "Learner Name": row.learnerName, ...Object.fromEntries(assessments.filter((assessment) => assessment.category === "Quarterly Assessment").map((assessment) => [assessment.title, row.scores[assessment.id] ?? ""])), "Percentage": row.componentPercentages["Quarterly Assessment"] ?? "" }))
  const summary = rows.map((row) => ({ "Student Number": row.studentNumber, "Learner Name": row.learnerName, "Initial Grade": row.initialGrade ?? "", "Quarterly Grade": row.quarterlyGrade ?? "", "Grade Status": row.status }))
  const workbook = XLSX.utils.book_new()
  for (const [name, values] of [["Learner Information", learnerInfo], ["Written Work", written], ["Performance Tasks", performance], ["Quarterly Assessment", examination], ["Quarterly Summary", summary]] as const) {
    const sheet = XLSX.utils.json_to_sheet(values)
    sheet["!cols"] = [{ wch: 18 }, { wch: 26 }, ...Array(Math.max(1, Object.keys(values[0] ?? {}).length - 2)).fill({ wch: 18 })]
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }
  XLSX.writeFile(workbook, filename)
}
