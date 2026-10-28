"use client"

import { FormEvent, useMemo, useState } from "react"
import useSWR from "swr"
import { BookOpen, Plus, Search, Users, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string; subject_name: string | null; room: string | null }
type Student = { id: string; class_id: string; student_number: string; first_name: string; last_name: string; parent_guardian_name: string | null; parent_guardian_email: string | null }
type RosterData = { classes: ClassRecord[]; students: Student[] }

const fetchRoster = async (): Promise<RosterData> => {
  const supabase = createClient()
  const [{ data: classes, error: classesError }, { data: students, error: studentsError }] = await Promise.all([
    supabase.from("classes").select("id, grade_level, section_name, school_year, subject_name, room").eq("is_active", true).order("grade_level").order("section_name"),
    supabase.from("students").select("id, class_id, student_number, first_name, last_name, parent_guardian_name, parent_guardian_email").eq("is_active", true).order("last_name").order("first_name"),
  ])
  if (classesError) throw new Error(classesError.message)
  if (studentsError) throw new Error(studentsError.message)

  const { data: auth } = await supabase.auth.getUser()
  if (auth.user && (classes ?? []).length === 0) {
    const { data: createdClass, error: createClassError } = await supabase.from("classes").insert({
      teacher_id: auth.user.id,
      grade_level: 4,
      section_name: "Sampaguita",
      school_year: "2026–2027",
      subject_name: "General Education",
      room: "Room 4",
    }).select("id, grade_level, section_name, school_year, subject_name, room").single()
    if (createClassError) throw new Error(createClassError.message)
    const demoStudents = [
      { teacher_id: auth.user.id, class_id: createdClass.id, student_number: "2026-0001", first_name: "Ana", last_name: "Santos", parent_guardian_name: "Maria Santos", parent_guardian_email: "maria.santos@example.com" },
      { teacher_id: auth.user.id, class_id: createdClass.id, student_number: "2026-0002", first_name: "Ben", last_name: "Reyes", parent_guardian_name: "Joel Reyes", parent_guardian_email: "joel.reyes@example.com" },
      { teacher_id: auth.user.id, class_id: createdClass.id, student_number: "2026-0003", first_name: "Cara", last_name: "Dela Cruz", parent_guardian_name: "Liza Dela Cruz", parent_guardian_email: "liza.delacruz@example.com" },
    ]
    const { data: createdStudents, error: createStudentsError } = await supabase.from("students").insert(demoStudents).select("id, class_id, student_number, first_name, last_name, parent_guardian_name, parent_guardian_email")
    if (createStudentsError) throw new Error(createStudentsError.message)
    return { classes: [createdClass], students: createdStudents ?? [] }
  }
  return { classes: classes ?? [], students: students ?? [] }
}

