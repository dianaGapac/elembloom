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

export const interventionFocusOptions = [
  { value: "recommended", label: "Recommended from risk signals" },
  { value: "foundational-skills", label: "Foundational skill gap" },
  { value: "attendance", label: "Attendance and routines" },
  { value: "engagement", label: "Engagement and participation" },
  { value: "confidence", label: "Confidence and persistence" },
  { value: "multiple-subjects", label: "Needs across multiple subjects" },
  { value: "language-access", label: "Language or access to learning" },
  { value: "diagnostic", label: "Gather evidence and identify needs" },
] as const

export type InterventionFocus = (typeof interventionFocusOptions)[number]["value"]

export function suggestInterventionPlan({
  risk,
  subject,
  teacherContext,
  focus = "recommended",
}: {
  risk: RiskClass
  subject: string
  teacherContext: string
  focus?: InterventionFocus
}): SuggestedInterventionPlan {
  const subjectResult = risk.subjects.find((item) => item.subject === subject)
  const selectedSubject = subjectResult?.subject ?? subject
  const belowPassingSubjects = risk.subjects.filter((item) => item.belowPassing)
  const baseline = subjectResult
    ? subjectResult.average === null
      ? "No pupil scores are recorded for this subject yet"
      : `${subjectResult.average.toFixed(1)}% average; configured passing mark ${subjectResult.passing}%`
    : risk.average === null ? "Insufficient assessment evidence recorded" : `Overall assessment average ${risk.average.toFixed(1)}%`
  const normalizedSubject = selectedSubject.toLowerCase()
  const contextLine = teacherContext.trim() ? `Teacher observation: ${teacherContext.trim()}` : ""
  const resolvedFocus = focus === "recommended"
    ? risk.absences > 0 || risk.lates > 0 || risk.attendanceRate !== null && risk.attendanceRate < 90
      ? "attendance"
      : risk.average === null || risk.missing.length > 0
        ? "diagnostic"
        : belowPassingSubjects.length > 1
          ? "multiple-subjects"
          : "foundational-skills"
    : focus
  const target = subjectResult?.average !== null && subjectResult
    ? `Meet or make measurable progress toward the configured ${subjectResult.passing}% passing mark in ${selectedSubject}. Review the target with the teacher using new classroom evidence.`
    : `Agree on a measurable short-term target for ${selectedSubject || "the identified learning area"} after collecting baseline evidence.`
  const skillStrategy = /math|numeracy|arithmetic/.test(normalizedSubject)
    ? "Start with a short diagnostic to pinpoint the prerequisite skill or misconception. Model one step at a time, use concrete materials or visual representations before abstract practice, and check understanding after each example. Gradually reduce prompts as the pupil becomes more independent."
    : /read|language|english|literacy/.test(normalizedSubject)
      ? "Briefly check the specific reading or language skill, then model it explicitly and practise together with appropriately leveled text or tasks. Use repeated supported practice, prompt the pupil to explain their thinking, and finish with a short independent check."
      : `Check the prerequisite skills in ${selectedSubject || "the identified learning area"}, model the target task, and move from supported practice to a short independent check. Use the pupil's errors to choose the next practice activity.`

  const scenario = {
    "foundational-skills": {
      concern: `${selectedSubject || "Learning"} skill gap`,
      objective: `Strengthen one clearly identified prerequisite or target skill in ${selectedSubject || "the learning area"} through explicit teaching and scaffolded practice.`,
      strategy: skillStrategy,
      resources: "Teacher-selected curriculum materials, worked examples or visual aids, short differentiated practice tasks, and learner work samples.",
      frequency: "2–3 times per week",
      durationMinutes: "20",
      expectedOutcome: "Improved accuracy and increasing independence on the selected skill.",
      measurementMethod: "Use a brief skill check and save one work sample each week; compare accuracy, prompt level, and the type of errors.",
    },
    attendance: {
      concern: "Attendance, punctuality, or continuity of learning",
      objective: "Identify and address barriers to consistent participation, help the pupil reconnect with missed learning, and agree on a manageable attendance or punctuality goal.",
      strategy: "Meet privately with the pupil using supportive, non-punitive questions to understand barriers. Agree on a predictable check-in and a simple arrival or return-to-class routine. Coordinate appropriate follow-up with the family and school support staff, and provide a brief catch-up sequence for missed essential learning. Do not assume the reason for absences.",
      resources: "Attendance record, agreed check-in routine, essential-learning catch-up materials, and family or school support contact as appropriate.",
      frequency: "Brief check-in each school day; review weekly",
      durationMinutes: "10",
      expectedOutcome: "More consistent participation and improved access to missed or current classroom learning.",
      measurementMethod: "Review attendance and punctuality weekly alongside check-in notes and completion of agreed catch-up tasks.",
    },
    engagement: {
      concern: "Participation and engagement in learning",
      objective: "Increase the pupil's active participation in a specific classroom task or routine using predictable steps and achievable choices.",
      strategy: "Observe when participation is strongest and when it drops. Break the target task into short, visible steps; offer two appropriate ways to respond or demonstrate learning; use a clear start cue and specific feedback for effort and strategy. Gradually increase task length as the pupil sustains engagement.",
      resources: "Visual task steps, teacher-selected response choices, brief engagement log, and existing classroom learning materials.",
      frequency: "Use during a target lesson or activity at least 3 times per week",
      durationMinutes: "15",
      expectedOutcome: "The pupil starts and completes more of the agreed learning task with less prompting.",
      measurementMethod: "Record task starts, completed steps, and prompts needed during a consistent observation period each week.",
    },
    confidence: {
      concern: "Confidence, persistence, or willingness to attempt challenging work",
      objective: "Build the pupil's willingness to attempt and persist with appropriately challenging tasks by making progress visible and providing safe opportunities to practise.",
      strategy: "Begin with a task the pupil can partially complete, model how to approach a mistake, and teach a simple help-seeking or retry routine. Give private, specific feedback about strategies used rather than fixed ability. Increase challenge gradually and invite the pupil to reflect on one success and one next step.",
      resources: "Progress tracker or portfolio, appropriately scaffolded tasks, worked examples, and a pupil-selected help-seeking cue.",
      frequency: "2 times per week, with brief classroom reinforcement",
      durationMinutes: "15",
      expectedOutcome: "The pupil attempts challenging work, uses an agreed strategy after difficulty, and recognizes progress.",
      measurementMethod: "Track attempts, use of the agreed strategy, and task completion; review a pupil work sample and reflection weekly.",
    },
    "multiple-subjects": {
      concern: "Learning needs across more than one subject",
      objective: "Prioritize a small number of high-value skills across the affected subjects and monitor whether shared prerequisite needs are improving.",
      strategy: `Review recent work in ${belowPassingSubjects.map((item) => item.subject).join(", ") || "the affected subjects"} and identify any shared prerequisite skill. Select no more than two initial priorities, coordinate practice with the relevant subject teachers, and avoid overloading the pupil with separate tasks. Review progress before adding another target.`,
      resources: "Recent work samples, a shared short-term target list, coordinated practice tasks, and brief teacher check-in notes.",
      frequency: "2–3 brief supported practice opportunities per week",
      durationMinutes: "20",
      expectedOutcome: "Progress on the agreed priority skills without creating an unmanageable workload.",
      measurementMethod: "Collect one comparable check or work sample per priority skill each week and review progress with the teachers involved.",
    },
    "language-access": {
      concern: "Access to instructions, learning materials, or ways to demonstrate understanding",
      objective: "Improve access to the target learning task by identifying and reducing avoidable language or format barriers while preserving the learning goal.",
      strategy: "Check whether the pupil understands the task directions and key vocabulary. Present instructions in short steps, model an example, and use relevant visuals or approved language supports. Where appropriate, let the pupil explain understanding orally, visually, or with another accessible response format before moving to the standard task. Confirm that supports align with school guidance.",
      resources: "Visuals, vocabulary supports, modeled examples, and school-approved language or accessibility resources.",
      frequency: "Use consistently during the target activity; review weekly",
      durationMinutes: "15",
      expectedOutcome: "The pupil can access instructions and demonstrate the intended skill with appropriate supports.",
      measurementMethod: "Compare task understanding, completion, and accuracy with supports in place; note which supports helped.",
    },
    diagnostic: {
      concern: "Limited or incomplete evidence about the learning need",
      objective: "Collect enough relevant classroom evidence to identify a specific support target and establish a reliable baseline before judging progress.",
      strategy: "Use two or three brief, low-stakes checks in different formats, review recent work, and ask the pupil to explain their approach. Note skills demonstrated as well as errors, and check whether missed instruction, task directions, or access barriers may affect the result. Use findings to select a focused next step with the pupil.",
      resources: "Short curriculum-aligned diagnostic tasks, recent work samples, observation notes, and pupil explanation or reflection.",
      frequency: "2 brief checks per week for 2 weeks, then review",
      durationMinutes: "15",
      expectedOutcome: "A documented baseline and a specific, evidence-based target for follow-up support.",
      measurementMethod: "Record results from each check and summarize strengths, error patterns, and the agreed next target after two weeks.",
    },
  }[resolvedFocus]

  const contextualStrategy = teacherContext.trim()
    ? `${scenario.strategy} Adapt the examples and supports to the teacher observation: ${teacherContext.trim()}`
    : scenario.strategy
  const evidence = [
    subjectResult?.average !== null && subjectResult ? `${selectedSubject}: ${subjectResult.average.toFixed(1)}% average (passing ${subjectResult.passing}%)` : null,
    ...risk.factors,
    contextLine || null,
  ].filter((item): item is string => Boolean(item))

  return {
    title: `${scenario.concern} support plan`,
    goal: `${scenario.objective} Review progress regularly and adjust the support using classroom evidence.`,
    baseline,
    targetPerformance: target,
    successCriteria: `Review the agreed target using the measurement method at least weekly. Continue, adjust, or step down the support based on the pupil's progress and input.`,
    riskFactors: evidence,
    concern: scenario.concern,
    objective: scenario.objective,
    strategy: contextualStrategy,
    resources: scenario.resources,
    frequency: scenario.frequency,
    durationMinutes: scenario.durationMinutes,
    expectedOutcome: scenario.expectedOutcome,
    measurementMethod: scenario.measurementMethod,
    teacherContext: teacherContext.trim(),
  }
}
