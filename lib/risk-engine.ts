export type RiskLevel = "high" | "moderate" | "low" | "incomplete"

export type RiskClass = {
  level: RiskLevel
  label: string
  average: number | null
  failed: number
  absences: number
  lates: number
  attendanceRate: number | null
  assessed: string | null
  subjects: Array<{ subject: string; average: number | null; passing: number; belowPassing: boolean; recorded: number }>
  factors: string[]
  missing: string[]
  rules: string[]
}

export type RiskThresholds = {
  low_assessment_threshold: number
  repeated_failed_assessments: number
  attendance_concern_absences: number
  moderate_risk_score: number
  high_risk_score: number
  attendance_rate_concern?: number
  repeated_lateness?: number
  declining_assessments?: number
  severe_low_assessment_threshold?: number
}

export type RiskStudent = { id: string; class_id: string }
export type RiskClassRecord = { id: string; grade_level?: number; section_name?: string; school_year: string; subject_name?: string | null }
export type RiskAssessment = { id: string; class_id: string; subject: string; assessment_date: string; total_points: number; passing_percentage: number }
export type RiskScore = { assessment_id: string; student_id: string; score: number | null; updated_at?: string }
export type RiskAttendance = { student_id: string; class_id: string; attendance_date: string; status: "present" | "absent" | "late" | "excused" }
export type RiskIntervention = { student_id: string; status: string; target_review_date?: string | null; updated_at?: string | null }

export type RiskData = {
  classes: RiskClassRecord[]
  assessments: RiskAssessment[]
  scores: RiskScore[]
  attendance: RiskAttendance[]
  interventions?: RiskIntervention[]
  settings: RiskThresholds
}

const labels: Record<RiskLevel, string> = { high: "High risk", moderate: "Moderate risk", low: "Low risk", incomplete: "Incomplete" }

function latestScore(scores: RiskScore[], assessmentId: string, studentId: string) {
  return scores.filter((score) => score.assessment_id === assessmentId && score.student_id === studentId).sort((a, b) => String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? ""))).at(-1)
}

