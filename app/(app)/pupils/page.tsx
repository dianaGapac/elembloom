"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Archive, BookOpen, Eye, Pencil, Plus, Search, Users, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type ClassRecord = { id: string; grade_level: number; section_name: string; school_year: string; is_active: boolean }
type Student = { id: string; class_id: string; student_number: string; first_name: string; last_name: string; parent_guardian_name: string | null; parent_guardian_email: string | null; email_notifications_enabled: boolean; is_active: boolean }
type Roster = { classes: ClassRecord[]; students: Student[] }

type FormState = Omit<Student, "id" | "class_id" | "is_active"> & { class_id: string }
const emptyForm: FormState = { class_id: "", student_number: "", first_name: "", last_name: "", parent_guardian_name: "", parent_guardian_email: "", email_notifications_enabled: true }

async function fetchRoster(): Promise<Roster> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("Please sign in again to load your pupil roster.")
  const [{ data: classes, error: classError }, { data: students, error: studentError }] = await Promise.all([
    supabase.from("classes").select("id, grade_level, section_name, school_year, is_active").order("grade_level").order("section_name"),
    supabase.from("students").select("id, class_id, student_number, first_name, last_name, parent_guardian_name, parent_guardian_email, email_notifications_enabled, is_active").order("last_name").order("first_name"),
  ])
  if (classError) throw classError
  if (studentError) throw studentError
  if ((classes ?? []).length === 0) {
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user) {
      const { data: demoClass, error: demoClassError } = await supabase.from("classes").insert({ teacher_id: auth.user.id, grade_level: 4, section_name: "Sampaguita", school_year: "2026–2027", subject_name: "General Education", room: "Room 4" }).select("id, grade_level, section_name, school_year, is_active").single()
      if (demoClassError) throw demoClassError
      const demoStudents = [
        { teacher_id: auth.user.id, class_id: demoClass.id, student_number: "2026-0001", first_name: "Ana", last_name: "Santos", parent_guardian_name: "Maria Santos", parent_guardian_email: "maria.santos@example.com", email_notifications_enabled: true },
        { teacher_id: auth.user.id, class_id: demoClass.id, student_number: "2026-0002", first_name: "Ben", last_name: "Reyes", parent_guardian_name: "Joel Reyes", parent_guardian_email: "joel.reyes@example.com", email_notifications_enabled: true },
        { teacher_id: auth.user.id, class_id: demoClass.id, student_number: "2026-0003", first_name: "Cara", last_name: "Dela Cruz", parent_guardian_name: "Liza Dela Cruz", parent_guardian_email: "liza.delacruz@example.com", email_notifications_enabled: true },
      ]
      const { data: seededStudents, error: seedError } = await supabase.from("students").insert(demoStudents).select("id, class_id, student_number, first_name, last_name, parent_guardian_name, parent_guardian_email, email_notifications_enabled, is_active")
      if (seedError) throw seedError
      return { classes: [demoClass], students: seededStudents ?? [] }
    }
  }
  return { classes: classes ?? [], students: students ?? [] }
}

