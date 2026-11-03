import type { RiskClass } from "@/lib/risk-engine"

export type SuggestedInterventionPlan = {
  title: string
  goal: string
  baseline: string
  targetPerformance: string
  successCriteria: string
  riskFactors: string[]
  concern: string
  objective: string
  strategy: string
  resources: string
  frequency: string
  durationMinutes: string
  expectedOutcome: string
  measurementMethod: string
  teacherContext: string
}

export function suggestInterventionPlan({
  risk,
  subject,
  teacherContext,
}: {
  risk: RiskClass
  subject: string
  teacherContext: string
}): SuggestedInterventionPlan {
  const subjectResult = risk.subjects.find((item) => item.subject === subject)
  const selectedSubject = subjectResult?.subject ?? subject
  const baseline = subjectResult
    ? subjectResult.average === null
      ? "No pupil scores are recorded for this subject yet"
      : `${subjectResult.average.toFixed(1)}% average; configured passing mark ${subjectResult.passing}%`
    : risk.average === null ? "Insufficient assessment evidence recorded" : `Overall assessment average ${risk.average.toFixed(1)}%`
  const target = subjectResult
    ? `Meet or exceed the configured ${subjectResult.passing}% passing mark in ${selectedSubject}`
    : `Demonstrate measurable progress in ${selectedSubject || "the identified learning area"}`
  const normalizedSubject = selectedSubject.toLowerCase()
  const strategy = /math|numeracy|arithmetic/.test(normalizedSubject)
    ? "Use a short diagnostic task, explicit modelling, and concrete-to-pictorial-to-abstract practice. Check understanding after each worked example and adjust the next practice set to the observed misconception."
    : /read|language|english|literacy/.test(normalizedSubject)
      ? "Use a brief diagnostic, explicit modelling, and guided practice in the identified reading or language skill. Provide appropriately leveled practice, then check understanding with a short independent task."
      : `Use a brief diagnostic in ${selectedSubject || "the identified learning area"}, model the target skill, and provide scaffolded guided practice followed by a short independent check.`
  const contextLine = teacherContext.trim() ? `Teacher observation: ${teacherContext.trim()}` : ""
  const contextualStrategy = teacherContext.trim() ? `${strategy} Incorporate this teacher observation: ${teacherContext.trim()}` : strategy
  const evidence = [
    subjectResult?.average !== null && subjectResult ? `${selectedSubject}: ${subjectResult.average.toFixed(1)}% average (passing ${subjectResult.passing}%)` : null,
    ...risk.factors,
    contextLine || null,
  ].filter((item): item is string => Boolean(item))

  return {
    title: `${selectedSubject || "Targeted learning"} support plan`,
    goal: `Strengthen ${selectedSubject || "the identified learning area"} skills through focused instruction and monitor progress using classroom evidence.`,
    baseline,
    targetPerformance: target,
    successCriteria: `Review progress using at least two subsequent ${selectedSubject || "subject"} checks and the target above; adjust the support with the teacher if progress is limited.`,
    riskFactors: evidence,
    concern: `${selectedSubject || "Learning"} skill gap`,
    objective: `Improve performance in ${selectedSubject || "the identified learning area"} from the documented baseline toward the agreed target.`,
    strategy: contextualStrategy,
    resources: "Current curriculum materials, teacher-selected practice tasks, and learner work samples.",
    frequency: "2 times per week",
    durationMinutes: "20",
    expectedOutcome: `Improved accuracy and independence in the targeted ${selectedSubject || "subject"} skill.`,
    measurementMethod: "Record results from brief, curriculum-aligned checks and review learner work samples.",
    teacherContext: teacherContext.trim(),
  }
}
