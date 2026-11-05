"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
	Eye,
	Info,
	Search,
	X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import {
	classifyRisk,
	classifyEarlyLearningRisk,
	type RiskAssessment,
	type RiskAttendance,
	type RiskClass,
	type RiskClassRecord,
	type RiskCompetencyRecord,
	type RiskScore,
	type RiskStudent,
	type RiskThresholds,
} from "@/lib/risk-engine";
import {
	matchesPupilGender,
	PupilGenderFilter,
	sortPupilsAlphabetically,
	type PupilGenderFilterValue,
} from "@/components/pupils/gender-filter";
import { gradeLevelLabel, periodKeyForSchoolYear, periodOptionsForSchoolYear } from "@/lib/academic-structure";
import { DistributionChart, TrendChart } from "@/components/ui/trend-chart";

type Student = RiskStudent & {
	student_number: string;
	first_name: string;
	last_name: string;
	gender: "male" | "female" | null;
	parent_guardian_email: string | null;
	email_notifications_enabled: boolean;
};
type RiskSettingRow = {
	school_year: string;
	grade_level: number | null;
	subject_name: string | null;
	risk_thresholds: Partial<RiskThresholds> | null;
};
type Data = {
	classes: RiskClassRecord[];
	students: Student[];
	attendance: RiskAttendance[];
	competencyRecords: RiskCompetencyRecord[];
	assessments: (RiskAssessment & {
		title: string;
		school_year: string | null;
		grading_period: string;
	})[];
	scores: (RiskScore & { updated_at?: string })[];
	settings: RiskThresholds;
	settingRows: RiskSettingRow[];
};
type Risk = RiskClass;

const schoolYears = ["2024–2025", "2025–2026", "2026–2027", "2027–2028"];
async function fetchRiskData(): Promise<Data> {
	const supabase = createClient();
	const queries = await Promise.all([
		supabase
			.from("classes")
			.select("id, grade_level, section_name, school_year, subject_name")
			.eq("is_active", true),
		supabase
			.from("students")
			.select(
				"id, class_id, student_number, first_name, last_name, gender, parent_guardian_email, email_notifications_enabled",
			)
			.eq("is_active", true),
		supabase
			.from("attendance")
			.select("student_id, class_id, attendance_date, status")
			.order("attendance_date", { ascending: false })
			.order("student_id")
			.range(0, 999),
		supabase
			.from("assessments")
			.select(
				"id, class_id, title, subject, school_year, grading_period, assessment_date, total_points, passing_percentage",
			),
		supabase
			.from("assessment_scores")
			.select("assessment_id, student_id, score, updated_at")
			.order("updated_at", { ascending: true }),
		supabase
			.from("grading_settings")
			.select("risk_thresholds,grade_level,subject_name,school_year"),
		supabase
			.from("competency_records")
			.select("class_id,student_id,grading_period,rating"),
	]);
	for (const query of queries)
		if (query.error) throw new Error(query.error.message);
	const attendance: RiskAttendance[] = queries[2].data ?? [];
	for (let from = 1000; queries[2].data?.length === 1000; from += 1000) {
		const { data: nextPage, error: attendanceError } = await supabase
			.from("attendance")
			.select("student_id, class_id, attendance_date, status")
			.order("attendance_date", { ascending: false })
			.order("student_id")
			.range(from, from + 999);
		if (attendanceError) throw new Error(attendanceError.message);
		attendance.push(...(nextPage ?? []));
		if (nextPage?.length !== 1000) break;
	}
	const settingsRows = (queries[5].data ?? []) as RiskSettingRow[];
	const configured =
		settingsRows.find(
			(row) =>
				row.school_year === "2026–2027" &&
				row.grade_level === null &&
				(row.subject_name ?? "") === "",
		)?.risk_thresholds ?? {};
	const settings: RiskThresholds = {
		low_assessment_threshold: configured.low_assessment_threshold ?? 75,
		repeated_failed_assessments: configured.repeated_failed_assessments ?? 2,
		attendance_concern_absences: configured.attendance_concern_absences ?? 5,
		moderate_risk_score: configured.moderate_risk_score ?? 2,
		high_risk_score: configured.high_risk_score ?? 4,
		attendance_rate_concern: configured.attendance_rate_concern,
		repeated_lateness: configured.repeated_lateness,
		declining_assessments: configured.declining_assessments,
		severe_low_assessment_threshold: configured.severe_low_assessment_threshold,
	};
	return {
		classes: queries[0].data ?? [],
		students: queries[1].data ?? [],
		attendance,
		assessments: queries[3].data ?? [],
		scores: queries[4].data ?? [],
		competencyRecords: queries[6].data ?? [],
		settings,
		settingRows: settingsRows,
	};
}