export default function PupilsPage() {
  const { data, error, isLoading, mutate } = useSWR("pupils-roster", fetchRoster)
  const [search, setSearch] = useState("")
  const [schoolYear, setSchoolYear] = useState("all")
  const [grade, setGrade] = useState("all")
  const [classId, setClassId] = useState("all")
  const [status, setStatus] = useState("active")
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const classes = data?.classes ?? []
  const students = data?.students ?? []
  const years = [...new Set(classes.map((item) => item.school_year))]
  const visibleClasses = classes.filter((item) => item.is_active && (schoolYear === "all" || item.school_year === schoolYear))
  const filtered = useMemo(() => students.filter((student) => {
    const cls = classes.find((item) => item.id === student.class_id)
    const haystack = `${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase()
    return (status === "all" || (status === "active" ? student.is_active : !student.is_active)) && haystack.includes(search.toLowerCase()) && (schoolYear === "all" || cls?.school_year === schoolYear) && (grade === "all" || String(cls?.grade_level) === grade) && (classId === "all" || student.class_id === classId)
  }), [students, classes, status, search, schoolYear, grade, classId])

  const openForm = (student?: Student) => {
    setMessage(""); setEditingId(student?.id ?? null)
    setForm(student ? { class_id: student.class_id, student_number: student.student_number, first_name: student.first_name, last_name: student.last_name, parent_guardian_name: student.parent_guardian_name ?? "", parent_guardian_email: student.parent_guardian_email ?? "", email_notifications_enabled: student.email_notifications_enabled } : { ...emptyForm, class_id: visibleClasses[0]?.id ?? "" })
    setShowForm(true)
  }

  const savePupil = async (event: FormEvent) => {
    event.preventDefault(); setMessage("")
    if (!form.class_id || !form.student_number.trim() || !form.first_name.trim() || !form.last_name.trim()) return setMessage("Student number, name, and class are required.")
    if (form.parent_guardian_email && !/^\S+@\S+\.\S+$/.test(form.parent_guardian_email)) return setMessage("Enter a valid parent or guardian email.")
    setSaving(true)
    const supabase = createClient(); const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setMessage("Your session has expired. Please sign in again."); setSaving(false); return }
    const payload = { teacher_id: auth.user.id, class_id: form.class_id, student_number: form.student_number.trim(), first_name: form.first_name.trim(), last_name: form.last_name.trim(), parent_guardian_name: (form.parent_guardian_name ?? "").trim() || null, parent_guardian_email: (form.parent_guardian_email ?? "").trim() || null, email_notifications_enabled: form.email_notifications_enabled }
    const result = editingId ? await supabase.from("students").update(payload).eq("id", editingId) : await supabase.from("students").insert(payload)
    if (result.error) setMessage(result.error.code === "23505" ? "That student number is already used by this teacher." : result.error.message)
    else { setShowForm(false); await mutate() }
    setSaving(false)
  }

  const archive = async (student: Student) => {
    if (!window.confirm(`Archive ${student.first_name} ${student.last_name}? Their records will be preserved.`)) return
    const { error: archiveError } = await createClient().from("students").update({ is_active: false }).eq("id", student.id)
    if (archiveError) setMessage(archiveError.message); else await mutate()
  }

  if (isLoading) return <section className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading your pupil roster…</p></section>
  if (error) return <section className="mx-auto max-w-6xl p-6"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Unable to load pupils</h1><p className="mt-2 text-sm text-muted-foreground">{error.message}</p></div></section>

  return <section className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Learner records</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Pupils</h1><p className="mt-2 text-muted-foreground">Manage your pupils and view their academic records.</p></div><Button onClick={() => openForm()} disabled={!visibleClasses.length}><Plus data-icon="inline-start" />Add pupil</Button></div>
    {!visibleClasses.length && <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No active classes found. <Link className="font-medium text-primary underline" href="/settings">Add a class in Settings → My Classes</Link> before adding pupils.</div>}
    <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4"><label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Search data-icon="inline-start" /><span className="sr-only">Search by pupil name or student number</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or student number" className="min-w-0 flex-1 bg-transparent outline-none" /></label><select aria-label="School year" value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All school years</option>{years.map((year) => <option key={year}>{year}</option>)}</select><select aria-label="Grade level" value={grade} onChange={(event) => setGrade(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All grades</option>{[...new Set(classes.map((item) => item.grade_level))].sort().map((item) => <option key={item} value={item}>Grade {item}</option>)}</select><select aria-label="Class or section" value={classId} onChange={(event) => setClassId(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="all">All classes</option>{visibleClasses.map((item) => <option key={item.id} value={item.id}>Grade {item.grade_level} – {item.section_name}</option>)}</select><select aria-label="Pupil status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="active">Active pupils</option><option value="archived">Archived pupils</option><option value="all">All statuses</option></select></div>
    <div className="overflow-hidden rounded-xl border bg-card"><div className="border-b p-5"><h2 className="font-semibold">Pupil roster</h2><p className="mt-1 text-sm text-muted-foreground">{filtered.length} record{filtered.length === 1 ? "" : "s"}</p></div>{filtered.length === 0 ? <div className="flex flex-col items-center gap-2 p-12 text-center"><Users className="text-muted-foreground" /><p className="font-medium">No pupils found</p><p className="text-sm text-muted-foreground">Try changing the filters or add a pupil to an active class.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Student number</th><th className="px-5 py-3">Pupil name</th><th className="px-5 py-3">Grade and section</th><th className="px-5 py-3">Parent/guardian</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{filtered.map((student) => { const cls = classes.find((item) => item.id === student.class_id); return <tr key={student.id}><td className="px-5 py-4 font-medium">{student.student_number}</td><td className="px-5 py-4">{student.last_name}, {student.first_name}</td><td className="px-5 py-4 text-muted-foreground">{cls ? `Grade ${cls.grade_level} · ${cls.section_name}` : "Unassigned"}</td><td className="px-5 py-4 text-muted-foreground">{student.parent_guardian_name || "Not recorded"}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button render={<Link href={`/pupils/${student.id}`} />} variant="ghost" size="sm"><Eye data-icon="inline-start" />View</Button><Button variant="ghost" size="sm" onClick={() => openForm(student)}><Pencil data-icon="inline-start" />Edit</Button>{student.is_active && <Button variant="ghost" size="sm" onClick={() => archive(student)}><Archive data-icon="inline-start" />Archive</Button>}</div></td></tr>})}</tbody></table></div>}</div>
    {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="dialog" aria-modal="true"><form onSubmit={savePupil} className="w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{editingId ? "Edit pupil" : "Add pupil"}</h2><p className="mt-1 text-sm text-muted-foreground">Required fields are marked by the form validation.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{(["student_number","first_name","last_name","parent_guardian_name"] as const).map((key) => <label key={key} className="grid gap-1.5 text-sm font-medium">{key === "student_number" ? "Student number" : key === "first_name" ? "First name" : key === "last_name" ? "Last name" : "Parent/guardian name"}<input required={key !== "parent_guardian_name"} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-ring" /></label>)}<label className="grid gap-1.5 text-sm font-medium">Grade and section<select required value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Select class</option>{visibleClasses.map((item) => <option key={item.id} value={item.id}>Grade {item.grade_level} – {item.section_name} ({item.school_year})</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium">Parent/guardian email<input type="email" value={form.parent_guardian_email ?? ""} onChange={(event) => setForm({ ...form, parent_guardian_email: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-ring" /></label></div><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.email_notifications_enabled} onChange={(event) => setForm({ ...form, email_notifications_enabled: event.target.checked })} />Enable parent email notifications</label>{message && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{message}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save pupil"}</Button></div></form></div>}
  </section>
}