export default function PupilsPage() {
  const { data, error, isLoading, mutate } = useSWR("teacher-roster", fetchRoster)
  const [selectedClass, setSelectedClass] = useState<string>("")
  const [query, setQuery] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [form, setForm] = useState({ student_number: "", first_name: "", last_name: "", parent_guardian_name: "", parent_guardian_email: "" })

  const classes = data?.classes ?? []
  const activeClass = classes.find((item) => item.id === (selectedClass || classes[0]?.id))
  const students = useMemo(() => (data?.students ?? []).filter((student) => {
    const matchesClass = activeClass ? student.class_id === activeClass.id : true
    const text = `${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase()
    return matchesClass && text.includes(query.toLowerCase())
  }), [activeClass, data?.students, query])

  const addStudent = async (event: FormEvent) => {
    event.preventDefault()
    setFormError("")
    if (!activeClass) return setFormError("Select a class before adding a pupil.")
    if (!form.student_number.trim() || !form.first_name.trim() || !form.last_name.trim()) return setFormError("Student number, first name, and last name are required.")
    if (form.parent_guardian_email && !/^\S+@\S+\.\S+$/.test(form.parent_guardian_email)) return setFormError("Enter a valid guardian email address.")
    setSaving(true)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setFormError("Your session has expired. Please sign in again."); setSaving(false); return }
    const { error: insertError } = await supabase.from("students").insert({ teacher_id: auth.user.id, class_id: activeClass.id, student_number: form.student_number.trim(), first_name: form.first_name.trim(), last_name: form.last_name.trim(), parent_guardian_name: form.parent_guardian_name.trim() || null, parent_guardian_email: form.parent_guardian_email.trim() || null })
    if (insertError) setFormError(insertError.code === "23505" ? "That student number is already in use." : insertError.message)
    else { setForm({ student_number: "", first_name: "", last_name: "", parent_guardian_name: "", parent_guardian_email: "" }); setShowForm(false); await mutate() }
    setSaving(false)
  }

  if (isLoading) return <section className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading your pupil roster…</p></section>
  if (error) return <section className="mx-auto max-w-6xl p-6"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Unable to load pupils</h1><p className="mt-2 text-sm text-muted-foreground">{error.message}</p></div></section>

  return <section className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Learner records</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Pupils</h1><p className="mt-2 text-muted-foreground">Manage pupils across your active classes.</p></div><Button onClick={() => { setFormError(""); setShowForm(true) }}><Plus data-icon="inline-start" />Add pupil</Button></div>
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]"><aside className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BookOpen data-icon="inline-start" />Classes</div>{classes.length === 0 ? <p className="text-sm text-muted-foreground">No active classes yet.</p> : <div className="flex flex-col gap-2">{classes.map((item) => <button key={item.id} onClick={() => setSelectedClass(item.id)} className={`rounded-lg px-3 py-3 text-left text-sm transition-colors ${item.id === (selectedClass || classes[0]?.id) ? "bg-secondary font-semibold text-secondary-foreground" : "hover:bg-muted"}`}><span className="block">Grade {item.grade_level} · {item.section_name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.school_year} · {item.room || "No room"}</span></button>)}</div>}</aside>
      <div className="rounded-xl border bg-card"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">{activeClass ? `Grade ${activeClass.grade_level} · ${activeClass.section_name}` : "All pupils"}</h2><p className="mt-1 text-sm text-muted-foreground">{students.length} active pupil{students.length === 1 ? "" : "s"}</p></div><label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Search data-icon="inline-start" /><span className="sr-only">Search pupils</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pupils" className="min-w-0 bg-transparent outline-none placeholder:text-muted-foreground" /></label></div>{students.length === 0 ? <div className="flex flex-col items-center gap-2 p-12 text-center"><Users className="text-muted-foreground" /><p className="font-medium">No pupils found</p><p className="text-sm text-muted-foreground">Add a pupil to start building this roster.</p></div> : <div className="divide-y">{students.map((student) => <div key={student.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{student.last_name}, {student.first_name}</p><p className="text-sm text-muted-foreground">Student no. {student.student_number}</p></div><p className="text-sm text-muted-foreground">{student.parent_guardian_name || "No guardian recorded"}</p></div>)}</div>}</div></div>
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="dialog" aria-modal="true" aria-labelledby="add-pupil-title"><form onSubmit={addStudent} className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="add-pupil-title" className="text-xl font-semibold">Add pupil</h2><p className="mt-1 text-sm text-muted-foreground">Adding to {activeClass ? `Grade ${activeClass.grade_level} · ${activeClass.section_name}` : "your class"}.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{([["student_number","Student number"],["first_name","First name"],["last_name","Last name"],["parent_guardian_name","Parent or guardian"]] as const).map(([key, label]) => <label key={key} className="grid gap-1.5 text-sm font-medium">{label}<input required={key === "student_number" || key === "first_name" || key === "last_name"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-ring" /></label>)}<label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Guardian email<input type="email" value={form.parent_guardian_email} onChange={(event) => setForm({ ...form, parent_guardian_email: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-ring" /></label></div>{formError && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{formError}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save pupil"}</Button></div></form></div>}
  </section>
}