export function classifyRisk(student: RiskStudent, data: RiskData, schoolYear = "", period = ""): RiskClass {
  const studentClass = data.classes.find((item) => item.id === student.class_id)
  const assessments = data.assessments.filter((item) => item.class_id === student.class_id && (!schoolYear || studentClass?.school_year === schoolYear) && (!period || (item as RiskAssessment & { grading_period?: string }).grading_period === period))
  const scored = assessments.map((assessment) => ({ assessment, score: latestScore(data.scores, assessment.id, student.id) })).filter((item) => item.score?.score !== null && item.score?.score !== undefined)
  const percentages = scored.map(({ assessment, score }) => Number(score!.score) / Number(assessment.total_points) * 100).filter((value) => Number.isFinite(value))
  const absentRecords = data.attendance.filter((item) => item.student_id === student.id && item.status === "absent" && (!schoolYear || item.attendance_date.startsWith(schoolYear.slice(0, 4))))
  const lateRecords = data.attendance.filter((item) => item.student_id === student.id && item.status === "late" && (!schoolYear || item.attendance_date.startsWith(schoolYear.slice(0, 4))))
  const countedAttendance = data.attendance.filter((item) => item.student_id === student.id && item.status !== "excused" && (!schoolYear || item.attendance_date.startsWith(schoolYear.slice(0, 4))))
  const attendanceRate = countedAttendance.length ? ((countedAttendance.length - absentRecords.length) / countedAttendance.length) * 100 : null
  const average = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null
  const failed = scored.filter(({ assessment, score }) => Number(score!.score) / Number(assessment.total_points) * 100 < Number(assessment.passing_percentage)).length
  const subjects = Array.from(new Set(assessments.map((assessment) => assessment.subject))).map((subject) => {
    const subjectScores = scored.filter(({ assessment }) => assessment.subject === subject)
    const subjectAverage = subjectScores.length ? subjectScores.reduce((sum, { assessment, score }) => sum + Number(score!.score) / Number(assessment.total_points) * 100, 0) / subjectScores.length : null
    const passing = subjectScores.length ? Math.max(...subjectScores.map(({ assessment }) => Number(assessment.passing_percentage))) : data.settings.low_assessment_threshold
    return { subject, average: subjectAverage, passing, belowPassing: subjectAverage !== null && subjectAverage < passing, recorded: subjectScores.length }
  })
  const missing: string[] = []
  const factors: string[] = []
  const rules: string[] = []
  if (!assessments.length) missing.push("No assessments are available for the selected period.")
  else if (scored.length < assessments.length) missing.push(`${assessments.length - scored.length} assessment score${assessments.length - scored.length === 1 ? " is" : "s are"} not recorded.`)
  if (!countedAttendance.length) missing.push("No attendance records are available for the selected school year.")
  if (average !== null && average < data.settings.low_assessment_threshold) { factors.push(`Assessment average is ${average.toFixed(1)}%, below the configured ${data.settings.low_assessment_threshold}% threshold.`); rules.push("Minimum assessment performance threshold") }
  if (failed >= data.settings.repeated_failed_assessments) { factors.push(`${failed} assessments are below their configured passing marks.`); rules.push("Repeated failed assessment threshold") }
  if (subjects.filter((subject) => subject.belowPassing).length > 1) { factors.push(`${subjects.filter((subject) => subject.belowPassing).length} subjects are below their configured passing grades.`); rules.push("Multiple subjects below passing") }
  if (absentRecords.length >= data.settings.attendance_concern_absences) { factors.push(`${absentRecords.length} recorded absences.`); rules.push("Absence frequency threshold") }
  if (data.settings.attendance_rate_concern !== undefined && attendanceRate !== null && attendanceRate < data.settings.attendance_rate_concern) { factors.push(`Attendance rate is ${attendanceRate.toFixed(1)}%, below the configured ${data.settings.attendance_rate_concern}% threshold.`); rules.push("Attendance rate threshold") }
  if (data.settings.repeated_lateness !== undefined && lateRecords.length >= data.settings.repeated_lateness) { factors.push(`${lateRecords.length} recorded late arrivals.`); rules.push("Repeated lateness threshold") }
  const ordered = scored.slice().sort((a, b) => a.assessment.assessment_date.localeCompare(b.assessment.assessment_date)).map(({ assessment, score }) => Number(score!.score) / Number(assessment.total_points) * 100)
  const decline = ordered.length >= 2 && ordered.at(-1)! < ordered.at(-2)! && ordered.at(-2)! - ordered.at(-1)! >= (data.settings.declining_assessments ?? 10)
  if (decline) { factors.push(`Recent assessment performance declined by at least ${data.settings.declining_assessments ?? 10} percentage points.`); rules.push("Declining assessment threshold") }
  const academicPoints = (average !== null && average < data.settings.low_assessment_threshold ? 2 : 0) + (failed >= data.settings.repeated_failed_assessments ? 2 : failed > 0 ? 1 : 0) + (subjects.filter((subject) => subject.belowPassing).length > 1 ? 1 : 0) + (decline ? 1 : 0)
  const attendancePoints = (absentRecords.length >= data.settings.attendance_concern_absences ? 2 : 0) + (data.settings.attendance_rate_concern !== undefined && attendanceRate !== null && attendanceRate < data.settings.attendance_rate_concern ? 2 : 0) + (data.settings.repeated_lateness !== undefined && lateRecords.length >= data.settings.repeated_lateness ? 1 : 0)
  const total = academicPoints + attendancePoints
  let level: RiskLevel = "incomplete"
  if (scored.length && countedAttendance.length) level = total >= data.settings.high_risk_score ? "high" : total >= data.settings.moderate_risk_score ? "moderate" : "low"
  return { level, label: labels[level], average, failed, absences: absentRecords.length, lates: lateRecords.length, attendanceRate, assessed: scored.length ? scored.map(({ assessment }) => assessment.assessment_date).sort().at(-1) ?? null : null, subjects, factors, missing, rules }
}
