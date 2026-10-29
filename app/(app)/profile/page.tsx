"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ButtonLoading, PageLoading } from "@/components/loading-states"
import { AlertCircle, CalendarDays, Check, Clock3, ImagePlus, LockKeyhole, Pencil, Plus, Trash2, UserRound } from "lucide-react"

type Profile = { id: string; full_name: string; email: string | null; avatar_path: string | null; school_name: string | null; school_year: string | null }
type Schedule = { id?: string; day_of_week: number; start_time: string; end_time: string; subject_name: string; room: string }
type ClassItem = { id: string; grade_level: number; section_name: string; school_year: string; subject_name: string | null; room: string | null; class_schedules: Schedule[] }
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const SCHOOL_YEARS = ["2025–2026", "2026–2027", "2027–2028", "2028–2029", "2029–2030"]
const DEFAULT_SCHOOL_YEAR = "2026–2027"
const emptySchedule = (): Schedule => ({ day_of_week: 1, start_time: "08:00", end_time: "09:00", subject_name: "", room: "" })

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [classEditor, setClassEditor] = useState<ClassItem | null>(null)
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [password, setPassword] = useState("")

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [{ data: profileData }, { data: classData, error: classError }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,avatar_path,school_name,school_year").eq("id", user.id).maybeSingle(),
      supabase.from("classes").select("id,grade_level,section_name,school_year,subject_name,room,class_schedules(id,day_of_week,start_time,end_time,subject_name,room)").eq("teacher_id", user.id).eq("is_active", true).order("grade_level"),
    ])
    if (classError) setError("Classes are not available yet. Apply the included Supabase migration to enable them.")
    setProfile(profileData ?? { id: user.id, full_name: user.user_metadata?.full_name ?? "Teacher", email: user.email ?? null, avatar_path: null, school_name: null, school_year: DEFAULT_SCHOOL_YEAR })
    setClasses((classData as ClassItem[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { loadData() }, [])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile) return
    if (profile.full_name.trim().length < 2) { setError("Enter your full name."); return }
    if (!profile.school_year || !SCHOOL_YEARS.includes(profile.school_year)) { setError("Choose a valid school year."); return }
    setSaving(true); setError(""); setMessage("")
    const { data: savedProfile, error: saveError } = await supabase.from("profiles").update({ full_name: profile.full_name.trim(), school_name: profile.school_name?.trim() || null, school_year: profile.school_year, updated_at: new Date().toISOString() }).eq("id", profile.id).select("id,full_name,email,avatar_path,school_name,school_year").maybeSingle()
    if (saveError || !savedProfile) setError(saveError?.message ?? "Profile was not saved. Please refresh and try again.")
    else { setProfile(savedProfile); setMessage("Profile details saved.") }
    setSaving(false)
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("")
    if (password.length < 8) { setError("Use at least 8 characters for your password."); return }
    setSaving(true)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) { setError(authError?.message ?? "Your session has expired. Please sign in again."); setSaving(false); return }
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) setError(passwordError.message); else { setPassword(""); setMessage("Password updated securely.") }
    setSaving(false)
  }
  async function uploadAvatar(file: File) {
    if (!profile || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP image up to 5 MB."); return }
    setSaving(true); const path = `${profile.id}/avatar-${Date.now()}.${file.name.split(".").pop()}`
    const { error: uploadError } = await supabase.storage.from("teacher-avatars").upload(path, file, { upsert: true, contentType: file.type })
    if (!uploadError) { const { error: profileError } = await supabase.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", profile.id); if (profileError) setError(profileError.message); else { setProfile({ ...profile, avatar_path: path }); setMessage("Profile picture updated.") } } else setError(uploadError.message.includes("Bucket not found") ? "Profile photo storage is not available yet. Please try again after the storage setup finishes." : uploadError.message)
    setSaving(false)
  }
  function openClass(item?: ClassItem) { setClassEditor(item ?? { id: "", grade_level: 1, section_name: "", school_year: profile?.school_year ?? DEFAULT_SCHOOL_YEAR, subject_name: "", room: "", class_schedules: [] }); setSchedule(item?.class_schedules ?? [emptySchedule()]); setError(""); setMessage("") }
  async function saveClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!classEditor || !profile) return
    if (classEditor.grade_level < 1 || classEditor.grade_level > 6) { setError("Choose a grade level from 1 to 6."); return }
    if (classEditor.section_name.trim().length < 2) { setError("Enter a section name with at least 2 characters."); return }
    if (!SCHOOL_YEARS.includes(classEditor.school_year)) { setError("Choose a valid school year."); return }
    if (schedule.some((entry) => !entry.start_time || !entry.end_time || entry.end_time <= entry.start_time)) { setError("Each schedule must have a valid start and end time."); return }
    if (schedule.some((entry) => !entry.subject_name.trim())) { setError("Add a subject for each schedule entry."); return }
    const overlap = schedule.some((a, index) => schedule.some((b, other) => index !== other && a.day_of_week === b.day_of_week && a.start_time < b.end_time && b.start_time < a.end_time))
    if (overlap) { setError("Schedule entries overlap. Resolve the conflict before saving."); return }
    setSaving(true); setError("")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError("Your session has expired. Please sign in again."); setSaving(false); return }
    const teacherId = user.id
    const sectionName = classEditor.section_name.trim()
    const duplicateQuery = supabase.from("classes").select("id").eq("teacher_id", teacherId).eq("grade_level", classEditor.grade_level).eq("section_name", sectionName).eq("school_year", classEditor.school_year).eq("is_active", true)
    const { data: duplicate } = classEditor.id ? await duplicateQuery.neq("id", classEditor.id).maybeSingle() : await duplicateQuery.maybeSingle()
    if (duplicate) { setError("You already have an active class with this grade, section, and school year."); setSaving(false); return }
    const payload = { grade_level: classEditor.grade_level, section_name: sectionName, school_year: classEditor.school_year, subject_name: classEditor.subject_name?.trim() || null, room: classEditor.room?.trim() || null, teacher_id: teacherId, is_active: true }
    const result = classEditor.id
      ? await supabase.from("classes").update(payload).eq("id", classEditor.id).eq("teacher_id", teacherId).select("id").maybeSingle()
      : await supabase.from("classes").insert(payload).select("id").single()
    if (result.error || !result.data) {
      setError(result.error?.code === "23505" ? "You already have this grade, section, and school year." : result.error?.message ?? "Unable to save class.")
      setSaving(false)
      return
    }
    const classId = result.data.id
    const { error: deleteScheduleError } = await supabase.from("class_schedules").delete().eq("class_id", classId).eq("teacher_id", teacherId)
    if (deleteScheduleError) {
      setError(`Class saved, but the schedule could not be updated: ${deleteScheduleError.message}`)
      setSaving(false)
      await loadData()
      return
    }
    if (schedule.length) {
      const { error: scheduleError } = await supabase.from("class_schedules").insert(schedule.map(({ id: _id, ...entry }) => ({ ...entry, class_id: classId, teacher_id: teacherId, subject_name: entry.subject_name.trim(), room: entry.room.trim() || null })))
      if (scheduleError) {
        setClassEditor(null)
        setMessage(`Class saved, but the schedule could not be added: ${scheduleError.message}`)
        setSaving(false)
        await loadData()
        return
      }
    }
    setClassEditor(null)
    setMessage("Class saved.")
    setSaving(false)
    await loadData()
  }
  async function deleteClass(item: ClassItem) {
    if (!window.confirm(`Archive Grade ${item.grade_level} – ${item.section_name}? Existing academic history will be preserved.`)) return
    setSaving(true); setError(""); setMessage("")
    const { data, error: archiveError } = await supabase.from("classes").update({ is_active: false }).eq("id", item.id).eq("teacher_id", profile?.id).select("id").maybeSingle()
    if (archiveError || !data) setError(archiveError?.message ?? "The class could not be archived. Refresh and try again.")
    else { setMessage("Class archived."); await loadData() }
    setSaving(false)
  }

  if (loading) return <PageLoading message="Loading your profile…" />
  if (!profile) return <PageLoading message="Please sign in to view your profile." />
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-5 lg:p-8">
    <div><p className="text-sm font-medium text-primary">Teacher workspace</p><h1 className="mt-1 text-3xl font-bold tracking-tight">My Profile</h1><p className="mt-2 text-muted-foreground">Keep your teacher details and school information up to date.</p></div>
    {(message || error) && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/20 bg-secondary text-secondary-foreground"}`} role="status">{error ? <AlertCircle className="size-4" /> : <Check className="size-4" />}{error || message}</div>}
    <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <form onSubmit={saveProfile} className="rounded-2xl border bg-card p-6 shadow-sm"><div className="mb-6 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary"><UserRound /></span><div><h2 className="font-semibold">Personal information</h2><p className="text-sm text-muted-foreground">Your account and school details</p></div></div><div className="mb-6 flex items-center gap-4"><div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-secondary text-lg font-semibold text-primary">{profile.avatar_path ? <AvatarImage path={profile.avatar_path} supabase={supabase} /> : profile.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div><label className="cursor-pointer text-sm font-medium text-primary hover:underline"> <ImagePlus className="mr-1 inline size-4" />Upload picture<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && uploadAvatar(event.target.files[0])} /></label></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></Field><Field label="Email address"><input value={profile.email ?? ""} disabled /></Field><Field label="School name"><input value={profile.school_name ?? ""} onChange={(e) => setProfile({ ...profile, school_name: e.target.value })} placeholder="Your school" /></Field><Field label="School year"><select value={profile.school_year ?? DEFAULT_SCHOOL_YEAR} onChange={(e) => setProfile({ ...profile, school_year: e.target.value })}>{SCHOOL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select></Field></div><Button type="submit" className="mt-6" disabled={saving}>{saving ? <ButtonLoading /> : "Save changes"}</Button></form>
      <form onSubmit={changePassword} className="rounded-2xl border bg-card p-6 shadow-sm"><div className="mb-6 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary"><LockKeyhole /></span><div><h2 className="font-semibold">Security</h2><p className="text-sm text-muted-foreground">Update your password securely</p></div></div><Field label="New password"><input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></Field><Button type="submit" className="mt-6" variant="outline" disabled={saving}>{saving ? <ButtonLoading /> : "Change password"}</Button></form>
    </section>
    <section id="classes" className="hidden rounded-2xl border bg-card p-6 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="size-5 text-primary" />My Classes</h2><p className="mt-1 text-sm text-muted-foreground">Manage the grade levels, sections, and class schedules you handle.</p></div><Button onClick={() => openClass()}><Plus data-icon="inline-start" />Add class</Button></div>{classes.length === 0 ? <div className="mt-8 rounded-xl border border-dashed p-8 text-center"><CalendarDays className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No classes yet</p><p className="mt-1 text-sm text-muted-foreground">Add your first class to start building your timetable.</p></div> : <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Grade</th><th className="px-3 py-3">Section</th><th className="px-3 py-3">School year</th><th className="px-3 py-3">Schedule</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody>{classes.map((item) => <tr className="border-b last:border-0" key={item.id}><td className="px-3 py-4 font-medium">Grade {item.grade_level}</td><td className="px-3 py-4">{item.section_name}</td><td className="px-3 py-4">{item.school_year}</td><td className="px-3 py-4 text-muted-foreground">{item.class_schedules?.length ? `${item.class_schedules.length} schedule ${item.class_schedules.length === 1 ? "entry" : "entries"}` : "No schedule"}</td><td className="px-3 py-4 text-right"><Button variant="ghost" size="sm" onClick={() => openClass(item)}><Pencil data-icon="inline-start" />Edit</Button><Button variant="ghost" size="sm" onClick={() => deleteClass(item)}><Trash2 data-icon="inline-start" />Archive</Button></td></tr>)}</tbody></table></div>}</section>
    {classEditor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-labelledby="class-dialog-title"><form onSubmit={saveClass} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="class-dialog-title" className="text-xl font-semibold">{classEditor.id ? "Edit class" : "Add class"}</h2><p className="mt-1 text-sm text-muted-foreground">Monday is day 1; Sunday is day 7.</p></div><Button type="button" variant="ghost" onClick={() => setClassEditor(null)} aria-label="Close">×</Button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Grade level"><select value={classEditor.grade_level} onChange={(e) => setClassEditor({ ...classEditor, grade_level: Number(e.target.value) })}>{[1,2,3,4,5,6].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></Field><Field label="Section name"><input value={classEditor.section_name} onChange={(e) => setClassEditor({ ...classEditor, section_name: e.target.value })} required placeholder="Sampaguita" /></Field><Field label="School year"><select value={classEditor.school_year} onChange={(e) => setClassEditor({ ...classEditor, school_year: e.target.value })} required>{SCHOOL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select></Field><Field label="Subject taught"><input value={classEditor.subject_name ?? ""} onChange={(e) => setClassEditor({ ...classEditor, subject_name: e.target.value })} placeholder="Mathematics" /></Field></div><div className="mt-7 flex items-center justify-between"><div><h3 className="font-semibold">Class schedule</h3><p className="text-sm text-muted-foreground">Add one or more timetable entries.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setSchedule([...schedule, emptySchedule()])}><Plus data-icon="inline-start" />Add entry</Button></div><div className="mt-4 flex flex-col gap-3">{schedule.map((entry, index) => <div key={index} className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"><Field label="Day"><select value={entry.day_of_week} onChange={(e) => updateSchedule(setSchedule, schedule, index, { day_of_week: Number(e.target.value) })}>{days.map((day, dayIndex) => <option key={day} value={dayIndex + 1}>{day}</option>)}</select></Field><Field label="Start"><input type="time" value={entry.start_time} onChange={(e) => updateSchedule(setSchedule, schedule, index, { start_time: e.target.value })} required /></Field><Field label="End"><input type="time" value={entry.end_time} onChange={(e) => updateSchedule(setSchedule, schedule, index, { end_time: e.target.value })} required /></Field><Button type="button" variant="ghost" size="icon" className="self-end" onClick={() => setSchedule(schedule.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove schedule entry"><Trash2 /></Button><div className="sm:col-span-4 grid gap-3 sm:grid-cols-2"><Field label="Subject (optional)"><input value={entry.subject_name} onChange={(e) => updateSchedule(setSchedule, schedule, index, { subject_name: e.target.value })} /></Field><Field label="Room (optional)"><input value={entry.room} onChange={(e) => updateSchedule(setSchedule, schedule, index, { room: e.target.value })} /></Field></div></div>)}</div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setClassEditor(null)}>Cancel</Button><Button disabled={saving}>{saving ? <ButtonLoading /> : "Save class"}</Button></div></form></div>}
  </main>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-2 text-sm font-medium">{label}{children}</label> }
function updateSchedule(setter: React.Dispatch<React.SetStateAction<Schedule[]>>, current: Schedule[], index: number, change: Partial<Schedule>) { setter(current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...change } : entry)) }
function AvatarImage({ path, supabase }: { path: string; supabase: ReturnType<typeof createClient> }) { const [src, setSrc] = useState(""); useEffect(() => { supabase.storage.from("teacher-avatars").createSignedUrl(path, 3600).then(({ data }) => data?.signedUrl && setSrc(data.signedUrl)) }, [path, supabase]); return src ? <img src={src} alt="Teacher profile" className="size-full object-cover" /> : <UserRound className="size-6" /> }
