"use client"

import Link from "next/link"
import useSWR from "swr"
import { useMemo, useState } from "react"
import { Plus, Search, Users, BookOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

const supabase = createClient()
const fetcher = async () => {
  const [classes, subjects, enrollments, students] = await Promise.all([
    supabase.from("classes").select("id,grade_level,section_name,school_year,room,is_active").eq("is_active", true).order("grade_level").order("section_name"),
    supabase.from("class_subjects").select("id,class_id,subject_name,teacher_name,day_of_week,start_time,end_time,room,is_active").eq("is_active", true),
    supabase.from("class_enrollments").select("id,class_id,student_id,status").eq("status", "active"),
    supabase.from("students").select("id,first_name,last_name,student_number,class_id").eq("is_active", true).order("last_name"),
  ])
  for (const result of [classes, subjects, enrollments, students]) if (result.error) throw new Error(result.error.message)
  return { classes: classes.data ?? [], subjects: subjects.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [] }
}

export default function ClassesPage() {
  const { data, error, isLoading, mutate } = useSWR("classes-management", fetcher)
  const [query, setQuery] = useState("")
  const [gradeFilter, setGradeFilter] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [form, setForm] = useState({ sectionName: "", gradeLevel: "1", schoolYear: "2026–2027", room: "", subjects: "Mathematics", studentIds: [] as string[] })

  const classes = data?.classes ?? []
  const filtered = useMemo(() => classes.filter((item) => `${item.section_name} ${item.room}`.toLowerCase().includes(query.toLowerCase()) && (gradeFilter === "all" || String(item.grade_level) === gradeFilter)), [classes, query, gradeFilter])
  const grades = [...new Set(classes.map((item) => item.grade_level))].sort((a, b) => a - b)

  async function createClass() {
    if (!form.sectionName.trim() || !form.subjects.trim()) return
    setSaving(true); setMessage("")
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setMessage("Please sign in again before creating a class."); setSaving(false); return }
    const { data: created, error: classError } = await supabase.from("classes").insert({ teacher_id: auth.user.id, section_name: form.sectionName.trim(), grade_level: Number(form.gradeLevel), school_year: form.schoolYear, room: form.room.trim() || null, is_active: true }).select("id").single()
    if (classError || !created) { setMessage(classError?.message ?? "Class could not be created."); setSaving(false); return }
    const subjects = form.subjects.split(",").map((subject) => subject.trim()).filter(Boolean)
    const { error: subjectError } = await supabase.from("class_subjects").insert(subjects.map((subject) => ({ teacher_id: auth.user.id, class_id: created.id, subject_name: subject, room: form.room.trim() || null })))
    const { error: enrollmentError } = form.studentIds.length ? await supabase.from("class_enrollments").insert(form.studentIds.map((studentId) => ({ teacher_id: auth.user.id, class_id: created.id, student_id: studentId }))) : { error: null }
    if (subjectError || enrollmentError) setMessage(subjectError?.message ?? enrollmentError?.message ?? "Class created, but related records need review.")
    else { setMessage("Class created."); setModalOpen(false); setForm({ sectionName: "", gradeLevel: "1", schoolYear: "2026–2027", room: "", subjects: "Mathematics", studentIds: [] }); await mutate() }
    setSaving(false)
  }

  async function archiveClass(id: string) {
    if (!window.confirm("Archive this class? Existing assessments and records will remain available.")) return
    await supabase.from("classes").update({ is_active: false }).eq("id", id)
    await mutate()
  }

  if (isLoading) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-muted-foreground">Loading classes…</p></main>
  if (error) return <main className="mx-auto max-w-7xl p-6"><p className="text-sm text-destructive">Unable to load classes.</p></main>

  return <main className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Academic organization</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">My Classes</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Organize sections, subject offerings, and pupil membership from one workspace.</p></div><Button onClick={() => setModalOpen(true)}><Plus data-icon="inline-start" />Create class</Button></header>
    {message && <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</p>}
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search classes</span><input className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Search sections or rooms" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="all">All grade levels</option>{grades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></section>
    {filtered.length === 0 ? <section className="rounded-xl border border-dashed p-12 text-center"><BookOpen className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No classes match your filters</h2><p className="mt-1 text-sm text-muted-foreground">Create a class to start organizing pupils and subjects.</p></section> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => { const subjectRows = data?.subjects.filter((subject) => subject.class_id === item.id) ?? []; const pupilCount = data?.enrollments.filter((enrollment) => enrollment.class_id === item.id).length ?? 0; return <article key={item.id} className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><Link href={`/classes/${item.id}`} className="min-w-0"><p className="text-xs font-medium text-primary">Grade {item.grade_level}</p><h2 className="mt-1 truncate text-lg font-semibold group-hover:text-primary">{item.section_name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.school_year} · {item.room || "Room not assigned"}</p></Link><details className="relative"><summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted"><MoreHorizontal className="size-4" /><span className="sr-only">Class actions</span></summary><div className="absolute right-0 z-10 mt-2 w-36 rounded-lg border bg-popover p-1 shadow-lg"><Link href={`/classes/${item.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"><Pencil className="size-3.5" />Manage</Link><button type="button" onClick={() => void archiveClass(item.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-muted"><Trash2 className="size-3.5" />Archive</button></div></details></div><div className="mt-5 flex items-center gap-5 text-sm"><span className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{pupilCount} pupils</span><span className="flex items-center gap-2"><BookOpen className="size-4 text-muted-foreground" />{subjectRows.length} subjects</span></div><div className="mt-4 flex flex-wrap gap-1.5">{subjectRows.slice(0, 3).map((subject) => <span key={subject.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">{subject.subject_name}</span>)}{subjectRows.length > 3 && <span className="rounded-full bg-muted px-2.5 py-1 text-xs">+{subjectRows.length - 3} more</span>}</div><Link href={`/classes/${item.id}`} className="mt-5 inline-flex text-sm font-medium text-primary hover:underline">Open class workspace</Link></article> })}</section>}
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false) }}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="create-class-title"><div className="flex items-start justify-between"><div><h2 id="create-class-title" className="text-xl font-semibold">Create class</h2><p className="mt-1 text-sm text-muted-foreground">Set up the section first. You can manage subjects and enrollment after saving.</p></div><Button variant="ghost" onClick={() => setModalOpen(false)}>Close</Button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Section name<input className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-primary/30" value={form.sectionName} onChange={(event) => setForm({ ...form, sectionName: event.target.value })} placeholder="Sampaguita" /></label><label className="text-sm font-medium">Grade level<select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.gradeLevel} onChange={(event) => setForm({ ...form, gradeLevel: event.target.value })}>{[1,2,3,4,5,6].map((grade) => <option key={grade}>{grade}</option>)}</select></label><label className="text-sm font-medium">School year<input className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.schoolYear} onChange={(event) => setForm({ ...form, schoolYear: event.target.value })} /></label><label className="text-sm font-medium">Room<input className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="Room 101" /></label><label className="text-sm font-medium sm:col-span-2">Subjects<input list="subject-options" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal" value={form.subjects} onChange={(event) => setForm({ ...form, subjects: event.target.value })} placeholder="Mathematics, Science, English" /><datalist id="subject-options"><option value="Mathematics" /><option value="Science" /><option value="English" /><option value="Filipino" /><option value="Araling Panlipunan" /><option value="MAPEH" /><option value="Edukasyon sa Pagpapakatao" /><option value="Technology and Livelihood Education" /></datalist><span className="mt-1 block text-xs font-normal text-muted-foreground">Choose a common subject or enter a custom one. Separate multiple subjects with commas.</span></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button disabled={saving || !form.sectionName.trim() || !form.subjects.trim()} onClick={() => void createClass()}>{saving ? "Creating…" : "Create class"}</Button></div></div></div>}
  </main>
}
