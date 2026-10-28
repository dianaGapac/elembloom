"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil } from "lucide-react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type Student = { id: string; class_id: string; student_number: string; first_name: string; last_name: string; parent_guardian_name: string | null; parent_guardian_email: string | null; is_active: boolean }
type Assessment = { id: string; title: string; assessment_type: string; subject: string; grading_period: string; assessment_date: string; total_points: number; assessment_scores: { score: number | null }[] }
type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string }

async function fetchDetails(id: string) {
  const supabase = createClient()
  const [{ data: student, error }, { data: assessmentData }, { data: cls }] = await Promise.all([
    supabase.from("students").select("id, class_id, student_number, first_name, last_name, parent_guardian_name, parent_guardian_email, is_active").eq("id", id).single(),
    supabase.from("assessments").select("id, title, assessment_type, subject, grading_period, assessment_date, total_points, assessment_scores(score)").eq("class_id", (await supabase.from("students").select("class_id").eq("id", id).single()).data?.class_id ?? "").order("assessment_date", { ascending: false }),
    supabase.from("classes").select("id, grade_level, section_name, school_year").eq("id", (await supabase.from("students").select("class_id").eq("id", id).single()).data?.class_id ?? "").single(),
  ])
  if (error) throw error
  return { student: student as Student, assessments: (assessmentData ?? []) as Assessment[], classRecord: cls as ClassRecord | null }
}

export default function PupilDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error, isLoading } = useSWR(["pupil-details", id], ([, pupilId]) => fetchDetails(pupilId))
  const [period, setPeriod] = useState("all")
  const [subject, setSubject] = useState("all")
  if (isLoading) return <section className="p-8 text-sm text-muted-foreground">Loading pupil profile…</section>
  if (error || !data) return <section className="p-8"><p className="text-destructive">Unable to load this pupil profile.</p><Button asChild variant="outline" className="mt-4"><Link href="/pupils">Back to pupils</Link></Button></section>
  const { student, classRecord } = data
  const assessments = data.assessments.filter((item) => (period === "all" || item.grading_period === period) && (subject === "all" || item.subject === subject))
  const scored = data.assessments.flatMap((item) => item.assessment_scores[0]?.score == null ? [] : [{ score: Number(item.assessment_scores[0].score), total: Number(item.total_points) }])
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score / item.total, 0) / scored.length * 100) : null
  return <section className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:p-8"><Button asChild variant="ghost" className="w-fit"><Link href="/pupils"><ArrowLeft data-icon="inline-start" />Back to pupils</Link></Button><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Pupil profile</p><h1 className="mt-1 text-3xl font-bold">{student.first_name} {student.last_name}</h1><p className="mt-2 text-muted-foreground">Student no. {student.student_number} · {classRecord ? `Grade ${classRecord.grade_level} · ${classRecord.section_name}` : "Unassigned"}</p></div><Button asChild variant="outline"><Link href="/pupils"><Pencil data-icon="inline-start" />Edit pupil</Link></Button></div><div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Academic average</p><p className="mt-2 text-3xl font-bold">{average == null ? "—" : `${average}%`}</p><p className="mt-1 text-xs text-muted-foreground">Calculated from recorded scores</p></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Assessments recorded</p><p className="mt-2 text-3xl font-bold">{data.assessments.length}</p></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Parent/guardian</p><p className="mt-2 font-semibold">{student.parent_guardian_name || "Not recorded"}</p><p className="mt-1 text-sm text-muted-foreground">{student.parent_guardian_email || "No email recorded"}</p></div></div><div className="rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Assessment records</h2><p className="mt-1 text-sm text-muted-foreground">Only records saved for this pupil are shown.</p></div><div className="flex gap-2"><select aria-label="Filter grading period" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All periods</option>{[...new Set(data.assessments.map((item) => item.grading_period))].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All subjects</option>{[...new Set(data.assessments.map((item) => item.subject))].map((item) => <option key={item}>{item}</option>)}</select></div></div>{assessments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3">Assessment</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Period</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Result</th></tr></thead><tbody className="divide-y">{assessments.map((item) => { const score = item.assessment_scores[0]?.score; const percentage = score == null ? null : Number(score) / Number(item.total_points) * 100; return <tr key={item.id}><td className="px-5 py-4"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.assessment_type}</p></td><td className="px-5 py-4">{item.subject}</td><td className="px-5 py-4">{item.grading_period}</td><td className="px-5 py-4">{item.assessment_date}</td><td className="px-5 py-4">{percentage == null ? "Not recorded" : `${score}/${item.total_points} · ${Math.round(percentage)}%`}</td></tr>})}</tbody></table></div> : <div className="p-12 text-center text-sm text-muted-foreground">No assessment records match these filters.</div>}</div><div className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Attendance history</h2><p className="mt-2 text-sm text-muted-foreground">No attendance records are available for this pupil yet.</p></div></section>
}
