"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ButtonLoading, PageLoading } from "@/components/loading-states"
import { AlertCircle, Check, Pencil, Plus, School, Trash2 } from "lucide-react"

type ClassItem = { id: string; grade_level: number; section_name: string; school_year: string; subject_name: string | null; room: string | null }
const years = ["2025–2026", "2026–2027", "2027–2028", "2028–2029", "2029–2030"]
const blank = { grade_level: 1, section_name: "", school_year: "2026–2027", subject_name: "", room: "" }

export default function ClassesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function loadClasses() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: loadError } = await supabase.from("classes").select("id,grade_level,section_name,school_year,subject_name,room").eq("teacher_id", user.id).eq("is_active", true).order("grade_level").order("section_name")
    if (loadError) setError(loadError.message)
    else setClasses(data ?? [])
    setLoading(false)
  }
  useEffect(() => { loadClasses() }, [])
  function startCreate() { setEditingId(null); setForm(blank); setMessage(""); setError(""); setOpen(true) }
  function startEdit(item: ClassItem) { setEditingId(item.id); setForm({ grade_level: item.grade_level, section_name: item.section_name, school_year: item.school_year, subject_name: item.subject_name ?? "", room: item.room ?? "" }); setMessage(""); setError(""); setOpen(true) }
  async function saveClass(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("")
    const section = form.section_name.trim()
    if (section.length < 2) { setError("Enter a section name with at least 2 characters."); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError("Your session has expired. Please sign in again."); setSaving(false); return }
    const duplicate = await supabase.from("classes").select("id").eq("teacher_id", user.id).eq("grade_level", form.grade_level).eq("section_name", section).eq("school_year", form.school_year).eq("is_active", true).neq("id", editingId ?? "00000000-0000-0000-0000-000000000000").maybeSingle()
    if (duplicate.error) { setError(duplicate.error.message); setSaving(false); return }
    if (duplicate.data) { setError("You already have an active class with these details."); setSaving(false); return }
    const values = { teacher_id: user.id, grade_level: form.grade_level, section_name: section, school_year: form.school_year, subject_name: form.subject_name.trim() || null, room: form.room.trim() || null, is_active: true }
    const result = editingId ? await supabase.from("classes").update(values).eq("id", editingId).eq("teacher_id", user.id).select("id").maybeSingle() : await supabase.from("classes").insert(values).select("id").single()
    if (result.error || !result.data) setError(result.error?.message ?? "The class could not be saved. Refresh and try again.")
    else { setOpen(false); setMessage(editingId ? "Class updated successfully." : "Class added successfully."); await loadClasses() }
    setSaving(false)
  }
  async function archive(item: ClassItem) {
    if (!window.confirm(`Archive Grade ${item.grade_level} – ${item.section_name}?`)) return
    const { data, error: archiveError } = await supabase.from("classes").update({ is_active: false }).eq("id", item.id).eq("teacher_id", (await supabase.auth.getUser()).data.user?.id).select("id").maybeSingle()
    if (archiveError || !data) setError(archiveError?.message ?? "The class could not be archived.")
    else { setMessage("Class archived."); await loadClasses() }
  }
  if (loading) return <PageLoading message="Loading your classes…" />
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-5 lg:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Teacher workspace</p><h1 className="mt-1 text-3xl font-bold tracking-tight">My Classes</h1><p className="mt-2 text-muted-foreground">Create and maintain the classes you teach.</p></div><Button onClick={startCreate}><Plus data-icon="inline-start" />Add class</Button></div>{(message || error) && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${error ? "border-destructive/30 text-destructive" : "border-primary/20 bg-secondary"}`} role="status">{error ? <AlertCircle className="size-4" /> : <Check className="size-4" />}{error || message}</div>}<section className="rounded-2xl border bg-card shadow-sm">{classes.length === 0 ? <div className="p-12 text-center"><School className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-4 font-semibold">No classes yet</h2><p className="mt-1 text-sm text-muted-foreground">Add your first class to get started.</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-6 py-4">Grade</th><th className="px-6 py-4">Section</th><th className="px-6 py-4">School year</th><th className="px-6 py-4">Subject</th><th className="px-6 py-4">Room</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody>{classes.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-6 py-4 font-medium">Grade {item.grade_level}</td><td className="px-6 py-4">{item.section_name}</td><td className="px-6 py-4">{item.school_year}</td><td className="px-6 py-4">{item.subject_name || "—"}</td><td className="px-6 py-4">{item.room || "—"}</td><td className="px-6 py-4 text-right"><Button variant="ghost" size="sm" onClick={() => startEdit(item)}><Pencil data-icon="inline-start" />Edit</Button><Button variant="ghost" size="sm" onClick={() => archive(item)}><Trash2 data-icon="inline-start" />Archive</Button></td></tr>)}</tbody></table></div>}</section>{open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"><form onSubmit={saveClass} className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl"><h2 className="text-xl font-semibold">{editingId ? "Edit class" : "Add class"}</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Grade<select className="mt-2 w-full rounded-lg border bg-background p-2" value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: Number(e.target.value) })}>{[1,2,3,4,5,6].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label><label className="text-sm font-medium">Section<input className="mt-2 w-full rounded-lg border bg-background p-2" value={form.section_name} onChange={(e) => setForm({ ...form, section_name: e.target.value })} required /></label><label className="text-sm font-medium">School year<select className="mt-2 w-full rounded-lg border bg-background p-2" value={form.school_year} onChange={(e) => setForm({ ...form, school_year: e.target.value })}>{years.map((year) => <option key={year}>{year}</option>)}</select></label><label className="text-sm font-medium">Subject<input className="mt-2 w-full rounded-lg border bg-background p-2" value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })} /></label><label className="text-sm font-medium sm:col-span-2">Room<input className="mt-2 w-full rounded-lg border bg-background p-2" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></label></div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving}>{saving ? <ButtonLoading /> : editingId ? "Save changes" : "Add class"}</Button></div></form></div>}</main>
}
