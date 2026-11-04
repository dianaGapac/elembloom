"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination"
import { earlyLearningPolicies, gradeLevelLabel, gradeOnePaceCompetenciesForSubject, gradingPeriodsForGrade } from "@/lib/academic-structure"

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
  const [competency, setCompetency] = useState("")
  const [ratings, setRatings] = useState<Record<string, string>>({})
  const [paceRatingEdits, setPaceRatingEdits] = useState<Record<string, string>>({})
  const [narrativeEdits, setNarrativeEdits] = useState<Record<string, Partial<EarlyLearningReport>>>({})
  const [narrativeStudentId, setNarrativeStudentId] = useState<string | null>(null)
  const [savingReportId, setSavingReportId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)

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
  const pagePupils = pupils.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  const savedRecords = data.records.filter((row) => row.class_id === selectedClass?.id && row.subject_offering_id === selectedSubject?.id && row.grading_period === activePeriod)
  const savedCompetencies = [...new Set(savedRecords.map((record) => record.competency))].sort((a, b) => a.localeCompare(b))
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
  const selectedCompetency = competency.trim()
  const savedRatings = Object.fromEntries(savedRecords.filter((row) => row.competency === selectedCompetency).map((row) => [row.student_id, row.rating]))
  const currentRatings = { ...savedRatings, ...ratings }
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

  async function saveRatings() {
    if (!selectedClass || !selectedSubject || !selectedCompetency) { setMessage("Choose a class and subject, then enter a competency."); return }
    const entries = pupils.flatMap((student) => {
      const rating = currentRatings[student.id]
      return rating ? [{ class_id: selectedClass.id, student_id: student.id, subject_offering_id: selectedSubject.id, grading_period: activePeriod, competency: selectedCompetency, rating }] : []
    })
    if (!entries.length) { setMessage("Select a rating for at least one pupil."); return }
    if (entries.some((entry) => !scale.some((rating) => rating.value === entry.rating))) { setMessage("Choose a rating from the selected grade’s scale."); return }
    setSaving(true)
    setMessage("")
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) { setMessage(authError?.message ?? "Please sign in again."); setSaving(false); return }
    const rows = entries.map((entry) => ({ ...entry, teacher_id: auth.user.id }))
    const { error: saveError } = await supabase.from("competency_records").upsert(rows, {
      onConflict: "teacher_id,class_id,student_id,subject_offering_id,grading_period,competency",
    })
    if (saveError) setMessage(saveError.message)
    else { setMessage("Competency ratings saved."); setRatings({}); await mutate() }
    setSaving(false)
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

  return <main className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <header>
      <p className="text-sm font-medium text-primary">Progress-based records</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Kinder &amp; Grade 1 Competencies</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{policy.description}</p>
    </header>
    <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-3">
      <label className="text-xs font-medium text-muted-foreground">Class<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={selectedClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setSubjectId(""); setPaceStudentId(""); setRatings({}); setPaceRatingEdits({}) }}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name} · {item.school_year}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">Learning area<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={selectedSubject?.id ?? ""} onChange={(event) => { setSubjectId(event.target.value); setRatings({}); setPaceRatingEdits({}) }}><option value="">Choose learning area</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">{selectedClass?.grade_level === 1 ? "Narrative term" : "Term"}<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={activePeriod} onChange={(event) => { setPeriod(event.target.value); setRatings({}) }}>{periods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label>
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
    {selectedClass && selectedClass.grade_level === 0 && selectedSubject && <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Kinder · {selectedSubject.subject_name} · {periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Rating scale: {scale.map((rating) => `${rating.value} — ${rating.label}`).join(" · ")}</p>
      </div>
      <label className="block text-sm font-medium">Kinder developmental competency
        <input list="saved-competencies" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={competency} onChange={(event) => { setCompetency(event.target.value); setRatings({}) }} placeholder="Enter a skill or select a previously used one" /><datalist id="saved-competencies">{savedCompetencies.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
      {pupils.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Pupil</th><th className="px-4 py-3">Student number</th><th className="px-4 py-3">Progress rating</th><th className="px-4 py-3">Term report</th></tr></thead><tbody className="divide-y">{pagePupils.map((student) => <tr key={student.id}><td className="px-4 py-3 font-medium">{student.last_name}, {student.first_name}</td><td className="px-4 py-3 text-muted-foreground">{student.student_number}</td><td className="px-4 py-3"><select aria-label={`Progress rating for ${student.first_name} ${student.last_name}`} className="h-9 w-full max-w-56 rounded-md border bg-background px-2" value={currentRatings[student.id] ?? ""} onChange={(event) => setRatings((current) => ({ ...current, [student.id]: event.target.value }))}><option value="" disabled={Boolean(savedRatings[student.id])}>Not rated</option>{scale.map((rating) => <option value={rating.value} key={rating.value}>{rating.value} — {rating.label}</option>)}</select></td><td className="px-4 py-3"><Button type="button" size="sm" variant="outline" onClick={() => setNarrativeStudentId(student.id)}>{selectedClass.grade_level === 1 ? "Edit narrative" : "Teacher comments"}</Button></td></tr>)}</tbody></table><Pagination page={page} totalItems={pupils.length} onPageChange={setPage} /></div> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enroll pupils in this class before recording competency progress.</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">{scale.map((rating) => <p key={rating.value}><strong>{rating.value} — {rating.label}:</strong> {rating.description}</p>)}</div>
      <div className="flex justify-end"><Button onClick={() => void saveRatings()} disabled={saving || !pupils.length}>{saving ? "Saving…" : "Save progress ratings"}</Button></div>
    </section>}
    {selectedClass?.grade_level === 0 && narrativeStudentId && (() => {
      const student = pupils.find((item) => item.id === narrativeStudentId)
      if (!student) return null
      const report = reportFor(student.id)
      return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <section role="dialog" aria-modal="true" aria-labelledby="term-report-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4"><div><h2 id="term-report-title" className="text-xl font-semibold">{selectedClass.grade_level === 1 ? "Grade 1 term narrative (PACE / progress report)" : "Kinder teacher comments"}</h2><p className="mt-1 text-sm text-muted-foreground">{student.last_name}, {student.first_name} · {periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod}</p></div><Button type="button" variant="ghost" onClick={() => setNarrativeStudentId(null)}>Close</Button></div>
          <div className="mt-5 space-y-4">
            {selectedClass.grade_level === 1 ? <>
              <label className="block text-sm font-medium">What Your Child Can Do<textarea className="mt-1.5 min-h-28 w-full rounded-md border bg-background p-3 font-normal" value={report.what_child_can_do} onChange={(event) => setNarrativeEdits((current) => ({ ...current, [reportEditKey(student.id)]: { ...current[reportEditKey(student.id)], what_child_can_do: event.target.value } }))} /></label>
              <label className="block text-sm font-medium">What Your Child Is Learning to Improve<textarea className="mt-1.5 min-h-28 w-full rounded-md border bg-background p-3 font-normal" value={report.learning_to_improve} onChange={(event) => setNarrativeEdits((current) => ({ ...current, [reportEditKey(student.id)]: { ...current[reportEditKey(student.id)], learning_to_improve: event.target.value } }))} /></label>
            </> : <label className="block text-sm font-medium">Teacher comments / remarks<textarea className="mt-1.5 min-h-32 w-full rounded-md border bg-background p-3 font-normal" value={report.teacher_comments} onChange={(event) => setNarrativeEdits((current) => ({ ...current, [reportEditKey(student.id)]: { ...current[reportEditKey(student.id)], teacher_comments: event.target.value } }))} /></label>}
            {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setNarrativeStudentId(null)}>Cancel</Button><Button type="button" disabled={savingReportId === student.id} onClick={() => void saveReport(student.id)}>{savingReportId === student.id ? "Saving…" : "Save term report"}</Button></div>
          </div>
        </section>
      </div>
    })()}
  </main>
}
