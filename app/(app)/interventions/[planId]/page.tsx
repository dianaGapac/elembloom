"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
	ArrowLeft,
	CalendarDays,
	CheckCircle2,
	Mail,
	Pencil,
	Plus,
	Send,
	Trash2,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Plan = {
	id: string;
	student_id: string;
	title: string;
	owner_name: string | null;
	start_date: string;
	target_date: string | null;
	goal: string;
	baseline: string | null;
	target_performance: string | null;
	success_criteria: string | null;
	status: string;
	risk_level: string;
	risk_factors: string[];
};
type Student = {
	id: string;
	first_name: string;
	last_name: string;
	student_number: string;
	class_id: string;
	gender: "male" | "female" | null;
	parent_guardian_email: string | null;
};
type Objective = {
	id: string;
	concern: string;
	objective: string;
	strategy: string;
	resources: string | null;
	frequency: string | null;
	duration_minutes: number | null;
	assigned_teacher: string | null;
	target: string | null;
	status: string;
};
type Session = {
	id: string;
	session_number: number;
	scheduled_date: string;
	activity: string;
	status: string;
};
type Report = {
	session_id: string;
	progress_summary: string | null;
	attendance: string | null;
	current_performance: string | null;
	teacher_remarks: string | null;
	follow_up_actions: string | null;
	next_session_date: string | null;
	activities_conducted: string | null;
	skills_addressed: string | null;
};
type Communication = {
	id: string;
	subject: string;
	status: string;
	sent_at: string | null;
	created_at: string;
};

function progressNotes(values: Record<string, string>) {
	return Object.entries(values)
		.filter(([key, value]) => key !== "attendance" && value.trim())
		.map(([key, value]) => `${key.replaceAll("_", " ")}: ${value.trim()}`)
		.join("\n");
}

