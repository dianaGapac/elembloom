export type PeriodKey = "Q1" | "Q2" | "Q3" | "Q4" | "T1" | "T2" | "T3"
export type PeriodDefinition = { order: number; key: PeriodKey; label: string; legacy?: boolean }
export type AcademicCategory = "Written/Oral Works" | "Product/Performance Tasks" | "Examinations"
export type CategoryWeights = Record<AcademicCategory, number>

export const trimesterPeriods: PeriodDefinition[] = [
  { order: 1, key: "T1", label: "First Term" },
  { order: 2, key: "T2", label: "Second Term" },
  { order: 3, key: "T3", label: "Third Term" },
]

export const quarterPeriods: PeriodDefinition[] = [
  { order: 1, key: "Q1", label: "First Quarter" },
  { order: 2, key: "Q2", label: "Second Quarter" },
  { order: 3, key: "Q3", label: "Third Quarter" },
  { order: 4, key: "Q4", label: "Fourth Quarter" },
]

export const legacyFourthQuarter: PeriodDefinition = {
  order: 4,
  key: "Q4",
  label: "Legacy Fourth Quarter",
  legacy: true,
}
export const legacyFourthQuarterOption: PeriodDefinition = {
  order: 4,
  key: "Q4",
  label: "Archived period",
  legacy: true,
}

export const academicCategories: AcademicCategory[] = [
  "Written/Oral Works",
  "Product/Performance Tasks",
  "Examinations",
]

export const gradeSubjects: Record<number, string[]> = {
  0: ["Kinder Competencies"],
  1: ["Reading & Literacy", "Language", "Mathematics", "GMRC", "Makabansa"],
  2: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  3: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  4: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  5: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
  6: ["Science", "Mathematics", "English", "Filipino", "Araling Panlipunan", "Music and Arts", "Physical Education and Health", "GMRC and Values Education", "EPP-TLE"],
}

export const passingGrade = 75

export const transmutationTable: Array<{ min: number; max: number; grade: number }> = [
  { min: 99.5, max: 100, grade: 100 },
  { min: 98.32, max: 99.49, grade: 99 },
  { min: 97.14, max: 98.31, grade: 98 },
  { min: 95.96, max: 97.13, grade: 97 },
  { min: 94.78, max: 95.95, grade: 96 },
  { min: 93.6, max: 94.77, grade: 95 },
  { min: 92.42, max: 93.59, grade: 94 },
  { min: 91.24, max: 92.41, grade: 93 },
  { min: 90.06, max: 91.23, grade: 92 },
  { min: 88.88, max: 90.05, grade: 91 },
  { min: 87.7, max: 88.87, grade: 90 },
  { min: 86.52, max: 87.69, grade: 89 },
  { min: 85.34, max: 86.51, grade: 88 },
  { min: 84.16, max: 85.33, grade: 87 },
  { min: 82.98, max: 84.15, grade: 86 },
  { min: 81.8, max: 82.97, grade: 85 },
  { min: 80.62, max: 81.79, grade: 84 },
  { min: 79.44, max: 80.61, grade: 83 },
  { min: 78.26, max: 79.43, grade: 82 },
  { min: 77.08, max: 78.25, grade: 81 },
  { min: 75.9, max: 77.07, grade: 80 },
  { min: 74.72, max: 75.89, grade: 79 },
  { min: 73.54, max: 74.71, grade: 78 },
  { min: 72.36, max: 73.53, grade: 77 },
  { min: 71.18, max: 72.35, grade: 76 },
  { min: 70, max: 71.17, grade: 75 },
  { min: 65.34, max: 69.99, grade: 74 },
  { min: 60.67, max: 65.33, grade: 73 },
  { min: 56.01, max: 60.66, grade: 72 },
  { min: 51.34, max: 56, grade: 71 },
  { min: 46.67, max: 51.33, grade: 70 },
  { min: 42.01, max: 46.66, grade: 69 },
  { min: 37.34, max: 42, grade: 68 },
  { min: 32.68, max: 37.33, grade: 67 },
  { min: 28.01, max: 32.67, grade: 66 },
  { min: 23.35, max: 28, grade: 65 },
  { min: 18.68, max: 23.34, grade: 64 },
  { min: 14.01, max: 18.67, grade: 63 },
  { min: 9.35, max: 14, grade: 62 },
  { min: 4.68, max: 9.34, grade: 61 },
  { min: 0, max: 4.67, grade: 60 },
]

export const descriptors = [
  { min: 90, max: 100, label: "Advancing", description: "Consistently demonstrates skills and understanding that meet or exceed standards with independence, flexibility, and depth." },
  { min: 80, max: 89, label: "Benchmarking", description: "Demonstrates expected grade-level skills and understanding competently and independently." },
  { min: 75, max: 79, label: "Connecting", description: "Demonstrates sufficient understanding and application of grade-level standards with occasional guidance and support." },
  { min: 65, max: 74, label: "Developing", description: "Demonstrates partial understanding and inconsistent application of skills, requires targeted support and scaffolding." },
  { min: 60, max: 64, label: "Emerging", description: "Does not yet demonstrate foundational skills and understanding; requires intensive support." },
]

const standardWeights: CategoryWeights = {
  "Written/Oral Works": 20,
  "Product/Performance Tasks": 50,
  Examinations: 30,
}

