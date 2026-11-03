"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, CheckCircle2, Mail, Pencil, Plus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type Plan = { id: string; student_id: string; title: string; owner_name: string | null; start_date: string; target_date: string | null; goal: string; baseline: string | null; target_performance: string | null; success_criteria: string | null; status: string; risk_level: string; risk_factors: string[] }
type Student = { id: string; first_name: string; last_name: string; student_number: string; class_id: string; gender: "male" | "female" | null; parent_guardian_email: string | null }
type Objective = { id: string; concern: string; objective: string; strategy: string; resources: string | null; frequency: string | null; duration_minutes: number | null; assigned_teacher: string | null; target: string | null; status: string }
type Session = { id: string; session_number: number; scheduled_date: string; activity: string; status: string }
type Report = { session_id: string; progress_summary: string | null; current_performance: string | null; teacher_remarks: string | null; follow_up_actions: string | null; next_session_date: string | null; activities_conducted: string | null; skills_addressed: string | null }
type Communication = { id: string; subject: string; status: string; sent_at: string | null; created_at: string }

export default function InterventionDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const [planId, setPlanId] = useState("")
  const [plan, setPlan] = useState<Plan | null>(null); const [student, setStudent] = useState<Student | null>(null); const [objectives, setObjectives] = useState<Objective[]>([]); const [sessions, setSessions] = useState<Session[]>([]); const [reports, setReports] = useState<Report[]>([]); const [communications, setCommunications] = useState<Communication[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [sending, setSending] = useState(false); const [activating, setActivating] = useState(false); const [message, setMessage] = useState("")
  const supabase = createClient()
  useEffect(() => { void params.then(({ planId: id }) => setPlanId(id)) }, [params])
  useEffect(() => { if (!planId) return; void loadData() }, [planId])
  async function loadData() {
    setLoading(true)
    setError("")
    const [planResult, objectiveResult, sessionResult, reportResult, communicationResult] = await Promise.all([
      supabase.from("intervention_plans").select("id,student_id,title,owner_name,start_date,target_date,goal,baseline,target_performance,success_criteria,status,risk_level,risk_factors,students(id,first_name,last_name,student_number,class_id,gender,parent_guardian_email)").eq("id", planId).single(),
      supabase.from("intervention_objectives").select("id,concern,objective,strategy,resources,frequency,duration_minutes,assigned_teacher,target,status").eq("plan_id", planId).order("created_at"),
      supabase.from("intervention_sessions").select("id,session_number,scheduled_date,activity,status").eq("plan_id", planId).order("scheduled_date"),
      supabase.from("intervention_session_reports").select("session_id,progress_summary,current_performance,teacher_remarks,follow_up_actions,next_session_date,activities_conducted,skills_addressed").eq("plan_id", planId),
      supabase.from("parent_communications").select("id,subject,status,sent_at,created_at").eq("intervention_id", planId).order("created_at", { ascending: false }),
    ])
    const firstError = planResult.error ?? objectiveResult.error ?? sessionResult.error ?? reportResult.error ?? communicationResult.error
    if (firstError) setError(firstError.message)
    if (!planResult.error) {
      const row = planResult.data as Plan & { students: Student | Student[] | null }
      setPlan(row)
      setStudent(Array.isArray(row.students) ? row.students[0] ?? null : row.students)
    }
    setObjectives(objectiveResult.data ?? [])
    setSessions(sessionResult.data ?? [])
    setReports(reportResult.data ?? [])
    setCommunications(communicationResult.data ?? [])
    setLoading(false)
  }
  if (loading) return <main className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted-foreground">Loading intervention details…</p></main>
  if (error || !plan || !student) return <main className="mx-auto max-w-6xl p-6"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Unable to load intervention</h1><p className="mt-2 text-sm text-muted-foreground">{error || "This intervention could not be found."}</p><Link className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium" href="/interventions"><ArrowLeft className="size-4" />Back to interventions</Link></div></main>
  async function activatePlan() {
    const currentPlan = plan
    if (!currentPlan || currentPlan.status === "active") return
    setActivating(true)
    setMessage("")
    const { error: updateError } = await supabase.from("intervention_plans").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", currentPlan.id)
    if (updateError) setError(updateError.message)
    else {
      setPlan({ ...currentPlan, status: "active" })
      setMessage("Intervention plan activated.")
    }
    setActivating(false)
  }

  async function sendParentUpdate(report?: Report, session?: Session) {
    const currentPlan = plan
    const currentStudent = student
    if (!currentPlan || !currentStudent) return
    if (!currentStudent.parent_guardian_email) {
      setError("Add a guardian email to this pupil record before sending.")
      return
    }
    setSending(true)
    setError("")
    setMessage("")
    const subject = session
      ? `Session progress update for ${currentStudent.first_name} ${currentStudent.last_name}`
      : `Intervention plan update for ${currentStudent.first_name} ${currentStudent.last_name}`
    const message = session
      ? `Dear Parent/Guardian,\n\nWe are sharing an update from ${currentStudent.first_name} ${currentStudent.last_name}'s support session.\n\nSession activity: ${session.activity}\nScheduled date: ${session.scheduled_date}\nProgress: ${report?.progress_summary || report?.current_performance || report?.teacher_remarks || "Progress is being monitored."}\nActivities conducted: ${report?.activities_conducted || "Not recorded"}\nSkills addressed: ${report?.skills_addressed || "Not recorded"}\nNext steps: ${report?.follow_up_actions || "To be confirmed with the teacher."}${report?.next_session_date ? `\nNext session: ${report.next_session_date}` : ""}\n\nElemBloom`
      : `Dear Parent/Guardian,\n\n${currentStudent.first_name} ${currentStudent.last_name} has an intervention support plan.\n\nPlan: ${currentPlan.title}\nGoal: ${currentPlan.goal}\nBaseline: ${currentPlan.baseline || "Being reviewed"}\nTarget: ${currentPlan.target_performance || "To be agreed with the teacher"}\nReview date: ${currentPlan.target_date || "To be scheduled"}\n\nPlease contact the teacher with questions.\n\nElemBloom`
    try {
      const response = await fetch("/api/parent-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: currentStudent.id, interventionId: currentPlan.id, to: currentStudent.parent_guardian_email, subject, message, type: session ? "session_update" : "intervention_plan" }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "The parent update could not be sent.")
      setMessage(session ? "Session progress update sent and recorded." : "Intervention plan update sent and recorded.")
      await loadData()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The parent update could not be sent.")
    } finally {
      setSending(false)
    }
  }

  return <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
    <div>
      <Link className="-ml-3 mb-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted" href="/interventions"><ArrowLeft className="size-4" />Back to interventions</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">Intervention details</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{student.first_name} {student.last_name}</h1><p className="mt-2 text-muted-foreground">{plan.title} · Student ID {student.student_number} · {student.gender ?? "Gender not set"}</p></div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium" href={`/interventions?student=${student.id}&plan=${plan.id}`}><Pencil className="size-4" />Edit plan</Link>
          <Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium" href={`/interventions?student=${student.id}&plan=${plan.id}&tab=objectives`}><Plus className="size-4" />Add objective</Link>
          <Link className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={`/interventions?student=${student.id}&plan=${plan.id}&tab=sessions`}><Plus className="size-4" />Schedule session</Link>
          {plan.status !== "active" && <Button type="button" disabled={activating} onClick={() => void activatePlan()}><CheckCircle2 data-icon="inline-start" />{activating ? "Activating…" : "Activate plan"}</Button>}
          <Button type="button" variant="outline" disabled={sending || !student.parent_guardian_email} onClick={() => void sendParentUpdate()}><Send data-icon="inline-start" />{sending ? "Sending…" : "Send plan notice"}</Button>
        </div>
      </div>
    </div>
    {(error || message) && <p className={`rounded-lg border p-3 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}`} role={error ? "alert" : "status"}>{error || message}</p>}
    {!student.parent_guardian_email && <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">A guardian email is not recorded for this pupil yet. Add one to the pupil profile to send parent updates.</p>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[["Risk level", plan.risk_level], ["Plan status", plan.status], ["Start date", plan.start_date], ["Target completion", plan.target_date || "Not set"]].map(([label, value]) => <div className="rounded-xl border bg-card p-4" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold capitalize">{value}</p></div>)}
    </section>
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Plan overview</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Assigned teacher</dt><dd className="mt-1">{plan.owner_name || "Unassigned"}</dd></div><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Goal</dt><dd className="mt-1">{plan.goal}</dd></div><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Baseline</dt><dd className="mt-1">{plan.baseline || "Not recorded"}</dd></div><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Target performance</dt><dd className="mt-1">{plan.target_performance || "Not recorded"}</dd></div><div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Risk factors</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{plan.risk_factors?.join("\n") || "No risk factors recorded."}</dd></div></dl></section>
        <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Objectives and activities</h2><Link className="text-sm font-medium text-primary hover:underline" href={`/interventions?student=${student.id}&plan=${plan.id}&tab=objectives`}>Manage objectives</Link></div><div className="mt-4 space-y-3">{objectives.map((objective) => <div className="rounded-lg border p-4" key={objective.id}><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{objective.concern}</p><p className="mt-1 text-sm">{objective.objective}</p></div><span className="rounded-full border px-2 py-1 text-xs capitalize">{objective.status}</span></div><p className="mt-2 text-sm text-muted-foreground">{objective.strategy}</p><p className="mt-2 text-xs text-muted-foreground">{[objective.frequency, objective.duration_minutes ? `${objective.duration_minutes} minutes` : null, objective.assigned_teacher].filter(Boolean).join(" · ") || "No schedule details recorded"}</p></div>)}{!objectives.length && <p className="text-sm text-muted-foreground">No objectives recorded yet.</p>}</div></section>
      </div>
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Sessions and progress</h2><p className="mt-1 text-sm text-muted-foreground">Record sessions, outcomes, and follow-up actions.</p></div><CalendarDays className="size-5 text-primary" /></div><div className="mt-4 space-y-3">{sessions.map((session) => { const report = reports.find((item) => item.session_id === session.id); return <div className="rounded-lg border p-4" key={session.id}><div className="flex items-start justify-between gap-3"><div><p className="font-medium">Session {session.session_number} · {session.scheduled_date}</p><p className="mt-1 text-sm text-muted-foreground">{session.activity}</p></div><span className="rounded-full border px-2 py-1 text-xs capitalize">{session.status}</span></div>{report && <div className="mt-3 border-t pt-3 text-sm"><p className="font-medium">Teacher progress</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.progress_summary || report.current_performance || report.teacher_remarks || "No summary recorded."}</p>{report.follow_up_actions && <p className="mt-2"><span className="font-medium">Next steps: </span>{report.follow_up_actions}</p>}<Button className="mt-3" type="button" size="sm" variant="outline" disabled={sending || !student.parent_guardian_email} onClick={() => void sendParentUpdate(report, session)}><Send data-icon="inline-start" />Send session update</Button></div>}{!report && <Link className="mt-3 inline-flex text-sm font-medium text-primary hover:underline" href={`/interventions?student=${student.id}&plan=${plan.id}&tab=sessions`}>Add session progress report</Link>}</div> })}{!sessions.length && <p className="text-sm text-muted-foreground">No sessions scheduled yet.</p>}<Link className="inline-flex text-sm font-medium text-primary hover:underline" href={`/interventions?student=${student.id}&plan=${plan.id}&tab=sessions`}>Manage sessions and progress</Link></div></section>
        <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Parent update history</h2><Mail className="size-5 text-primary" /></div><div className="mt-4 space-y-3">{communications.map((communication) => <div className="flex items-center justify-between gap-3 rounded-lg border p-3" key={communication.id}><div><p className="text-sm font-medium">{communication.subject}</p><p className="text-xs text-muted-foreground">{communication.sent_at ? `Sent ${new Date(communication.sent_at).toLocaleString()}` : "Not sent"}</p></div><span className="rounded-full border px-2 py-1 text-xs capitalize">{communication.status}</span></div>)}{!communications.length && <p className="text-sm text-muted-foreground">No parent emails recorded for this plan.</p>}</div></section>
      </div>
    </section>
  </main>
}
