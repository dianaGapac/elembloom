export type GradeCategory = "Written Work" | "Performance Tasks" | "Quarterly Assessment"

export type GradingPolicy = {
  passingGrade: number
  decimalPlaces: number
  roundingMethod: "half_up" | "floor" | "ceil"
  weights: Record<string, number>
  categoryMap?: Record<string, GradeCategory>
  conversionBands?: Array<{ label: string; min: number; max: number }>
}

export type GradeAssessment = {
  id: string
  assessmentType: string
  gradingPeriod: string
  subject: string
  totalPoints: number
}

export type GradeScore = { assessmentId: string; studentId: string; score: number | null }

export type GradeResult = {
  status: "complete" | "incomplete"
  weightedPercentage: number | null
  transmutedGrade: number | null
  remark: string
  categories: Array<{ name: string; weight: number; average: number | null; contribution: number | null; recorded: number; total: number }>
  missingAssessments: string[]
}

const defaultCategoryMap: Record<string, GradeCategory> = {
  "Short Quiz": "Written Work", Quiz: "Written Work", Assignment: "Written Work", "Written Work": "Written Work",
  "Performance Task": "Performance Tasks", Project: "Performance Tasks", "Performance Tasks": "Performance Tasks",
  "Periodic Examination": "Quarterly Assessment", "Quarterly Examination": "Quarterly Assessment", "Quarterly Exam": "Quarterly Assessment", "Quarterly Assessment": "Quarterly Assessment",
}

function round(value: number, places: number, method: GradingPolicy["roundingMethod"]) {
  const factor = 10 ** places
  if (method === "floor") return Math.floor(value * factor) / factor
  if (method === "ceil") return Math.ceil(value * factor) / factor
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function calculateGrade(studentId: string, assessments: GradeAssessment[], scores: GradeScore[], policy: GradingPolicy, subject?: string, gradingPeriod?: string): GradeResult {
  const filtered = assessments.filter((assessment) => (!subject || assessment.subject === subject) && (!gradingPeriod || assessment.gradingPeriod === gradingPeriod))
  const categoryMap = { ...defaultCategoryMap, ...(policy.categoryMap ?? {}) }
  const categories = Object.entries(policy.weights).map(([name, weight]) => {
    const rows = filtered.filter((assessment) => (categoryMap[assessment.assessmentType] ?? "Written Work") === name)
    const recorded = rows.map((assessment) => scores.find((score) => score.assessmentId === assessment.id && score.studentId === studentId)).filter((score) => score?.score !== null && score?.score !== undefined)
    const percentages = rows.map((assessment) => {
      const score = scores.find((item) => item.assessmentId === assessment.id && item.studentId === studentId)
      return score?.score === null || score?.score === undefined || assessment.totalPoints <= 0 ? null : Number(score.score) / assessment.totalPoints * 100
    }).filter((value): value is number => value !== null)
    const percentageAverage = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null
    return { name, weight: Number(weight), average: percentageAverage === null ? null : round(percentageAverage, policy.decimalPlaces, policy.roundingMethod), contribution: percentageAverage === null ? null : percentageAverage * Number(weight) / 100, recorded: percentages.length, total: rows.length }
  })
  const missingAssessments = filtered.filter((assessment) => !scores.some((score) => score.assessmentId === assessment.id && score.studentId === studentId && score.score !== null && score.score !== undefined)).map((assessment) => assessment.id)
  const active = categories.filter((category) => category.total > 0)
  const complete = active.length > 0 && active.every((category) => category.recorded === category.total)
  const weightedPercentage = complete ? round(categories.reduce((sum, category) => sum + (category.contribution ?? 0), 0), policy.decimalPlaces, policy.roundingMethod) : null
  const transmutedGrade = weightedPercentage === null ? null : round(weightedPercentage, policy.decimalPlaces, policy.roundingMethod)
  const remark = weightedPercentage === null ? "Incomplete" : weightedPercentage >= policy.passingGrade ? "Passed" : "Needs support"
  return { status: complete ? "complete" : "incomplete", weightedPercentage, transmutedGrade, remark, categories, missingAssessments }
}