const practicalWeights: CategoryWeights = {
  "Written/Oral Works": 20,
  "Product/Performance Tasks": 60,
  Examinations: 20,
}

export function isTrimesterSchoolYear(schoolYear: string | null | undefined) {
  const startYear = Number(schoolYear?.match(/\d{4}/)?.[0])
  return Number.isFinite(startYear) && startYear >= 2026
}

export function periodsForSchoolYear(schoolYear: string | null | undefined) {
  return isTrimesterSchoolYear(schoolYear) ? trimesterPeriods : quarterPeriods
}

export function normalizePeriod(value: string | null | undefined): PeriodKey | null {
  const normalized = value?.trim().toLowerCase() ?? ""
  const compact = normalized.match(/^(q|t|quarter|term)\s*([1-4])$/)
  if (compact) {
    const number = Number(compact[2])
    if (compact[1] === "t" || compact[1] === "term") return number <= 3 ? `T${number}` as PeriodKey : null
    return `Q${number}` as PeriodKey
  }
  const ordinal = ["first", "second", "third", "fourth"].findIndex((name) => normalized.includes(name))
  if (ordinal < 0) return null
  if (normalized.includes("term")) return ordinal < 3 ? `T${ordinal + 1}` as PeriodKey : null
  return `Q${ordinal + 1}` as PeriodKey
}

export function periodKeyForSchoolYear(value: string | null | undefined, schoolYear: string | null | undefined): PeriodKey | null {
  const key = normalizePeriod(value)
  if (key?.startsWith("Q") && isTrimesterSchoolYear(schoolYear) && key !== "Q4") return `T${key.slice(1)}` as PeriodKey
  return key
}

export function periodLabel(value: string | null | undefined) {
  const key = normalizePeriod(value)
  return [...trimesterPeriods, ...quarterPeriods].find((period) => period.key === key)?.label ?? value ?? ""
}

export function periodLabelForSchoolYear(value: string | null | undefined, schoolYear: string | null | undefined) {
  const key = periodKeyForSchoolYear(value, schoolYear)
  if (key === "Q4" && isTrimesterSchoolYear(schoolYear)) return legacyFourthQuarterOption.label
  return periodLabel(key ?? value)
}

export function periodOptionsForSchoolYear(
  schoolYear: string | null | undefined,
  storedPeriods: Array<{ short_label: string; display_name: string }> = [],
) {
  if (!isTrimesterSchoolYear(schoolYear)) {
    return storedPeriods.length
      ? storedPeriods.map((period, index) => ({
        order: index + 1,
        short_label: normalizePeriod(period.short_label) ?? period.short_label,
        display_name: periodLabel(period.display_name),
      }))
      : quarterPeriods.map((period) => ({ order: period.order, short_label: period.key, display_name: period.label }))
  }
  return trimesterPeriods.map((period) => ({ order: period.order, short_label: period.key, display_name: period.label }))
}

export function gradeLevelLabel(gradeLevel: number | null | undefined) {
  return gradeLevel === 0 ? "Kinder" : gradeLevel == null ? "—" : `Grade ${gradeLevel}`
}

export function subjectsForGrade(gradeLevel: number | null | undefined) {
  return gradeSubjects[gradeLevel ?? -1] ?? []
}

export function normalizeCategoryWeights(weights: Record<string, number> | null | undefined, fallback: CategoryWeights): CategoryWeights {
  return {
    "Written/Oral Works": Number(weights?.["Written/Oral Works"] ?? weights?.["Written Work"] ?? fallback["Written/Oral Works"]),
    "Product/Performance Tasks": Number(weights?.["Product/Performance Tasks"] ?? weights?.["Performance Tasks"] ?? fallback["Product/Performance Tasks"]),
    Examinations: Number(weights?.Examinations ?? weights?.["Quarterly Assessment"] ?? fallback.Examinations),
  }
}

export function categoryWeightsFor(gradeLevel: number, subject: string): CategoryWeights {
  if (gradeLevel < 2) return { ...standardWeights }
  const name = subject.trim().toLowerCase().replaceAll("&", "and").replaceAll(/\s+/g, " ")
  const practical = ["mapeh", "music", "arts", "music and arts", "physical education", "health", "pe and health", "physical education and health", "epp", "epp-tle", "tle", "technology and livelihood education", "edukasyong pantahanan at pangkabuhayan"]
  return { ...(practical.includes(name) ? practicalWeights : standardWeights) }
}

export function transmutedGradeFor(initialGrade: number) {
  return transmutationTable.find((band) => initialGrade >= band.min && initialGrade <= band.max)?.grade ?? null
}

export function mapehCompositeTermGrade(musicAndArtsGrade: number | null, physicalEducationAndHealthGrade: number | null) {
  if (musicAndArtsGrade === null || physicalEducationAndHealthGrade === null) return null
  return Math.round((musicAndArtsGrade + physicalEducationAndHealthGrade) / 2)
}

export function mapehFinalGrade(termGrades: Array<number | null>) {
  if (termGrades.length !== 3 || termGrades.some((grade) => grade === null)) return null
  return Math.round(termGrades.reduce<number>((total, grade) => total + (grade ?? 0), 0) / 3)
}

export function descriptorForGrade(grade: number | null) {
  return grade === null ? null : descriptors.find((band) => grade >= band.min && grade <= band.max) ?? null
}
