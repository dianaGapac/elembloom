import { academicCategories, descriptorForGrade, normalizePeriod, transmutedGradeFor, type AcademicCategory } from "@/lib/academic-structure"

export type GradeCategory = AcademicCategory

export type GradingPolicy = {
  passingGrade: number
  decimalPlaces: number
  roundingMethod: "half_up" | "floor" | "ceil"
  weights: Record<string, number>
  categoryMap?: Record<string, GradeCategory>
  useTransmutation?: boolean
}

export type GradeAssessment = {
  id: string
  assessmentType: string
  gradingPeriod: string
  subject: string
  totalPoints: number
  gradingCategory?: string | null
}

export type GradeScore = { assessmentId: string; studentId: string; score: number | null }

export type GradeResult = {
  status: "complete" | "incomplete"
  weightedPercentage: number | null
  transmutedGrade: number | null
  descriptor: string | null
  remark: string
  categories: Array<{ name: GradeCategory; weight: number; average: number | null; contribution: number | null; recorded: number; total: number; rawRecorded: number; rawTotal: number }>
  missingAssessments: string[]
}

const categoryAliases: Record<string, GradeCategory> = {
  "Written Work": "Written/Oral Works",
  "Written/Oral Works": "Written/Oral Works",
  "Written / Oral Works": "Written/Oral Works",
  "Performance Tasks": "Product/Performance Tasks",
  "Performance Task": "Product/Performance Tasks",
  "Product/Performance Tasks": "Product/Performance Tasks",
  "Product / Performance Tasks": "Product/Performance Tasks",
  "Quarterly Assessment": "Examinations",
  "Quarterly Examination": "Examinations",
  "Quarterly Exam": "Examinations",
  "Periodic Examination": "Examinations",
  Examinations: "Examinations",
  "Short Quiz": "Written/Oral Works",
  Quiz: "Written/Oral Works",
  Assignment: "Written/Oral Works",
  Project: "Product/Performance Tasks",
}
const legacyWeightKey: Record<GradeCategory, string> = {
  "Written/Oral Works": "Written Work",
  "Product/Performance Tasks": "Performance Tasks",
  Examinations: "Quarterly Assessment",
}

function round(value: number, places: number, method: GradingPolicy["roundingMethod"]) {
  const factor = 10 ** places
  if (method === "floor") return Math.floor(value * factor) / factor
  if (method === "ceil") return Math.ceil(value * factor) / factor
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function calculateGrade(studentId: string, assessments: GradeAssessment[], scores: GradeScore[], policy: GradingPolicy, subject?: string, gradingPeriod?: string): GradeResult {
  const filtered = assessments.filter((assessment) => (!subject || assessment.subject === subject) && (!gradingPeriod || normalizePeriod(assessment.gradingPeriod) === normalizePeriod(gradingPeriod)))
  const weights = Object.fromEntries(academicCategories.map((name) => {
    const configuredWeight = policy.weights[name] ?? policy.weights[legacyWeightKey[name]] ?? 0
    return [name, Number(configuredWeight)]
  })) as Record<GradeCategory, number>
  const categoryMap = { ...categoryAliases, ...(policy.categoryMap ?? {}) }
  const categories = academicCategories.map((name) => {
    const weight = weights[name]
    const rows = filtered.filter((assessment) => {
      const sourceCategory = assessment.gradingCategory ?? categoryMap[assessment.assessmentType] ?? "Written/Oral Works"
      return categoryAliases[sourceCategory] === name || sourceCategory === name
    })
    const recorded = rows.map((assessment) => scores.find((score) => score.assessmentId === assessment.id && score.studentId === studentId)).filter((score) => score?.score !== null && score?.score !== undefined)
    const rawTotal = rows.reduce((sum, assessment) => sum + Math.max(0, Number(assessment.totalPoints)), 0)
    const rawRecorded = recorded.reduce((sum, score) => sum + Math.max(0, Number(score?.score ?? 0)), 0)
    const rawPercentage = rawTotal > 0 && recorded.length ? rawRecorded / rawTotal * 100 : null
    return { name, weight: Number(weight), average: rawPercentage === null ? null : round(rawPercentage, policy.decimalPlaces, policy.roundingMethod), contribution: rawPercentage === null ? null : rawPercentage * Number(weight) / 100, recorded: recorded.length, total: rows.length, rawRecorded, rawTotal }
  })
  const missingAssessments = filtered.filter((assessment) => !scores.some((score) => score.assessmentId === assessment.id && score.studentId === studentId && score.score !== null && score.score !== undefined)).map((assessment) => assessment.id)
  const required = categories.filter((category) => category.weight > 0)
  const complete = required.length > 0 && required.every((category) => category.total > 0 && category.recorded === category.total)
  const rawWeightedPercentage = complete ? categories.reduce((sum, category) => sum + (category.contribution ?? 0), 0) : null
  const weightedPercentage = rawWeightedPercentage === null ? null : round(rawWeightedPercentage, policy.decimalPlaces, policy.roundingMethod)
  const transmutedGrade = weightedPercentage === null || !policy.useTransmutation ? null : transmutedGradeFor(weightedPercentage)
  const descriptor = descriptorForGrade(transmutedGrade)?.label ?? null
  const remark = weightedPercentage === null ? "Incomplete" : transmutedGrade === null ? "Unverified" : transmutedGrade >= policy.passingGrade ? "Passed" : "Needs support"
  return { status: complete ? "complete" : "incomplete", weightedPercentage, transmutedGrade, descriptor, remark, categories, missingAssessments }
}