function badge(level: Risk["level"]) {
	return level === "high"
		? "bg-destructive/10 text-destructive"
		: level === "moderate"
			? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
			: level === "low"
				? "bg-primary/10 text-primary"
				: "bg-muted text-muted-foreground";
}

function riskSettingsForStudent(
	student: Student,
	data: Data,
	selectedSchoolYear: string,
): RiskThresholds {
	const classRecord = data.classes.find((item) => item.id === student.class_id);
	const year = selectedSchoolYear || classRecord?.school_year || "";
	const settings = data.settingRows.filter((row) => row.school_year === year);
	const selectedSubject = classRecord?.subject_name ?? "";
	const matching =
		settings.find(
			(row) =>
				row.grade_level === classRecord?.grade_level &&
				(row.subject_name ?? "") === selectedSubject &&
				selectedSubject !== "",
		) ??
		settings.find(
			(row) =>
				row.grade_level === classRecord?.grade_level &&
				!(row.subject_name ?? "").trim(),
		) ??
		settings.find(
			(row) => row.grade_level === null && !(row.subject_name ?? "").trim(),
		) ??
		settings[0];
	const defaults: RiskThresholds = {
		low_assessment_threshold: 75,
		repeated_failed_assessments: 2,
		attendance_concern_absences: 5,
		moderate_risk_score: 2,
		high_risk_score: 4,
	};
	return { ...defaults, ...(matching?.risk_thresholds ?? {}) };
}

function classifyStudentRisk(student: Student, data: Data, schoolYear: string, period: string): RiskClass {
	const studentClass = data.classes.find((item) => item.id === student.class_id);
	const gradeLevel = studentClass?.grade_level;
	const selectedYear = schoolYear || studentClass?.school_year || "";
	const riskData = {
		...data,
		settings: riskSettingsForStudent(student, data, selectedYear),
	};
	return gradeLevel === 0 || gradeLevel === 1
		? classifyEarlyLearningRisk(student, riskData, selectedYear, period)
		: classifyRisk(student, riskData, selectedYear, period);
}

function performanceSummary(risk: RiskClass, gradeLevel?: number) {
	if (gradeLevel === 0 || gradeLevel === 1) {
		const progress = risk.competencyProgress;
		if (!progress?.rated) return "No competency ratings recorded";
		return `${progress.rated} competency ratings · ${progress.concerning} ${progress.concernLabel} · ${progress.developing} ${progress.developingLabel}`;
	}
	return risk.average === null ? "Not enough data" : `${risk.average.toFixed(1)}% average`;
}

function performanceCellSummary(risk: RiskClass, gradeLevel?: number) {
	if (gradeLevel === 0 || gradeLevel === 1) {
		const progress = risk.competencyProgress;
		if (!progress?.rated) return "No ratings";
		const concernCode = gradeLevel === 0 ? "BG" : "E";
		const developingCode = gradeLevel === 0 ? "DV" : "C/D";
		return `${progress.rated} rated · ${concernCode} ${progress.concerning} · ${developingCode} ${progress.developing}`;
	}
	return risk.average === null ? "No score" : `${risk.average.toFixed(1)}%`;
}

