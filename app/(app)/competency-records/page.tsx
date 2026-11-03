"use client"

import { useState } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination"
import { gradeLevelLabel, periodOptionsForSchoolYear } from "@/lib/academic-structure"

const supabase = createClient()
const ratingScales: Record<number, string[]> = {
  0: ["CO", "DV", "BG"],
  1: ["A", "B", "D", "E"],
}

const fetcher = async () => {
  const [classes, subjects, enrollments, students, records] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year").eq("is_active", true).in("grade_level", [0, 1]).order("grade_level").order("section_name"),
    supabase.from("class_subjects").select("id,class_id,subject_name").eq("is_active", true),
    supabase.from("class_enrollments").select("class_id,student_id,status").eq("status", "active"),
    supabase.from("students").select("id,student_number,first_name,last_name").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("competency_records").select("id,class_id,student_id,subject_offering_id,grading_period,competency,rating,notes"),
  ])
  for (const result of [classes, subjects, enrollments, students, records]) if (result.error) throw new Error(result.error.message)
  return { classes: classes.data ?? [], subjects: subjects.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [], records: records.data ?? [] }
}

export default function CompetencyRecordsPage() {
  const { data, error, isLoading, mutate } = useSWR("competency-records", fetcher)
  const [classId, setClassId] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [period, setPeriod] = useState("T1")
  const [competency, setCompetency] = useState("")
  const [ratings, setRatings] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)

  if (isLoading) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading competency records…</p></main>
  if (error || !data) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-destructive">Unable to load competency records.</p></main>

  const selectedClass = data.classes.find((item) => item.id === classId) ?? data.classes[0]
  const subjects = data.subjects.filter((item) => item.class_id === selectedClass?.id)
  const selectedSubject = subjects.find((item) => item.id === subjectId) ?? subjects[0]
  const periods = periodOptionsForSchoolYear(selectedClass?.school_year)
  const activePeriod = periods.some((item) => item.short_label === period) ? period : periods[0]?.short_label ?? "T1"
  const pupils = data.students.filter((student) => data.enrollments.some((row) => row.class_id === selectedClass?.id && row.student_id === student.id))
  const pagePupils = pupils.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  const savedRecords = data.records.filter((row) => row.class_id === selectedClass?.id && row.subject_offering_id === selectedSubject?.id && row.grading_period === activePeriod)
  const savedCompetencies = [...new Set(savedRecords.map((record) => record.competency))].sort((a, b) => a.localeCompare(b))
  const scale = ratingScales[selectedClass?.grade_level ?? 0] ?? []
  const selectedCompetency = competency.trim()
  const savedRatings = Object.fromEntries(savedRecords.filter((row) => row.competency === selectedCompetency).map((row) => [row.student_id, row.rating]))
  const currentRatings = { ...savedRatings, ...ratings }

  async function saveRatings() {
    if (!selectedClass || !selectedSubject || !selectedCompetency) { setMessage("Choose a class and subject, then enter a competency."); return }
    const entries = pupils.flatMap((student) => {
      const rating = currentRatings[student.id]
      return rating ? [{ class_id: selectedClass.id, student_id: student.id, subject_offering_id: selectedSubject.id, grading_period: activePeriod, competency: selectedCompetency, rating }] : []
    })
    if (!entries.length) { setMessage("Select a rating for at least one pupil."); return }
    if (entries.some((entry) => !scale.includes(entry.rating))) { setMessage("Choose a rating from the selected grade’s scale."); return }
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

  return <main className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <header>
      <p className="text-sm font-medium text-primary">Progress-based records</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Kinder &amp; Grade 1 Competencies</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Record template-aligned categorical progress. These ratings are not converted into numeric subject grades.</p>
    </header>
    <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-3">
      <label className="text-xs font-medium text-muted-foreground">Class<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={selectedClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setSubjectId(""); setRatings({}) }}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{gradeLevelLabel(item.grade_level)} – {item.section_name} · {item.school_year}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">Learning area<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={selectedSubject?.id ?? ""} onChange={(event) => { setSubjectId(event.target.value); setRatings({}) }}><option value="">Choose learning area</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.subject_name}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">Term<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={activePeriod} onChange={(event) => { setPeriod(event.target.value); setRatings({}) }}>{periods.map((item) => <option key={item.short_label} value={item.short_label}>{item.display_name}</option>)}</select></label>
    </section>
    {selectedClass && selectedSubject && <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{gradeLevelLabel(selectedClass.grade_level)} · {selectedSubject.subject_name} · {periods.find((item) => item.short_label === activePeriod)?.display_name ?? activePeriod}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Rating scale: {scale.join(" / ")}</p>
      </div>
      <label className="block text-sm font-medium">Competency or progress area<input list="saved-competencies" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={competency} onChange={(event) => { setCompetency(event.target.value); setRatings({}) }} placeholder="Enter a skill or select a previously used one" /><datalist id="saved-competencies">{savedCompetencies.map((name) => <option key={name} value={name} />)}</datalist></label>
      {pupils.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Pupil</th><th className="px-4 py-3">Student number</th><th className="px-4 py-3">Progress rating</th></tr></thead><tbody className="divide-y">{pagePupils.map((student) => <tr key={student.id}><td className="px-4 py-3 font-medium">{student.last_name}, {student.first_name}</td><td className="px-4 py-3 text-muted-foreground">{student.student_number}</td><td className="px-4 py-3"><select aria-label={`Progress rating for ${student.first_name} ${student.last_name}`} className="h-9 w-full max-w-48 rounded-md border bg-background px-2" value={currentRatings[student.id] ?? ""} onChange={(event) => setRatings((current) => ({ ...current, [student.id]: event.target.value }))}><option value="" disabled={Boolean(savedRatings[student.id])}>Not rated</option>{scale.map((rating) => <option key={rating}>{rating}</option>)}</select></td></tr>)}</tbody></table><Pagination page={page} totalItems={pupils.length} onPageChange={setPage} /></div> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enroll pupils in this class before recording competency progress.</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <div className="flex justify-end"><Button onClick={() => void saveRatings()} disabled={saving || !pupils.length}>{saving ? "Saving…" : "Save progress ratings"}</Button></div>
    </section>}
  </main>
}
