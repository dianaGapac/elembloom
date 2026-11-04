"use client"

import { Fragment, useEffect, useState } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { earlyLearningPolicies, gradeLevelLabel, gradeOnePaceCompetenciesForSubject, gradingPeriodsForGrade, kinderCompetencyDomains, kinderCompetencyList } from "@/lib/academic-structure"

const supabase = createClient()
type EarlyLearningReport = {
  id: string
  class_id: string
  student_id: string
  school_year: string
  grading_period: string
  what_child_can_do: string
  learning_to_improve: string
  teacher_comments: string
}

const fetcher = async () => {
  const [classes, subjects, enrollments, students, records, reports] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year").eq("is_active", true).in("grade_level", [0, 1]).order("grade_level").order("section_name"),
    supabase.from("class_subjects").select("id,class_id,subject_name").eq("is_active", true),
    supabase.from("class_enrollments").select("class_id,student_id,status").eq("status", "active"),
    supabase.from("students").select("id,student_number,first_name,last_name").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("competency_records").select("id,class_id,student_id,subject_offering_id,grading_period,competency,rating,notes"),
    supabase.from("early_learning_reports").select("id,class_id,student_id,school_year,grading_period,what_child_can_do,learning_to_improve,teacher_comments"),
  ])
  for (const result of [classes, subjects, enrollments, students, records, reports]) if (result.error) throw new Error(result.error.message)
  return { classes: classes.data ?? [], subjects: subjects.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [], records: records.data ?? [], reports: (reports.data ?? []) as EarlyLearningReport[] }
}