export default function RiskAssessmentPage() {
	const { data, error, isLoading } = useSWR("risk-assessment", fetchRiskData);
	const [search, setSearch] = useState("");
	const [schoolYear, setSchoolYear] = useState("");
	const [classId, setClassId] = useState("");
	const [period, setPeriod] = useState("");
	const [level, setLevel] = useState("");
	const [page, setPage] = useState(1);
	const [genderFilter, setGenderFilter] =
		useState<PupilGenderFilterValue>("all");
	const [selected, setSelected] = useState<Student | null>(null);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [sendingEmails, setSendingEmails] = useState(false);
	const [emailStatus, setEmailStatus] = useState("");
	const [followUpMessage, setFollowUpMessage] = useState("");
	const [followUpSaving, setFollowUpSaving] = useState(false);
	const [followUpStatus, setFollowUpStatus] = useState("");
	const [showRiskEmailPreview, setShowRiskEmailPreview] = useState(false);
	const [riskEmailStatus, setRiskEmailStatus] = useState("");
	async function sendSingleRiskEmail() {
		if (!selected || !selectedRisk || !selected.parent_guardian_email) {
			setRiskEmailStatus(
				"Add a guardian email to this pupil record before sending.",
			);
			return;
		}
		setSendingEmails(true);
		setRiskEmailStatus("");
		const response = await fetch("/api/parent-email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				studentId: selected.id,
				to: selected.parent_guardian_email,
				subject: `ElemBloom support update for ${selected.first_name} ${selected.last_name}`,
				message: `Dear Parent/Guardian,\n\nWe are sharing a supportive progress update for ${selected.first_name} ${selected.last_name}.\n\nCurrent risk indicator: ${selectedRisk.level.toUpperCase()}\nProgress: ${performanceSummary(selectedRisk, classes.find((item) => item.id === selected.class_id)?.grade_level)}\n${selectedRisk.factors.length ? `Areas to review: ${selectedRisk.factors.join(" ")}` : "No immediate areas requiring targeted support were identified from the available records."}\n\nThis indicator is a screening aid, not a prediction. We recommend working with the teacher on the next steps and ways to support learning at home.\n\nElemBloom`,
				type: "risk_update",
			}),
		});
		const body = await response.json().catch(() => ({}));
		setRiskEmailStatus(
			response.ok
				? "Risk report sent and recorded."
				: (body.error ?? "The risk report could not be sent."),
		);
		setSendingEmails(false);
		if (response.ok) setShowRiskEmailPreview(false);
	}
	async function sendRiskEmails() {
		const recipients = rows.filter(
			({ student }) =>
				selectedIds.includes(student.id) && student.parent_guardian_email,
		);
		if (!recipients.length) {
			setEmailStatus("Select pupils with a guardian email address.");
			return;
		}
		setSendingEmails(true);
		setEmailStatus("");
		const results = await Promise.all(
			recipients.map(({ student, risk }) =>
				fetch("/api/parent-email", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						studentId: student.id,
						to: student.parent_guardian_email,
						subject: `ElemBloom progress update for ${student.first_name} ${student.last_name}`,
						message: `Dear Parent/Guardian,\n\nThis is a progress update for ${student.first_name} ${student.last_name} (${student.student_number}).\n\nCurrent risk level: ${risk.level.toUpperCase()}\nProgress: ${performanceSummary(risk, classes.find((item) => item.id === student.class_id)?.grade_level)}\n\n${risk.factors.length ? `Factors to review: ${risk.factors.join(" ")}` : "No immediate risk factors were identified from the available records."}\n\nPlease contact the teacher so we can agree on supportive next steps.\n\nElemBloom`,
						type: "risk_update",
					}),
				}),
			),
		);
		const failedResponses = results.filter((result) => !result.ok);
		const errors = await Promise.all(
			failedResponses.map(async (result) => {
				const body = await result.json().catch(() => ({}));
				return body.error ?? `HTTP ${result.status}`;
			}),
		);
		setEmailStatus(
			failedResponses.length
				? `${failedResponses.length} message${failedResponses.length === 1 ? "" : "s"} could not be sent: ${errors[0]}`
				: `${recipients.length} unique guardian email${recipients.length === 1 ? "" : "s"} sent successfully.`,
		);
		setSendingEmails(false);
	}
	async function createFollowUp() {
		if (
			!selected ||
			!selectedRisk ||
			!["moderate", "high"].includes(selectedRisk.level)
		)
			return;
		if (followUpMessage.trim())
			sessionStorage.setItem(
				"interventionTeacherContext",
				followUpMessage.trim(),
			);
		window.location.assign(
			`/interventions?student=${encodeURIComponent(selected.id)}&createPlan=1`,
		);
	}
	const classes = data?.classes ?? [];
	const students = data?.students ?? [];
	const periods = [
		...new Map(
			classes
				.flatMap((item) => periodOptionsForSchoolYear(item.school_year))
				.map((item) => [item.short_label, item]),
		).values(),
	];
	useEffect(() => {
		setSelectedIds([]);
	}, [search, schoolYear, classId, period, level, genderFilter]);
	const rows = useMemo(
		() =>
			sortPupilsAlphabetically(
				students.filter((student) =>
					matchesPupilGender(student.gender, genderFilter),
				),
			)
				.map((student) => ({
					student,
					risk: classifyStudentRisk(student, data!, schoolYear, period),
				}))
				.filter(({ student, risk }) => {
					const cls = classes.find((item) => item.id === student.class_id);
					const text =
						`${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase();
					return (
						text.includes(search.toLowerCase()) &&
						(!schoolYear || cls?.school_year === schoolYear) &&
						(!classId || student.class_id === classId) &&
						(!level || risk.level === level)
					);
				}),
		[
			students,
			data,
			classes,
			search,
			schoolYear,
			classId,
			period,
			level,
			genderFilter,
		],
	);
	const pageRows = rows.slice(
		(page - 1) * DEFAULT_PAGE_SIZE,
		page * DEFAULT_PAGE_SIZE,
	);
	const summary = useMemo(
		() =>
			students
				.map((student) =>
					classifyStudentRisk(student, data!, schoolYear, period),
				)
				.reduce(
					(counts, risk) => ({
						...counts,
						[risk.level]: counts[risk.level] + 1,
					}),
					{ high: 0, moderate: 0, low: 0, incomplete: 0 },
				),
		[students, data, schoolYear, period],
	);
	const assessmentTrend = useMemo(() => {
		if (!data || !rows.length) return [];
		const visibleStudentIds = new Set(rows.map(({ student }) => student.id));
		const visibleClassIds = new Set(rows.map(({ student }) => student.class_id));
		const matchingAssessments = data.assessments.filter((assessment) => {
			const classRecord = classes.find((item) => item.id === assessment.class_id);
			return (classRecord?.grade_level ?? 2) > 1
				&& visibleClassIds.has(assessment.class_id)
				&& (!schoolYear || classRecord?.school_year === schoolYear)
				&& (!period || periodKeyForSchoolYear(assessment.grading_period, classRecord?.school_year) === period);
		});
		const byDate = new Map<string, number[]>();
		for (const assessment of matchingAssessments) {
			const assessmentScores = data.scores
				.filter((score) => score.assessment_id === assessment.id && visibleStudentIds.has(score.student_id))
				.reduce((latest, score) => {
					const current = latest.get(score.student_id);
					if (!current || String(score.updated_at ?? "").localeCompare(String(current.updated_at ?? "")) > 0) {
						latest.set(score.student_id, score);
					}
					return latest;
				}, new Map<string, (typeof data.scores)[number]>());
			const percentages = [...assessmentScores.values()]
				.filter((score) => score.score !== null && assessment.total_points > 0)
				.map((score) => (Number(score.score) / Number(assessment.total_points)) * 100)
				.filter(Number.isFinite);
			if (percentages.length) byDate.set(assessment.assessment_date, [...(byDate.get(assessment.assessment_date) ?? []), ...percentages]);
		}
		return [...byDate.entries()]
			.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
			.map(([date, values]) => ({
				label: date,
				value: values.reduce((sum, value) => sum + value, 0) / values.length,
			}));
	}, [data, rows, classes, schoolYear, period]);
	const competencyTrend = useMemo(() => {
		if (!data || !rows.length) return [];
		const visibleStudentIds = new Set(rows.map(({ student }) => student.id));
		const earlyClasses = classes.filter((item) =>
			(item.grade_level === 0 || item.grade_level === 1) &&
			(!classId || item.id === classId) &&
			(!schoolYear || item.school_year === schoolYear),
		);
		const earlyClassIds = new Set(earlyClasses.map((item) => item.id));
		return [...new Set(earlyClasses.map((item) => item.school_year))]
			.flatMap((year) => periodOptionsForSchoolYear(year))
			.filter((item, index, options) =>
				options.findIndex((candidate) => candidate.short_label === item.short_label) === index &&
				(!period || item.short_label === period),
			)
			.map((item) => {
				const records = data.competencyRecords.filter((record) =>
					earlyClassIds.has(record.class_id) &&
					visibleStudentIds.has(record.student_id) &&
					periodKeyForSchoolYear(record.grading_period, classes.find((cls) => cls.id === record.class_id)?.school_year) === item.short_label,
				);
				const concerningCount = records.filter((record) =>
					record.rating === "BG" || record.rating === "E",
				).length;
				return records.length ? { label: item.display_name, value: concerningCount } : null;
			})
			.filter((point): point is { label: string; value: number } => point !== null);
	}, [data, rows, classes, classId, schoolYear, period]);
	const selectedClass = classId ? classes.find((item) => item.id === classId) : null;
	const showCompetencyTrend = selectedClass?.grade_level === 0 || selectedClass?.grade_level === 1;
	const performanceTrend = showCompetencyTrend ? competencyTrend : assessmentTrend;
	const selectedRisk =
		selected && data
			? classifyStudentRisk(selected, data, schoolYear, period)
			: null;
	const selectedThresholds =
		selected && data
			? riskSettingsForStudent(selected, data, schoolYear)
			: null;
	const selectedRiskTrend = useMemo(() => {
		if (!selected || !data) return [];
		const studentClass = classes.find((item) => item.id === selected.class_id);
		if (!studentClass) return [];
		return periodOptionsForSchoolYear(studentClass.school_year)
			.map((item) => {
				const risk = classifyStudentRisk(selected, data, studentClass.school_year, item.short_label);
				return risk.level === "incomplete"
					? null
					: { label: item.display_name, value: risk.totalPoints };
			})
			.filter((point): point is { label: string; value: number } => point !== null);
	}, [selected, data, classes]);
	if (isLoading)
		return (
			<section className='mx-auto max-w-7xl p-6'>
				<p className='text-sm text-muted-foreground'>Loading risk overview…</p>
			</section>
		);
	if (error)
		return (
			<section className='mx-auto max-w-7xl p-6'>
				<div className='rounded-xl border border-destructive/30 bg-destructive/5 p-5'>
					<h1 className='font-semibold'>Unable to load risk assessment</h1>
					<p className='mt-2 text-sm text-muted-foreground'>{error.message}</p>
				</div>
			</section>
		);
	return (
		<section className='mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8'>
			<div>
				<p className='text-sm font-medium text-primary'>
					Early support screening
				</p>
				<h1 className='mt-1 text-3xl font-bold tracking-tight'>
					Risk Assessment
				</h1>
				<p className='mt-2 max-w-2xl text-muted-foreground'>
					Identify pupils who may benefit from timely, focused support using
					attendance and grade-appropriate learning records.
				</p>
			</div>
			<div className='grid gap-4 lg:grid-cols-[2fr_1fr]'>
				<TrendChart
					title={showCompetencyTrend ? "Competency ratings needing support" : "Assessment performance trend"}
					points={performanceTrend}
					valueSuffix={showCompetencyTrend ? " ratings" : "%"}
					caption={showCompetencyTrend ? "Count of Beginning (Kinder) or Emerging (Grade 1) competency descriptors by term; ratings are not converted to numeric grades." : undefined}
					emptyMessage={showCompetencyTrend ? "No Beginning or Emerging competency ratings are recorded for the selected class and period." : undefined}
				/>
				<DistributionChart
					title='Risk-level distribution (all pupils)'
					items={[
						{ label: "High risk", count: summary.high, color: "bg-destructive" },
						{ label: "Moderate risk", count: summary.moderate, color: "bg-amber-500" },
						{ label: "Low risk", count: summary.low, color: "bg-emerald-500" },
						{ label: "Incomplete data", count: summary.incomplete, color: "bg-sky-500" },
					]}
				/>
			</div>
			<div className='rounded-xl border bg-card p-4'>
				<div className='flex flex-wrap gap-3'>
					<label className='flex min-w-56 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm'>
						<Search />
						<span className='sr-only'>Search pupils</span>
						<input
							className='min-w-0 flex-1 bg-transparent outline-none'
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
							}}
							placeholder='Search pupil or student number'
						/>
					</label>
					<select
						aria-label='School year'
						value={schoolYear}
						onChange={(event) => {
							setSchoolYear(event.target.value);
							setPage(1);
						}}
						className='rounded-lg border bg-background px-3 py-2 text-sm'
					>
						<option value=''>All school years</option>
						{schoolYears.map((item) => (
							<option key={item}>{item}</option>
						))}
					</select>
					<select
						aria-label='Class'
						value={classId}
						onChange={(event) => {
							setClassId(event.target.value);
							setPage(1);
						}}
						className='rounded-lg border bg-background px-3 py-2 text-sm'
					>
						<option value=''>All classes</option>
						{classes.map((item) => (
							<option key={item.id} value={item.id}>
								{gradeLevelLabel(item.grade_level)} – {item.section_name}
							</option>
						))}
					</select>
					<select
						aria-label='Grading period'
						value={period}
						onChange={(event) => {
							setPeriod(event.target.value);
							setPage(1);
						}}
						className='rounded-lg border bg-background px-3 py-2 text-sm'
					>
						<option value=''>All grading periods</option>
						{periods.map((item) => (
							<option key={item.short_label} value={item.short_label}>
								{item.display_name}
							</option>
						))}
					</select>
					<select
						aria-label='Risk level'
						value={level}
						onChange={(event) => {
							setLevel(event.target.value);
							setPage(1);
						}}
						className='rounded-lg border bg-background px-3 py-2 text-sm'
					>
						<option value=''>All risk levels</option>
						<option value='high'>High</option>
						<option value='moderate'>Moderate</option>
						<option value='low'>Low</option>
						<option value='incomplete'>Incomplete</option>
					</select>
				</div>
			</div>
			<div className='flex justify-end'>
				{/* <PupilGenderFilter
					value={genderFilter}
					onChange={(value) => {
						setGenderFilter(value);
						setPage(1);
					}}
				/> */}
			</div>
			<div className='rounded-xl border bg-card p-4'>
				<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<h2 className='font-semibold'>Guardian updates</h2>
						<p className='text-sm text-muted-foreground'>
							Select pupils below to generate one personalized message per
							guardian.
						</p>
					</div>
					<div className='flex flex-wrap gap-2'>
						{/* <Button
							type='button'
							variant='outline'
							onClick={() => window.location.assign("/api/auth/google/start")}
						>
							Connect Gmail
						</Button> */}
						<Button
							type='button'
							onClick={() => void sendRiskEmails()}
							disabled={sendingEmails || selectedIds.length === 0}
						>
							{sendingEmails
								? "Sending…"
								: `Send email to selected (${selectedIds.length})`}
						</Button>
					</div>
				</div>
				{emailStatus && (
					<p className='mt-2 text-sm text-muted-foreground' role='status'>
						{emailStatus}
					</p>
				)}
				<p className='mt-2 text-sm text-muted-foreground'>
					{selectedIds.length} selected
				</p>
			</div>
			<div className='overflow-hidden rounded-xl border bg-card'>
				<div className='flex justify-between border-b p-5'>
					<div>
						{" "}
						<h2 className='font-semibold'>Pupil risk register</h2>
						<p className='mt-1 text-sm text-muted-foreground'>
							{rows.length} pupil{rows.length === 1 ? "" : "s"} shown
						</p>{" "}
					</div>

					<div>
						{" "}
						<PupilGenderFilter
							value={genderFilter}
							onChange={(value) => {
								setGenderFilter(value);
								setPage(1);
							}}
						/>
					</div>
				</div>

				{rows.length === 0 ? (
					<div className='p-12 text-center text-sm text-muted-foreground'>
						No pupils match the selected filters.
					</div>
				) : (
					<div className='overflow-x-auto'>
						<table className='w-full min-w-[1040px] table-fixed text-left text-sm'>
							<colgroup>
								<col className='w-10' />
								<col className='w-[12%]' />
								<col className='w-[18%]' />
								<col className='w-[15%]' />
								<col className='w-[16%]' />
								<col className='w-[12%]' />
								<col className='w-[10%]' />
								<col className='w-[17%]' />
							</colgroup>
							<thead className='bg-muted/40 text-xs text-muted-foreground'>
								<tr>
									<th className='px-5 py-3'>
										<input
											type='checkbox'
											aria-label='Select all visible risk assessments'
											checked={
												pageRows.length > 0 &&
												pageRows.every(({ student }) =>
													selectedIds.includes(student.id),
												)
											}
											onChange={(event) =>
												setSelectedIds((current) =>
													event.target.checked
														? [
																...new Set([
																	...current,
																	...pageRows.map(({ student }) => student.id),
																]),
															]
														: current.filter(
																(id) =>
																	!pageRows.some(
																		({ student }) => student.id === id,
																	),
															),
												)
											}
										/>
									</th>
									<th className='px-5 py-3'>Student number</th>
									<th className='px-5 py-3'>Pupil name</th>
									<th className='px-5 py-3'>Grade and section</th>
									<th className='px-5 py-3'>Performance</th>
									<th className='px-5 py-3'>Attendance</th>
									<th className='px-5 py-3'>Risk</th>
									<th className='px-5 py-3'>Action</th>
								</tr>
							</thead>
							<tbody className='divide-y'>
								{pageRows.map(({ student, risk }) => {
									const cls = classes.find(
										(item) => item.id === student.class_id,
									);
									return (
										<tr key={student.id}>
											<td className='px-5 py-4 font-medium'>
												<input
													type='checkbox'
													aria-label={`Select ${student.first_name} ${student.last_name}`}
													checked={selectedIds.includes(student.id)}
													onChange={(event) =>
														setSelectedIds((current) =>
															event.target.checked
																? [...current, student.id]
																: current.filter((id) => id !== student.id),
														)
													}
												/>
											</td>
											<td>{student.student_number}</td>
											<td className='px-5 py-4'>
												{student.last_name}, {student.first_name}
											</td>
											<td className='px-5 py-4 text-muted-foreground'>
												{gradeLevelLabel(cls?.grade_level)} · {cls?.section_name}
											</td>
											<td className='px-5 py-4'>
												<span
													className='block max-w-48 truncate'
													title={performanceSummary(risk, cls?.grade_level)}
												>
													{performanceCellSummary(risk, cls?.grade_level)}
												</span>
											</td>
											<td className='px-5 py-4'>
												{`${risk.absences} absent · ${risk.lates} late`}
											</td>
											<td className='px-5 py-4'>
												<span
													className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge(risk.level)}`}
												>
													{risk.label}
												</span>
											</td>
											<td className='px-5 py-4'>
												<Button
													variant='ghost'
													size='sm'
													onClick={() => setSelected(student)}
												>
													<Eye data-icon='inline-start' />
													View details
												</Button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
				<Pagination
					page={page}
					totalItems={rows.length}
					onPageChange={setPage}
				/>
			</div>
			{selected && selectedRisk && (
				<div className='rounded-xl border bg-card p-5'>
					<div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
						<div>
							<h2 className='font-semibold'>Follow-up actions</h2>
							<p className='mt-1 text-sm text-muted-foreground'>
								Create a trackable support plan for {selected.first_name}{" "}
								{selected.last_name}, or prepare a parent/guardian draft.
							</p>
						</div>
						<div className='flex flex-wrap gap-2'>
							<Button
								type='button'
								variant='outline'
								onClick={() => setShowRiskEmailPreview(true)}
							>
								Preview parent risk report
							</Button>
							{["moderate", "high"].includes(selectedRisk.level) && (
								<Button
									type='button'
									onClick={() =>
										window.location.assign(
											`/interventions?student=${selected.id}`,
										)
									}
								>
									Create intervention plan
								</Button>
							)}
							<Button
								type='button'
								onClick={() => void createFollowUp()}
								disabled={followUpSaving}
							>
								{followUpSaving ? "Creating…" : "Create follow-up plan"}
							</Button>
						</div>
					</div>
					<textarea
						value={followUpMessage}
						onChange={(event) => setFollowUpMessage(event.target.value)}
						className='mt-4 min-h-20 w-full rounded-lg border bg-background p-3 text-sm'
						placeholder='Optional teacher note for the intervention plan'
					/>
					{followUpStatus && (
						<p className='mt-2 text-sm text-muted-foreground' role='status'>
							{followUpStatus}
						</p>
					)}
					{showRiskEmailPreview && (
						<div className='mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4'>
							<p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
								Preview before sending
							</p>
							<p className='mt-2 whitespace-pre-wrap text-sm'>
								Dear Parent/Guardian,\n\nWe are sharing a supportive progress
								update for {selected.first_name} {selected.last_name}
								.\n\nCurrent risk indicator: {selectedRisk.level.toUpperCase()}
								\n
								{selectedRisk.factors.length
									? `Areas to review: ${selectedRisk.factors.join(" ")}`
									: "No immediate areas requiring targeted support were identified from the available records."}
								\n\nThis indicator is a screening aid, not a prediction. We
								recommend working with the teacher on the next steps and ways to
								support learning at home.\n\nElemBloom
							</p>
							<div className='mt-3 flex flex-wrap gap-2'>
								<Button
									type='button'
									onClick={() => void sendSingleRiskEmail()}
									disabled={sendingEmails || !selected.parent_guardian_email}
								>
									{sendingEmails ? "Sending…" : "Confirm and send"}
								</Button>
								<Button
									type='button'
									variant='ghost'
									onClick={() => setShowRiskEmailPreview(false)}
								>
									Cancel
								</Button>
							</div>
							{riskEmailStatus && (
								<p className='mt-2 text-sm text-muted-foreground' role='status'>
									{riskEmailStatus}
								</p>
							)}
						</div>
					)}
					<div className='mt-5 rounded-lg border bg-muted/30 p-4'>
						<p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
							Parent/guardian message draft
						</p>
						<p className='mt-2 whitespace-pre-wrap text-sm'>
							Hello, we are reviewing {selected.first_name} {selected.last_name}
							&apos;s learning progress and would like to work together on the
							next steps. We noticed{" "}
							{selectedRisk.factors.join(" ") ||
								"some records need review"}{" "}
							Please contact the teacher so we can agree on a supportive plan.
						</p>
						<p className='mt-3 text-xs text-muted-foreground'>
							Email delivery is not enabled because no email integration is
							connected. Copy this draft into your approved communication
							channel.
						</p>
					</div>
				</div>
			)}
			<div className='flex gap-2 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground'>
				<Info />{" "}
				<p>
					This rule-based classification is a screening aid for teacher review,
					not a diagnosis or definitive prediction. Missing records are never
					treated as zero.
				</p>
			</div>
			{selected && selectedRisk && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4'
					role='dialog'
					aria-modal='true'
					aria-labelledby='risk-details-title'
				>
					<div className='max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl'>
						<div className='flex items-start justify-between'>
							<div>
								<p className='text-sm text-primary'>Pupil risk details</p>
								<h2
									id='risk-details-title'
									className='mt-1 text-2xl font-semibold'
								>
									{selected.last_name}, {selected.first_name}
								</h2>
								<p className='mt-1 text-sm text-muted-foreground'>
									{selected.student_number}
								</p>
							</div>
							<button onClick={() => setSelected(null)} aria-label='Close'>
								<X />
							</button>
						</div>
						<div className='mt-6 flex items-center justify-between rounded-xl border p-4'>
							<span
								className={`rounded-full px-3 py-1 text-sm font-semibold ${badge(selectedRisk.level)}`}
							>
								{selectedRisk.label}
							</span>
							<span className='text-sm text-muted-foreground'>
								Last assessed: {selectedRisk.assessed ?? "Not assessed"}
							</span>
						</div>
						<div className='mt-6 grid gap-4 sm:grid-cols-3'>
							<div>
								<p className='text-xs text-muted-foreground'>
									{selectedRisk.competencyProgress ? "Non-numeric competency progress" : "Assessment average"}
								</p>
								<p className='mt-1 text-xl font-semibold'>
									{selectedRisk.competencyProgress
										? performanceSummary(selectedRisk, classes.find((item) => item.id === selected.class_id)?.grade_level)
										: selectedRisk.average === null
											? "Unavailable"
											: `${selectedRisk.average.toFixed(1)}%`}
								</p>
							</div>
							<div>
								<p className='text-xs text-muted-foreground'>
									{selectedRisk.competencyProgress ? "Ratings needing support" : "Failed assessments"}
								</p>
								<p className='mt-1 text-xl font-semibold'>
									{selectedRisk.failed}
								</p>
							</div>
							<div>
								<p className='text-xs text-muted-foreground'>
									Recorded absences
								</p>
								<p className='mt-1 text-xl font-semibold'>
									{selectedRisk.absences}
								</p>
							</div>
						</div>
						<div className='mt-6'>
							<TrendChart
								title='Risk points by grading period'
								points={selectedRiskTrend}
								maxValue={selectedRisk.competencyProgress ? 8 : 11}
								valueSuffix=' pts'
								caption={selectedRisk.competencyProgress
									? "Points from attendance and non-numeric competency-descriptor indicators; ratings are not converted to grades."
									: "Points from triggered academic and attendance rules; lower values indicate fewer current flags"}
								emptyMessage={selectedRisk.competencyProgress
									? "No grading periods have enough competency-rating and attendance data to show a risk-point trend."
									: "No grading periods have enough assessment and attendance data to show a risk-point trend."}
							/>
						</div>
						<div className='mt-6 rounded-xl border bg-muted/20 p-4'>
							<div className='flex flex-wrap items-start justify-between gap-3'>
								<div>
									<h3 className='font-semibold'>How this risk value is computed</h3>
									<p className='mt-1 text-sm text-muted-foreground'>
										{selectedRisk.competencyProgress
											? "Kinder and Grade 1 progress uses the recorded non-numeric competency descriptors. Beginning/Emerging and developing descriptors are considered alongside attendance; no ratings are converted to percentages or numeric grades. Attendance rate is (non-excused records − absences) ÷ non-excused records."
											: "Assessment percentages use each latest score ÷ total points × 100; the average is the mean of recorded percentages. Failed assessments are below their own passing marks. Attendance rate is (non-excused records − absences) ÷ non-excused records."} Each triggered rule below adds its points.
									</p>
								</div>
								<div className='text-right'>
									<p className='text-lg font-semibold tabular-nums'>
										{selectedRisk.totalPoints} points
									</p>
									<p className='text-xs text-muted-foreground'>
										Academic {selectedRisk.academicPoints} + Attendance {selectedRisk.attendancePoints}
									</p>
								</div>
							</div>
							<ul className='mt-4 divide-y rounded-lg border bg-background'>
								{selectedRisk.scoreBreakdown.map((item) => (
									<li
										key={item.label}
										className='flex items-start justify-between gap-4 p-3 text-sm'
									>
										<div>
											<p className='font-medium'>{item.label}</p>
											<p className='mt-0.5 text-xs text-muted-foreground'>
												{item.area} · {item.detail}
											</p>
										</div>
										<span className='shrink-0 font-semibold tabular-nums'>
											{item.points > 0 ? `+${item.points}` : "0"} pts
										</span>
									</li>
								))}
							</ul>
							{selectedThresholds && (
								<p className='mt-3 text-xs text-muted-foreground'>
									{selectedRisk.level === "incomplete"
										? selectedRisk.competencyProgress
											? "The level is incomplete until competency ratings and attendance records are available. Missing data is not counted as zero."
											: "The level is incomplete until both assessment scores and attendance records are available. Missing data is not counted as zero."
										: `Level thresholds: High at ${selectedThresholds.high_risk_score}+ points; Moderate at ${selectedThresholds.moderate_risk_score}+ points; Low below ${selectedThresholds.moderate_risk_score} points.`}
								</p>
							)}
						</div>
						<div className='mt-6 grid gap-5 sm:grid-cols-2'>
							<div>
								<h3 className='font-semibold'>Contributing factors</h3>
								{selectedRisk.factors.length ? (
									<ul className='mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground'>
										{selectedRisk.factors.map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								) : (
									<p className='mt-2 text-sm text-muted-foreground'>
										No concerning factors measured.
									</p>
								)}
							</div>
							<div>
								<h3 className='font-semibold'>Unavailable information</h3>
								{selectedRisk.missing.length ? (
									<ul className='mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground'>
										{selectedRisk.missing.map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								) : (
									<p className='mt-2 text-sm text-muted-foreground'>
										No known gaps for this view.
									</p>
								)}
							</div>
						</div>
						<div className='mt-6 flex justify-end'>
							<Button
								render={<Link href={`/pupils/${selected.id}`} />}
								variant='outline'
							>
								Open pupil record
							</Button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