export default function InterventionDetailPage({
	params,
}: {
	params: Promise<{ planId: string }>;
}) {
	const [planId, setPlanId] = useState("");
	const [plan, setPlan] = useState<Plan | null>(null);
	const [student, setStudent] = useState<Student | null>(null);
	const [objectives, setObjectives] = useState<Objective[]>([]);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [reports, setReports] = useState<Report[]>([]);
	const [communications, setCommunications] = useState<Communication[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [sending, setSending] = useState(false);
	const [updatingStatus, setUpdatingStatus] = useState(false);
	const [message, setMessage] = useState("");
	const [dialog, setDialog] = useState<"schedule" | "progress" | null>(null);
	const [selectedSession, setSelectedSession] = useState<Session | null>(null);
	const [sessionForm, setSessionForm] = useState({
		scheduled_date: new Date().toISOString().slice(0, 10),
		activity: "",
	});
	const [progressForm, setProgressForm] = useState({
		attendance: "attended",
		activities_conducted: "",
		skills_addressed: "",
		current_performance: "",
		teacher_remarks: "",
		follow_up_actions: "",
		next_session_date: "",
	});
	const [saving, setSaving] = useState(false);
	const supabase = createClient();
	useEffect(() => {
		void params.then(({ planId: id }) => setPlanId(id));
	}, [params]);
	useEffect(() => {
		if (!planId) return;
		void loadData();
	}, [planId]);
	async function loadData() {
		setLoading(true);
		setError("");
		const [
			planResult,
			objectiveResult,
			sessionResult,
			reportResult,
			communicationResult,
		] = await Promise.all([
			supabase
				.from("intervention_plans")
				.select(
					"id,student_id,title,owner_name,start_date,target_date,goal,baseline,target_performance,success_criteria,status,risk_level,risk_factors,students(id,first_name,last_name,student_number,class_id,gender,parent_guardian_email)",
				)
				.eq("id", planId)
				.single(),
			supabase
				.from("intervention_objectives")
				.select(
					"id,concern,objective,strategy,resources,frequency,duration_minutes,assigned_teacher,target,status",
				)
				.eq("plan_id", planId)
				.order("created_at"),
			supabase
				.from("intervention_sessions")
				.select("id,session_number,scheduled_date,activity,status")
				.eq("plan_id", planId)
				.order("scheduled_date"),
			supabase
				.from("intervention_session_reports")
				.select(
					"session_id,progress_summary,attendance,current_performance,teacher_remarks,follow_up_actions,next_session_date,activities_conducted,skills_addressed",
				)
				.eq("plan_id", planId),
			supabase
				.from("parent_communications")
				.select("id,subject,status,sent_at,created_at")
				.eq("intervention_id", planId)
				.order("created_at", { ascending: false }),
		]);
		const firstError =
			planResult.error ??
			objectiveResult.error ??
			sessionResult.error ??
			reportResult.error ??
			communicationResult.error;
		if (firstError) setError(firstError.message);
		if (!planResult.error) {
			const row = planResult.data as Plan & {
				students: Student | Student[] | null;
			};
			setPlan(row);
			setStudent(
				Array.isArray(row.students) ? (row.students[0] ?? null) : row.students,
			);
		}
		setObjectives(objectiveResult.data ?? []);
		setSessions(sessionResult.data ?? []);
		setReports(reportResult.data ?? []);
		setCommunications(communicationResult.data ?? []);
		setLoading(false);
	}
	if (loading)
		return (
			<main className='mx-auto max-w-6xl p-6'>
				<p className='text-sm text-muted-foreground'>
					Loading intervention details…
				</p>
			</main>
		);
	if (error || !plan || !student)
		return (
			<main className='mx-auto max-w-6xl p-6'>
				<div className='rounded-xl border border-destructive/30 bg-destructive/5 p-5'>
					<h1 className='font-semibold'>Unable to load intervention</h1>
					<p className='mt-2 text-sm text-muted-foreground'>
						{error || "This intervention could not be found."}
					</p>
					<Link
						className='mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium'
						href='/interventions'
					>
						<ArrowLeft className='size-4' />
						Back to interventions
					</Link>
				</div>
			</main>
		);
	async function activatePlan() {
		const currentPlan = plan;
		if (!currentPlan || currentPlan.status !== "draft") return;
		setUpdatingStatus(true);
		setMessage("");
		const { error: updateError } = await supabase
			.from("intervention_plans")
			.update({ status: "active", updated_at: new Date().toISOString() })
			.eq("id", currentPlan.id);
		if (updateError) setError(updateError.message);
		else {
			setPlan({ ...currentPlan, status: "active" });
			setMessage("Intervention plan activated.");
		}
		setUpdatingStatus(false);
	}

	async function completePlan() {
		const currentPlan = plan;
		if (!currentPlan || !["draft", "active"].includes(currentPlan.status)) return;
		setUpdatingStatus(true);
		setError("");
		setMessage("");
		const { error: updateError } = await supabase
			.from("intervention_plans")
			.update({ status: "completed", updated_at: new Date().toISOString() })
			.eq("id", currentPlan.id);
		if (updateError) setError(`Intervention plan could not be completed: ${updateError.message}`);
		else {
			setPlan({ ...currentPlan, status: "completed" });
			setMessage("Intervention plan marked as completed.");
		}
		setUpdatingStatus(false);
	}

	async function deletePlan() {
		const currentPlan = plan;
		if (!currentPlan) return;
		if (
			!window.confirm(
				`Permanently delete "${currentPlan.title}" and its objectives, sessions, progress reports, and communication history? This cannot be undone.`,
			)
		)
			return;
		setError("");
		const { data: auth, error: authError } = await supabase.auth.getUser();
		if (authError || !auth.user) {
			setError(
				authError?.message ??
					"Please sign in again before deleting this intervention.",
			);
			return;
		}
		const { error: deleteError } = await supabase
			.from("intervention_plans")
			.delete()
			.eq("id", currentPlan.id)
			.eq("teacher_id", auth.user.id);
		if (deleteError)
			setError(`Intervention could not be deleted: ${deleteError.message}`);
		else window.location.assign("/interventions");
	}

	async function sendParentUpdate(report?: Report, session?: Session) {
		const currentPlan = plan;
		const currentStudent = student;
		if (!currentPlan || !currentStudent) return;
		if (!currentStudent.parent_guardian_email) {
			setError("Add a guardian email to this pupil record before sending.");
			return;
		}

		setSending(true);
		setError("");
		setMessage("");
		const completionEvidence = currentPlan.status === "completed" && !session
			? reports
				.map((item) => {
					const relatedSession = sessions.find((entry) => entry.id === item.session_id);
					const evidence = item.progress_summary || item.current_performance || item.teacher_remarks;
					return evidence ? `${relatedSession?.scheduled_date ?? "Date not recorded"}: ${evidence}` : "";
				})
				.filter(Boolean)
				.slice(-5)
			: [];
		const subject = session
			? `Session progress update for ${currentStudent.first_name} ${currentStudent.last_name}`
			: currentPlan.status === "completed"
				? `Intervention completed: ${currentStudent.first_name} ${currentStudent.last_name}`
				: `Intervention plan update for ${currentStudent.first_name} ${currentStudent.last_name}`;
		const message = session
			? `Dear Parent/Guardian,\n\nWe are sharing an update from ${currentStudent.first_name} ${currentStudent.last_name}'s support session.\n\nSession activity: ${session.activity}\nScheduled date: ${session.scheduled_date}\nProgress: ${report?.progress_summary || report?.current_performance || report?.teacher_remarks || "Progress is being monitored."}\nActivities conducted: ${report?.activities_conducted || "Not recorded"}\nSkills addressed: ${report?.skills_addressed || "Not recorded"}\nNext steps: ${report?.follow_up_actions || "To be confirmed with the teacher."}${report?.next_session_date ? `\nNext session: ${report.next_session_date}` : ""}\n\nElemBloom`
			: currentPlan.status === "completed"
				? `Dear Parent/Guardian,\n\n${currentStudent.first_name} ${currentStudent.last_name} has completed the intervention plan "${currentPlan.title}". We are pleased to share the documented progress below.\n\nPlan goal: ${currentPlan.goal}\nBaseline recorded: ${currentPlan.baseline || "Not recorded"}\nTarget: ${currentPlan.target_performance || "Not recorded"}\n\nProgress and evidence from session reports:\n${completionEvidence.length ? completionEvidence.map((item) => `• ${item}`).join("\n") : "No session progress evidence was recorded for this plan. Please contact the teacher to discuss the outcomes and any next steps."}\n\nThe information above reflects classroom records and teacher observations; it does not imply results that were not documented. Please contact the teacher if you would like to discuss the pupil's progress or continued support.\n\nElemBloom`
			: `Dear Parent/Guardian,\n\n${currentStudent.first_name} ${currentStudent.last_name} has an intervention support plan.\n\nPlan: ${currentPlan.title}\nGoal: ${currentPlan.goal}\nBaseline: ${currentPlan.baseline || "Being reviewed"}\nTarget: ${currentPlan.target_performance || "To be agreed with the teacher"}\nReview date: ${currentPlan.target_date || "To be scheduled"}\n\nPlease contact the teacher with questions.\n\nElemBloom`;
		try {
			const response = await fetch("/api/parent-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					studentId: currentStudent.id,
					interventionId: currentPlan.id,
					to: currentStudent.parent_guardian_email,
					subject,
					message,
					type: session ? "session_update" : currentPlan.status === "completed" ? "intervention_completed" : "intervention_plan",
				}),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(body.error ?? "The parent update could not be sent.");
			setMessage(
				session
					? "Session progress update sent and recorded."
					: currentPlan.status === "completed"
						? "Intervention completion summary sent and recorded."
						: "Intervention plan update sent and recorded.",
			);
			await loadData();
		} catch (sendError) {
			setError(
				sendError instanceof Error
					? sendError.message
					: "The parent update could not be sent.",
			);
		} finally {
			setSending(false);
		}
	}

	async function saveScheduledSession(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!plan || !sessionForm.scheduled_date || !sessionForm.activity.trim())
			return;
		const { data: auth, error: authError } = await supabase.auth.getUser();
		if (authError || !auth.user) {
			setError(
				authError?.message ??
					"Please sign in again before scheduling a session.",
			);
			return;
		}
		setSaving(true);
		setError("");
		const { error: saveError } = await supabase
			.from("intervention_sessions")
			.insert({
				plan_id: plan.id,
				teacher_id: auth.user.id,
				session_number: sessions.length + 1,
				scheduled_date: sessionForm.scheduled_date,
				activity: sessionForm.activity.trim(),
				objective_ids: objectives.map((objective) => objective.id),
			});
		setSaving(false);
		if (saveError) {
			setError(`Session could not be scheduled: ${saveError.message}`);
			return;
		}
		setDialog(null);
		setSessionForm({
			scheduled_date: new Date().toISOString().slice(0, 10),
			activity: "",
		});
		setMessage("Session scheduled.");
		await loadData();
	}

	async function saveProgressReport(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!plan || !selectedSession) return;
		const { data: auth, error: authError } = await supabase.auth.getUser();
		if (authError || !auth.user) {
			setError(
				authError?.message ??
					"Please sign in again before saving session progress.",
			);
			return;
		}
		setSaving(true);
		setError("");
		const source = progressNotes(progressForm);
		let progressSummary = source || null;
		let summaryWarning = "";
		if (source) {
			try {
				const summaryResponse = await fetch("/api/intervention-summary", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ source }),
				});
				const summaryBody = (await summaryResponse
					.json()
					.catch(() => ({}))) as { error?: string; summary?: unknown };
				if (!summaryResponse.ok)
					throw new Error(
						summaryBody.error ?? "The progress summary could not be generated.",
					);
				if (
					typeof summaryBody.summary !== "string" ||
					!summaryBody.summary.trim()
				)
					throw new Error("The progress summary response was empty.");
				progressSummary = summaryBody.summary.trim();
			} catch (summaryError) {
				summaryWarning =
					summaryError instanceof Error
						? summaryError.message
						: "The automatic summary could not be generated.";
			}
		}
		const { error: saveError } = await supabase
			.from("intervention_session_reports")
			.upsert(
				{
					...progressForm,
					next_session_date: progressForm.next_session_date || null,
					actual_date: new Date().toISOString().slice(0, 10),
					progress_summary: progressSummary,
					session_id: selectedSession.id,
					plan_id: plan.id,
					teacher_id: auth.user.id,
					is_finalized: true,
					parent_update_pending: true,
				},
				{ onConflict: "session_id" },
			);
		setSaving(false);
		if (saveError) {
			setError(`Progress report could not be saved: ${saveError.message}`);
			return;
		}
		setDialog(null);
		setSelectedSession(null);
		setMessage(
			summaryWarning
				? `Session progress saved. The automatic summary could not be generated: ${summaryWarning}`
				: "Session progress saved. You can send the update to the parent or guardian.",
		);
		await loadData();
	}

	return (
		<main className='mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8'>
			<div>
				<Link
					className='-ml-3 mb-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted'
					href='/interventions'
				>
					<ArrowLeft className='size-4' />
					Back to interventions
				</Link>
				<div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
					<div>
						<p className='text-sm font-medium text-primary'>
							Intervention details
						</p>
						<h1 className='mt-1 text-3xl font-bold tracking-tight'>
							{student.first_name} {student.last_name}
						</h1>
						<p className='mt-2 text-muted-foreground'>
							{plan.title} · Student ID {student.student_number} ·{" "}
							{student.gender ?? "Gender not set"}
						</p>
					</div>
					<div className='flex flex-wrap gap-2'>
						<Link
							className='inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium'
							href={`/interventions?student=${student.id}&plan=${plan.id}`}
						>
							<Pencil className='size-4' />
							Edit plan
						</Link>
						<Button
							type='button'
							variant='outline'
							onClick={() => void deletePlan()}
						>
							<Trash2 data-icon='inline-start' />
							Delete intervention
						</Button>
						{/* <Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium" href={`/interventions?student=${student.id}&plan=${plan.id}&tab=objectives`}><Plus className="size-4" />Add objective</Link> */}
						{!["completed", "cancelled"].includes(plan.status) && (
							<Button
								type='button'
								onClick={() => {
									setError("");
									setDialog("schedule");
								}}
							>
								<Plus data-icon='inline-start' />
								Schedule session
							</Button>
						)}
						{plan.status === "draft" && (
							<Button
								type='button'
								disabled={updatingStatus}
								onClick={() => void activatePlan()}
							>
								<CheckCircle2 data-icon='inline-start' />
								{updatingStatus ? "Updating…" : "Activate plan"}
							</Button>
						)}
						{["draft", "active"].includes(plan.status) && (
							<Button
								type='button'
								variant='outline'
								disabled={updatingStatus}
								onClick={() => void completePlan()}
							>
								<CheckCircle2 data-icon='inline-start' />
								{updatingStatus ? "Updating…" : "Mark as complete"}
							</Button>
						)}
						<Button
							type='button'
							variant='outline'
							disabled={sending || !student.parent_guardian_email}
							onClick={() => void sendParentUpdate()}
						>
							<Send data-icon='inline-start' />
							{sending ? "Sending…" : plan.status === "completed" ? "Send completion summary" : "Send plan notice"}
						</Button>
					</div>
				</div>
			</div>
			{(error || message) && (
				<p
					className={`rounded-lg border p-3 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}`}
					role={error ? "alert" : "status"}
				>
					{error || message}
				</p>
			)}
			{!student.parent_guardian_email && (
				<p className='rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground'>
					A guardian email is not recorded for this pupil yet. Add one to the
					pupil profile to send parent updates.
				</p>
			)}
			<section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
				{[
					["Risk level", plan.risk_level],
					["Plan status", plan.status],
					["Start date", plan.start_date],
					["Target completion", plan.target_date || "Not set"],
				].map(([label, value]) => (
					<div className='rounded-xl border bg-card p-4' key={label}>
						<p className='text-sm text-muted-foreground'>{label}</p>
						<p className='mt-2 text-xl font-semibold capitalize'>{value}</p>
					</div>
				))}
			</section>
			<section className='grid gap-6 lg:grid-cols-2'>
				<div className='space-y-6'>
					<section className='rounded-xl border bg-card p-5'>
						<h2 className='font-semibold'>Plan overview</h2>
						<dl className='mt-4 grid gap-4 sm:grid-cols-2'>
							<div>
								<dt className='text-xs uppercase tracking-wide text-muted-foreground'>
									Assigned teacher
								</dt>
								<dd className='mt-1'>{plan.owner_name || "Unassigned"}</dd>
							</div>
							<div>
								<dt className='text-xs uppercase tracking-wide text-muted-foreground'>
									Goal
								</dt>
								<dd className='mt-1'>{plan.goal}</dd>
							</div>
							<div>
								<dt className='text-xs uppercase tracking-wide text-muted-foreground'>
									Baseline
								</dt>
								<dd className='mt-1'>{plan.baseline || "Not recorded"}</dd>
							</div>
							<div>
								<dt className='text-xs uppercase tracking-wide text-muted-foreground'>
									Target performance
								</dt>
								<dd className='mt-1'>
									{plan.target_performance || "Not recorded"}
								</dd>
							</div>
							<div className='sm:col-span-2'>
								<dt className='text-xs uppercase tracking-wide text-muted-foreground'>
									Risk factors
								</dt>
								<dd className='mt-1 whitespace-pre-wrap text-sm'>
									{plan.risk_factors?.join("\n") || "No risk factors recorded."}
								</dd>
							</div>
						</dl>
					</section>
					<section className='rounded-xl border bg-card p-5'>
						<div className='flex items-center justify-between gap-3'>
							<h2 className='font-semibold'>Objectives and activities</h2>
							{/* <Link
								className='text-sm font-medium text-primary hover:underline'
								href={`/interventions?student=${student.id}&plan=${plan.id}&tab=objectives`}
							>
								Manage objectives
							</Link> */}
						</div>
						<div className='mt-4 space-y-3'>
							{objectives.map((objective) => (
								<div className='rounded-lg border p-4' key={objective.id}>
									<div className='flex items-start justify-between gap-3'>
										<div>
											<p className='font-medium'>{objective.concern}</p>
											<p className='mt-1 text-sm'>{objective.objective}</p>
										</div>
										<span className='rounded-full border px-2 py-1 text-xs capitalize'>
											{objective.status}
										</span>
									</div>
									<p className='mt-2 text-sm text-muted-foreground'>
										{objective.strategy}
									</p>
									<p className='mt-2 text-xs text-muted-foreground'>
										{[
											objective.frequency,
											objective.duration_minutes
												? `${objective.duration_minutes} minutes`
												: null,
											objective.assigned_teacher,
										]
											.filter(Boolean)
											.join(" · ") || "No schedule details recorded"}
									</p>
								</div>
							))}
							{!objectives.length && (
								<p className='text-sm text-muted-foreground'>
									No objectives recorded yet.
								</p>
							)}
						</div>
					</section>
				</div>
				<div className='space-y-6'>
					<section className='rounded-xl border bg-card p-5'>
						<div className='flex items-center justify-between gap-3'>
							<div>
								<h2 className='font-semibold'>Sessions and progress</h2>
								<p className='mt-1 text-sm text-muted-foreground'>
									Record sessions, outcomes, and follow-up actions.
								</p>
							</div>
							<CalendarDays className='size-5 text-primary' />
						</div>
						<div className='mt-4 space-y-3'>
							{sessions.map((session) => {
								const report = reports.find(
									(item) => item.session_id === session.id,
								);
								return (
									<div className='rounded-lg border p-4' key={session.id}>
										<div className='flex items-start justify-between gap-3'>
											<div>
												<p className='font-medium'>
													Session {session.session_number} ·{" "}
													{session.scheduled_date}
												</p>
												<p className='mt-1 text-sm text-muted-foreground'>
													{session.activity}
												</p>
											</div>
											<span className='rounded-full border px-2 py-1 text-xs capitalize'>
												{session.status}
											</span>
										</div>
										{report && (
											<div className='mt-3 border-t pt-3 text-sm'>
												<p className='font-medium'>Teacher progress</p>
												<p className='mt-1 whitespace-pre-wrap text-muted-foreground'>
													{report.progress_summary ||
														report.current_performance ||
														report.teacher_remarks ||
														"No summary recorded."}
												</p>
												{report.follow_up_actions && (
													<p className='mt-2'>
														<span className='font-medium'>Next steps: </span>
														{report.follow_up_actions}
													</p>
												)}
												<Button
													className='mt-3'
													type='button'
													size='sm'
													variant='outline'
													disabled={sending || !student.parent_guardian_email}
													onClick={() => void sendParentUpdate(report, session)}
												>
													<Send data-icon='inline-start' />
													Send session update
												</Button>
											</div>
										)}
										<Button
											className='mt-3'
											type='button'
											size='sm'
											variant={report ? "outline" : "default"}
											onClick={() => {
												setSelectedSession(session);
												setProgressForm({
													attendance: report?.attendance ?? "attended",
													activities_conducted:
														report?.activities_conducted ?? "",
													skills_addressed: report?.skills_addressed ?? "",
													current_performance:
														report?.current_performance ?? "",
													teacher_remarks: report?.teacher_remarks ?? "",
													follow_up_actions: report?.follow_up_actions ?? "",
													next_session_date: report?.next_session_date ?? "",
												});
												setDialog("progress");
											}}
										>
											{report ? "Edit progress" : "Report progress"}
										</Button>
									</div>
								);
							})}
							{!sessions.length && (
								<p className='text-sm text-muted-foreground'>
									No sessions scheduled yet.
								</p>
							)}
						</div>
					</section>
					{/* <section className='rounded-xl border bg-card p-5'>
						<div className='flex items-center justify-between'>
							<h2 className='font-semibold'>Parent update history</h2>
							<Mail className='size-5 text-primary' />
						</div>
						<div className='mt-4 space-y-3'>
							{communications.map((communication) => (
								<div
									className='flex items-center justify-between gap-3 rounded-lg border p-3'
									key={communication.id}
								>
									<div>
										<p className='text-sm font-medium'>
											{communication.subject}
										</p>
										<p className='text-xs text-muted-foreground'>
											{communication.sent_at
												? `Sent ${new Date(communication.sent_at).toLocaleString()}`
												: "Not sent"}
										</p>
									</div>
									<span className='rounded-full border px-2 py-1 text-xs capitalize'>
										{communication.status}
									</span>
								</div>
							))}
							{!communications.length && (
								<p className='text-sm text-muted-foreground'>
									No parent emails recorded for this plan.
								</p>
							)}
						</div>
					</section> */}
				</div>
			</section>
			{dialog && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
					role='presentation'
					onMouseDown={(event) => {
						if (event.target === event.currentTarget && !saving)
							setDialog(null);
					}}
				>
					<form
						role='dialog'
						aria-modal='true'
						aria-labelledby='intervention-dialog-title'
						onSubmit={(event) =>
							dialog === "schedule"
								? void saveScheduledSession(event)
								: void saveProgressReport(event)
						}
						className='max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-xl sm:p-6'
					>
						<div className='flex items-start justify-between gap-4'>
							<div>
								<h2
									id='intervention-dialog-title'
									className='text-lg font-semibold'
								>
									{dialog === "schedule"
										? "Schedule intervention session"
										: `Report progress${selectedSession ? ` · Session ${selectedSession.session_number}` : ""}`}
								</h2>
								<p className='mt-1 text-sm text-muted-foreground'>
									{dialog === "schedule"
										? "Choose a date and describe the planned activity."
										: "Record attendance, observed progress, and next steps."}
								</p>
							</div>
							<Button
								type='button'
								variant='ghost'
								size='icon'
								aria-label='Close dialog'
								disabled={saving}
								onClick={() => setDialog(null)}
							>
								<X className='size-4' />
							</Button>
						</div>
						{dialog === "schedule" ? (
							<>
								<label className='block text-sm font-medium'>
									Date
									<input
										required
										type='date'
										className='mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal'
										value={sessionForm.scheduled_date}
										onChange={(event) =>
											setSessionForm({
												...sessionForm,
												scheduled_date: event.target.value,
											})
										}
									/>
								</label>
								<label className='block text-sm font-medium'>
									Planned activity
									<textarea
										required
										rows={4}
										className='mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal'
										value={sessionForm.activity}
										onChange={(event) =>
											setSessionForm({
												...sessionForm,
												activity: event.target.value,
											})
										}
									/>
								</label>
							</>
						) : (
							<>
								<label className='block text-sm font-medium'>
									Attendance
									<select
										className='mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal'
										value={progressForm.attendance}
										onChange={(event) =>
											setProgressForm({
												...progressForm,
												attendance: event.target.value,
											})
										}
									>
										<option value='attended'>Attended</option>
										<option value='absent'>Absent</option>
										<option value='rescheduled'>Rescheduled</option>
									</select>
								</label>
								<div className='grid gap-3 sm:grid-cols-2'>
									<label className='text-sm font-medium'>
										Activities conducted
										<textarea
											rows={3}
											className='mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal'
											value={progressForm.activities_conducted}
											onChange={(event) =>
												setProgressForm({
													...progressForm,
													activities_conducted: event.target.value,
												})
											}
										/>
									</label>
									<label className='text-sm font-medium'>
										Skills addressed
										<textarea
											rows={3}
											className='mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal'
											value={progressForm.skills_addressed}
											onChange={(event) =>
												setProgressForm({
													...progressForm,
													skills_addressed: event.target.value,
												})
											}
										/>
									</label>
								</div>
								<label className='block text-sm font-medium'>
									Current performance
									<textarea
										rows={3}
										className='mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal'
										value={progressForm.current_performance}
										onChange={(event) =>
											setProgressForm({
												...progressForm,
												current_performance: event.target.value,
											})
										}
									/>
								</label>
								<label className='block text-sm font-medium'>
									Teacher remarks
									<textarea
										rows={3}
										className='mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal'
										value={progressForm.teacher_remarks}
										onChange={(event) =>
											setProgressForm({
												...progressForm,
												teacher_remarks: event.target.value,
											})
										}
									/>
								</label>
								<div className='grid gap-3 sm:grid-cols-2'>
									<label className='text-sm font-medium'>
										Follow-up actions
										<textarea
											rows={3}
											className='mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal'
											value={progressForm.follow_up_actions}
											onChange={(event) =>
												setProgressForm({
													...progressForm,
													follow_up_actions: event.target.value,
												})
											}
										/>
									</label>
									<label className='text-sm font-medium'>
										Next session date
										<input
											type='date'
											className='mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-normal'
											value={progressForm.next_session_date}
											onChange={(event) =>
												setProgressForm({
													...progressForm,
													next_session_date: event.target.value,
												})
											}
										/>
									</label>
								</div>
							</>
						)}
						<div className='flex justify-end gap-2'>
							<Button
								type='button'
								variant='outline'
								disabled={saving}
								onClick={() => setDialog(null)}
							>
								Cancel
							</Button>
							<Button type='submit' disabled={saving}>
								{saving
									? "Saving…"
									: dialog === "schedule"
										? "Schedule session"
										: "Save progress"}
							</Button>
						</div>
					</form>
				</div>
			)}
		</main>
	);
}