export default function CompetencyRecordsPage() {
  const { data, error, isLoading, mutate } = useSWR("competency-records", fetcher)
  const [classId, setClassId] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [paceStudentId, setPaceStudentId] = useState("")
  const [period, setPeriod] = useState("T1")
  const [paceRatingEdits, setPaceRatingEdits] = useState<Record<string, string>>({})
  const [kinderRatingEdits, setKinderRatingEdits] = useState<Record<string, string>>({})
  const [narrativeEdits, setNarrativeEdits] = useState<Record<string, Partial<EarlyLearningReport>>>({})
  const [savingReportId, setSavingReportId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryClassId = params.get("classId")
    const querySubjectId = params.get("subjectId")
    const queryStudentId = params.get("studentId")
    const queryPeriod = params.get("period")
    if (queryClassId) setClassId(queryClassId)
    if (querySubjectId) setSubjectId(querySubjectId)
    if (queryStudentId) setPaceStudentId(queryStudentId)
    if (queryPeriod) setPeriod(queryPeriod)
  }, [])

  if (isLoading) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading competency records…</p></main>
  if (error || !data) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-destructive">Unable to load competency records.</p></main>

  const selectedClass = data.classes.find((item) => item.id === classId) ?? data.classes[0]
  const subjects = data.subjects.filter((item) => item.class_id === selectedClass?.id)
  const selectedSubject = subjects.find((item) => item.id === subjectId) ?? subjects[0]
  const periods = gradingPeriodsForGrade(selectedClass?.grade_level, selectedClass?.school_year)
  const activePeriod = periods.some((item) => item.short_label === period) ? period : periods[0]?.short_label ?? "T1"
  const pupils = data.students.filter((student) => data.enrollments.some((row) => row.class_id === selectedClass?.id && row.student_id === student.id))
  const savedRecords = data.records.filter((row) => row.class_id === selectedClass?.id && row.subject_offering_id === selectedSubject?.id && row.grading_period === activePeriod)
  const policy = earlyLearningPolicies[(selectedClass?.grade_level ?? 0) as 0 | 1]
  const scale = policy.ratings
  const paceTerms = selectedClass?.grade_level === 1
    ? periods.filter((term) => term.short_label === activePeriod)
    : []
  const paceRecords = data.records.filter((row) =>
    row.class_id === selectedClass?.id &&
    row.subject_offering_id === selectedSubject?.id &&
    paceTerms.some((term) => term.short_label === row.grading_period),
  )
  const paceCompetenciesByTerm = Object.fromEntries(paceTerms.map((term) => [
    term.short_label,
    [...new Set([
      ...gradeOnePaceCompetenciesForSubject(selectedSubject?.subject_name, term.short_label),
      ...paceRecords.filter((row) => row.grading_period === term.short_label).map((row) => row.competency),
    ])],
  ]))
  const paceCompetencies = [...new Set(Object.values(paceCompetenciesByTerm).flat())]
  const paceStudent = pupils.find((student) => student.id === paceStudentId) ?? pupils[0]
  const paceStudentRecords = paceRecords.filter((record) => record.student_id === paceStudent?.id)
  const paceRatingKey = (name: string, term: string) => `${term}::${name}`
  const savedPaceRatings = Object.fromEntries(paceStudentRecords.map((record) => [
    paceRatingKey(record.competency, record.grading_period),
    record.rating,
  ]))
  const kinderCatalog = selectedClass?.grade_level === 0 ? kinderCompetencyList() : []
  const kinderStudent = selectedClass?.grade_level === 0
    ? pupils.find((student) => student.id === paceStudentId) ?? pupils[0]
    : undefined
  const kinderStudentRecords = selectedClass?.grade_level === 0
    ? savedRecords.filter((record) => record.student_id === kinderStudent?.id)
    : []
  const kinderCompetencies = [
    ...kinderCatalog,
    ...[...new Set(kinderStudentRecords.map((record) => record.competency))]
      .filter((name) => !kinderCatalog.some((item) => item.key === name))
      .map((key) => ({ domain: "Previously entered competencies", competency: key, key })),
  ]
  const savedKinderRatings = Object.fromEntries(kinderStudentRecords.map((record) => [record.competency, record.rating]))
  const savedReports = data.reports.filter((row) =>
    row.class_id === selectedClass?.id &&
    row.school_year === selectedClass?.school_year &&
    row.grading_period === activePeriod,
  )
  const reportEditKey = (studentId: string) => `${selectedClass?.id ?? ""}:${activePeriod}:${studentId}`

  function reportFor(studentId: string) {
    const saved = savedReports.find((row) => row.student_id === studentId)
    const edits = narrativeEdits[reportEditKey(studentId)]
    return {
      what_child_can_do: edits?.what_child_can_do ?? saved?.what_child_can_do ?? "",
      learning_to_improve: edits?.learning_to_improve ?? saved?.learning_to_improve ?? "",
      teacher_comments: edits?.teacher_comments ?? saved?.teacher_comments ?? "",
    }
  }

  async function saveReport(studentId: string) {
    if (!selectedClass) return
    setSavingReportId(studentId)
    setMessage("")
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) {
      setMessage(authError?.message ?? "Please sign in again before saving this progress report.")
      setSavingReportId(null)
      return
    }
    const { error: saveError } = await supabase.from("early_learning_reports").upsert({
      teacher_id: auth.user.id,
      class_id: selectedClass.id,
      student_id: studentId,
      school_year: selectedClass.school_year,
      grading_period: activePeriod,
      ...reportFor(studentId),
      updated_at: new Date().toISOString(),
    }, { onConflict: "class_id,student_id,school_year,grading_period" })
    if (saveError) setMessage(`Progress report could not be saved: ${saveError.message}`)
    else {
      setMessage("Term progress report saved.")
      await mutate()
    }
    setSavingReportId(null)
  }

  async function savePaceForm() {
    if (!selectedClass || selectedClass.grade_level !== 1 || !selectedSubject || !paceStudent) {
      setMessage("Choose a Grade 1 class, subject, and pupil.")
      return
    }
    const entries = paceTerms.flatMap((term) =>
      (paceCompetenciesByTerm[term.short_label] ?? []).flatMap((name) => {
        const key = paceRatingKey(name, term.short_label)
        const rating = paceRatingEdits[key] ?? savedPaceRatings[key] ?? ""
        return rating ? [{
          class_id: selectedClass.id,
          student_id: paceStudent.id,
          subject_offering_id: selectedSubject.id,
          grading_period: term.short_label,
          competency: name,
          rating,
        }] : []
      }),
    )
    if (entries.some((entry) => !scale.some((item) => item.value === entry.rating))) {
      setMessage("Use only the PACE ratings A, B, C, D, or E.")
      return
    }
    setSaving(true)
    setMessage("")
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) {
      setMessage(authError?.message ?? "Please sign in again before saving this PACE form.")
      setSaving(false)
      return
    }
    const { error: saveError } = entries.length
      ? await supabase.from("competency_records").upsert(
        entries.map((entry) => ({ ...entry, teacher_id: auth.user.id })),
        { onConflict: "teacher_id,class_id,student_id,subject_offering_id,grading_period,competency" },
      )
      : { error: null }
    if (saveError) {
      setMessage(`PACE form could not be saved: ${saveError.message}`)
      setSaving(false)
      return
    }
    const clearedIds = paceStudentRecords
      .filter((record) => (paceCompetenciesByTerm[record.grading_period] ?? []).includes(record.competency) && !entries.some((entry) => entry.grading_period === record.grading_period && entry.competency === record.competency))
      .map((record) => record.id)
    if (clearedIds.length) {
      const { error: deleteError } = await supabase.from("competency_records").delete().in("id", clearedIds)
      if (deleteError) {
        setMessage(`Some cleared PACE ratings could not be removed: ${deleteError.message}`)
        setSaving(false)
        await mutate()
        return
      }
    }
    setPaceRatingEdits({})
    setMessage(`${periods.find((term) => term.short_label === activePeriod)?.display_name ?? activePeriod} PACE ratings saved.`)
    await mutate()
    setSaving(false)
  }

  async function saveKinderForm() {
    if (!selectedClass || selectedClass.grade_level !== 0 || !selectedSubject || !kinderStudent) {
      setMessage("Choose a Kinder class, subject, and pupil.")
      return
    }
    const entries = kinderCompetencies.flatMap((item) => {
      const rating = kinderRatingEdits[item.key] ?? savedKinderRatings[item.key] ?? ""
      return rating ? [{
        class_id: selectedClass.id,
        student_id: kinderStudent.id,
        subject_offering_id: selectedSubject.id,
        grading_period: activePeriod,
        competency: item.key,
        rating,
      }] : []
    })
    if (entries.some((entry) => !scale.some((item) => item.value === entry.rating))) {
      setMessage("Use only CO, DV, or BG for Kinder competency ratings.")
      return
    }
    setSaving(true)
    setMessage("")
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) {
      setMessage(authError?.message ?? "Please sign in again before saving this Kinder record.")
      setSaving(false)
      return
    }
    const { error: saveError } = entries.length
      ? await supabase.from("competency_records").upsert(
          entries.map((entry) => ({ ...entry, teacher_id: auth.user.id })),
          { onConflict: "teacher_id,class_id,student_id,subject_offering_id,grading_period,competency" },
        )
      : { error: null }
    if (saveError) {
      setMessage(`Kinder competency ratings could not be saved: ${saveError.message}`)
      setSaving(false)
      return
    }
    const clearedIds = kinderStudentRecords
      .filter((record) => kinderCompetencies.some((item) => item.key === record.competency) && !entries.some((entry) => entry.competency === record.competency))
      .map((record) => record.id)
    if (clearedIds.length) {
      const { error: deleteError } = await supabase.from("competency_records").delete().in("id", clearedIds)
      if (deleteError) {
        setMessage(`Some cleared Kinder ratings could not be removed: ${deleteError.message}`)
        setSaving(false)
        await mutate()
        return
      }
    }
    setKinderRatingEdits({})
    setMessage(`${periods.find((term) => term.short_label === activePeriod)?.display_name ?? activePeriod} Kinder ratings saved.`)
    await mutate()
    setSaving(false)
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <header>
      <p className="text-sm font-medium text-primary">Progress-based records</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Kinder &amp; Grade 1 Competencies</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{policy.description}</p>
    </header>
    <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-3">
      <label className="text-xs font-medium text-muted-foreground">Class<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={selectedClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setSubjectId(""); setPaceStudentId(""); setPaceRatingEdits({}); setKinderRatingEdits({}); setNarrativeEdits({}) }}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name} · {item.school_year}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">Learning area<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={selectedSubject?.id ?? ""} onChange={(event) => { setSubjectId(event.target.value); setPaceRatingEdits({}); setKinderRatingEdits({}) }}><option value="">Choose learning area</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">{selectedClass?.grade_level === 1 ? "Narrative term" : "Term"}<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={activePeriod} onChange={(event) => { setPeriod(event.target.value); setPaceRatingEdits({}); setKinderRatingEdits({}) }}>{periods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label>
    </section>
    {selectedClass?.grade_level === 1 && selectedSubject && <section className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h2 className="font-semibold">Grade 1 PACE form · {selectedSubject.subject_name}</h2><p className="mt-1 text-sm text-muted-foreground">{periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod} · Rate the learner’s competencies for this term using the workbook’s PACE scale.</p></div>
        <label className="w-full text-xs font-medium text-muted-foreground sm:max-w-sm">Pupil<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={paceStudent?.id ?? ""} onChange={(event) => { setPaceStudentId(event.target.value); setPaceRatingEdits({}) }}><option value="">Choose pupil</option>{pupils.map((student) => <option key={student.id} value={student.id}>{student.last_name}, {student.first_name} · {student.student_number}</option>)}</select></label>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">{scale.map((rating) => <p key={rating.value}><strong>{rating.value} — {rating.label}:</strong> {rating.description}</p>)}</div>
      {paceStudent ? <div className="overflow-hidden rounded-lg border">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: `${320 + paceTerms.length * 150}px` }}>
            <thead className="sticky top-0 z-10 bg-primary text-xs text-primary-foreground">
              <tr><th className="sticky left-0 z-20 bg-primary px-3 py-3 text-center">No.</th><th className="sticky left-12 z-20 min-w-[420px] bg-primary px-4 py-3">Learning competencies</th><th className="w-[180px] px-3 py-3 text-center">{activePeriod}</th></tr>
            </thead>
            <tbody className="divide-y">{paceCompetencies.map((name, index) => {
              return <tr key={name} className="hover:bg-muted/20">
                <td className="sticky left-0 z-[1] bg-card px-3 py-3 text-center text-muted-foreground">{index + 1}</td>
                <td className="sticky left-12 z-[1] bg-card px-4 py-3">{name}</td>
                {(() => {
                  const term = paceTerms[0]
                  if (!term) return <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                  const key = paceRatingKey(name, term.short_label)
                  const applicable = (paceCompetenciesByTerm[term.short_label] ?? []).includes(name)
                  const rating = paceRatingEdits[key] ?? savedPaceRatings[key] ?? ""
                  return <td key={term.short_label} className="px-3 py-2 text-center">
                    {applicable
                      ? <select aria-label={`${term.display_name} PACE rating for ${name}`} className="h-9 w-full rounded-md border bg-background px-2" value={rating} onChange={(event) => setPaceRatingEdits((current) => ({ ...current, [key]: event.target.value }))}><option value="">Not rated</option>{scale.map((option) => <option value={option.value} key={option.value}>{option.value}</option>)}</select>
                      : <span className="text-muted-foreground" aria-label="Not applicable">—</span>}
                  </td>
                })()}
              </tr>
            })}</tbody>
          </table>
        </div>
        <div className="flex flex-col justify-between gap-3 border-t bg-muted/20 p-4 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{Object.values({ ...savedPaceRatings, ...paceRatingEdits }).filter(Boolean).length} of {(paceCompetenciesByTerm[activePeriod] ?? []).length} competencies rated for {activePeriod}</p><Button type="button" onClick={() => void savePaceForm()} disabled={saving}>{saving ? "Saving…" : `Save ${activePeriod} ratings`}</Button></div>
      </div> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enroll a pupil in this class before completing a PACE form.</p>}
      {paceStudent && <section className="space-y-4 rounded-lg border p-4">
        <div><h3 className="font-semibold">Term Narrative · {periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod}</h3><p className="mt-1 text-sm text-muted-foreground">{paceStudent.last_name}, {paceStudent.first_name} · Displayed on the Grade 1 progress report card.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-medium">What Your Child Can Do<textarea className="mt-1.5 min-h-28 w-full rounded-md border bg-background p-3 font-normal" value={reportFor(paceStudent.id).what_child_can_do} onChange={(event) => setNarrativeEdits((current) => ({ ...current, [reportEditKey(paceStudent.id)]: { ...current[reportEditKey(paceStudent.id)], what_child_can_do: event.target.value } }))} /></label>
          <label className="block text-sm font-medium">What Your Child Is Learning to Improve<textarea className="mt-1.5 min-h-28 w-full rounded-md border bg-background p-3 font-normal" value={reportFor(paceStudent.id).learning_to_improve} onChange={(event) => setNarrativeEdits((current) => ({ ...current, [reportEditKey(paceStudent.id)]: { ...current[reportEditKey(paceStudent.id)], learning_to_improve: event.target.value } }))} /></label>
        </div>
        <div className="flex justify-end"><Button type="button" variant="outline" disabled={savingReportId === paceStudent.id} onClick={() => void saveReport(paceStudent.id)}>{savingReportId === paceStudent.id ? "Saving…" : "Save term narrative"}</Button></div>
      </section>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>}
    {selectedClass && selectedClass.grade_level === 0 && selectedSubject && <section className="space-y-5 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Kinder developmental record · {periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Rate the selected learner against the workbook’s four developmental domains and fixed competencies.</p>
      </div>
      {pupils.length && kinderStudent ? <>
        <label className="block max-w-xl text-xs font-medium text-muted-foreground">Pupil
          <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={kinderStudent.id} onChange={(event) => { setPaceStudentId(event.target.value); setKinderRatingEdits({}) }}>
            {pupils.map((student) => <option key={student.id} value={student.id}>{student.last_name}, {student.first_name} · {student.student_number}</option>)}
          </select>
        </label>
        <div className="grid gap-2 rounded-lg bg-muted/20 p-3 text-sm sm:grid-cols-3">
          {scale.map((rating) => <div key={rating.value}><strong>{rating.value} — {rating.label}:</strong><p className="text-xs text-muted-foreground">{rating.description}</p>{rating.indicators?.map((indicator) => <p key={indicator} className="mt-1 text-xs text-muted-foreground">{indicator}</p>)}</div>)}
        </div>
        <div className="max-h-[65vh] overflow-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-primary text-xs text-primary-foreground"><tr><th className="sticky left-0 z-20 w-14 bg-primary px-3 py-3 text-center">No.</th><th className="sticky left-14 z-20 bg-primary px-4 py-3">Competency</th><th className="w-44 px-4 py-3 text-center">{activePeriod}</th></tr></thead>
            <tbody className="divide-y">
              {kinderCompetencyDomains.map((domain) => {
                const items = kinderCompetencies.filter((item) => item.domain === domain.name)
                return <Fragment key={domain.name}>
                  <tr className="bg-muted/40"><th colSpan={3} className="px-4 py-2 text-left font-semibold">{domain.name}</th></tr>
                  {items.map((item, index) => {
                    const rating = kinderRatingEdits[item.key] ?? savedKinderRatings[item.key] ?? ""
                    return <tr key={item.key} className="hover:bg-muted/20">
                      <td className="sticky left-0 z-[1] bg-card px-3 py-2 text-center text-muted-foreground">{index + 1}</td>
                      <td className="sticky left-14 z-[1] bg-card px-4 py-2">{item.competency}</td>
                      <td className="px-4 py-2"><select aria-label={`${activePeriod} rating for ${item.competency}`} className="h-9 w-full rounded-md border bg-background px-2" value={rating} onChange={(event) => setKinderRatingEdits((current) => ({ ...current, [item.key]: event.target.value }))}><option value="">Not rated</option>{scale.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}</select></td>
                    </tr>
                  })}
                </Fragment>
              })}
              {kinderCompetencies.some((item) => item.domain === "Previously entered competencies") && <Fragment>
                <tr className="bg-muted/40"><th colSpan={3} className="px-4 py-2 text-left font-semibold">Previously entered competencies</th></tr>
                {kinderCompetencies.filter((item) => item.domain === "Previously entered competencies").map((item, index) => {
                  const rating = kinderRatingEdits[item.key] ?? savedKinderRatings[item.key] ?? ""
                  return <tr key={item.key}><td className="sticky left-0 z-[1] bg-card px-3 py-2 text-center text-muted-foreground">{index + 1}</td><td className="sticky left-14 z-[1] bg-card px-4 py-2">{item.competency}</td><td className="px-4 py-2"><select aria-label={`${activePeriod} rating for ${item.competency}`} className="h-9 w-full rounded-md border bg-background px-2" value={rating} onChange={(event) => setKinderRatingEdits((current) => ({ ...current, [item.key]: event.target.value }))}><option value="">Not rated</option>{scale.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}</select></td></tr>
                })}
              </Fragment>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{Object.values({ ...savedKinderRatings, ...kinderRatingEdits }).filter(Boolean).length} of {kinderCompetencies.length} competencies rated for {activePeriod}</p><Button type="button" onClick={() => void saveKinderForm()} disabled={saving}>{saving ? "Saving…" : `Save ${activePeriod} ratings`}</Button></div>
        <section className="space-y-3 rounded-lg border p-4">
          <div><h3 className="font-semibold">Teacher&apos;s comments / remarks</h3><p className="text-sm text-muted-foreground">{kinderStudent.last_name}, {kinderStudent.first_name} · {periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod}</p></div>
          <textarea aria-label="Teacher comments and remarks" className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={reportFor(kinderStudent.id).teacher_comments} onChange={(event) => setNarrativeEdits((current) => ({ ...current, [reportEditKey(kinderStudent.id)]: { ...current[reportEditKey(kinderStudent.id)], teacher_comments: event.target.value } }))} placeholder="Record specific observations, strengths, and suggested support." />
          <div className="flex justify-end"><Button type="button" variant="outline" disabled={savingReportId === kinderStudent.id} onClick={() => void saveReport(kinderStudent.id)}>{savingReportId === kinderStudent.id ? "Saving…" : "Save term comments"}</Button></div>
        </section>
      </> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enroll pupils in this class before recording developmental progress.</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>}
  </main>
}
