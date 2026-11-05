"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import {
	ArrowLeft,
	CalendarDays,
	CheckCircle2,
	Clock3,
	FileText,
	Mail,
	Pencil,
	ShieldAlert,
	XCircle,
} from "lucide-react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { calculateGrade, type GradingPolicy } from "@/lib/grading-engine";
import {
	categoryWeightsFor,
	descriptorForGrade,
	gradeLevelLabel,
	isTrimesterSchoolYear,
	mapehCompositeTermGrade,
	mapehFinalGrade,
	normalizeCategoryWeights,
	periodKeyForSchoolYear,
	periodLabelForSchoolYear,
	gradingPeriodsForGrade,
	kinderCompetencyDomains,
	kinderCompetencyKey,
	kinderCompetencyList,
	subjectsForGrade,
} from "@/lib/academic-structure";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/ui/trend-chart";

type Student = {
	id: string;
	class_id: string;
	student_number: string;
	first_name: string;
	last_name: string;
	gender: "male" | "female" | null;
	parent_guardian_name: string | null;
	parent_guardian_email: string | null;
	is_active: boolean;
};
type Assessment = {
	id: string;
	class_id: string;
	school_year: string;
	activity_id: string | null;
	subject_offering_id: string | null;
	grading_category: string | null;
	title: string;
	assessment_type: string;
	subject: string;
	grading_period: string;
	assessment_date: string;
	total_points: number;
	assessment_scores: { student_id: string; score: number | null }[];
};
type Attendance = {
	id: string;
	attendance_date: string;
	status: "present" | "late" | "absent" | "excused";
};
type ClassRecord = {
	id: string;
	grade_level: number;
	section_name: string;
	school_year: string;
};
type GradingSettings = {
	passing_grade: number;
	decimal_places: number;
	rounding_method: string;
	grading_weights: Record<string, number>;
	grade_conversion_rules: {
		bands?: { label: string; min: number; max: number }[];
	};
};
type ClassGradingConfiguration = {
	class_subject_id: string;
	school_year: string;
	grading_period: string;
	written_work_weight: number;
	performance_tasks_weight: number;
	quarterly_exam_weight: number;
	passing_grade: number;
	decimal_places: number;
	rounding_method: string;
};
type CompetencyRecord = {
	id: string;
	subject_offering_id: string;
	grading_period: string;
	competency: string;
	rating: string;
	notes: string | null;
};
type EarlyLearningReport = {
	id: string;
	class_id: string;
	student_id: string;
	school_year: string;
	grading_period: string;
	what_child_can_do: string;
	learning_to_improve: string;
	teacher_comments: string;
};

const formatDate = (value: string) =>
	new Intl.DateTimeFormat("en-PH", {
		dateStyle: "medium",
		timeZone: "Asia/Manila",
	}).format(new Date(`${value}T00:00:00+08:00`));
const statusLabel = (status: Attendance["status"]) =>
	status.charAt(0).toUpperCase() + status.slice(1);
function throwQueryError(
	source: string,
	error: { message: string; code?: string } | null,
) {
	if (!error) return;
	throw new Error(
		`${source}: ${error.message}${error.code ? ` (${error.code})` : ""}`,
	);
}
async function fetchDetails(id: string) {
	const supabase = createClient();
	const { data: student, error: studentError } = await supabase
		.from("students")
		.select(
			"id, class_id, student_number, first_name, last_name, gender, parent_guardian_name, parent_guardian_email, is_active",
		)
		.eq("id", id)
		.single();
	throwQueryError("Pupil record", studentError);
	if (!student) throw new Error("Pupil record: no matching pupil was found.");
	const [
		assessmentResult,
		classResult,
		attendanceResult,
		offeringsResult,
		competencyResult,
		earlyReportsResult,
	] = await Promise.all([
		supabase
			.from("assessments")
			.select(
				"id,class_id,school_year,activity_id,subject_offering_id,grading_category,title,assessment_type,subject,grading_period,assessment_date,total_points,assessment_scores(student_id,score)",
			)
			.eq("class_id", student.class_id)
			.order("assessment_date", { ascending: false }),
		supabase
			.from("classes")
			.select("id, grade_level, section_name, school_year")
			.eq("id", student.class_id)
			.single(),
		supabase
			.from("attendance")
			.select("id, attendance_date, status")
			.eq("student_id", id)
			.eq("class_id", student.class_id)
			.order("attendance_date", { ascending: false }),
		supabase
			.from("class_subjects")
			.select("id,subject_name")
			.eq("class_id", student.class_id)
			.eq("is_active", true),
		supabase
			.from("competency_records")
			.select("id,subject_offering_id,grading_period,competency,rating,notes")
			.eq("student_id", id),
		supabase
			.from("early_learning_reports")
			.select("id,class_id,student_id,school_year,grading_period,what_child_can_do,learning_to_improve,teacher_comments")
			.eq("class_id", student.class_id)
			.eq("student_id", id),
	]);
	throwQueryError("Academic activities and scores", assessmentResult.error);
	throwQueryError("Class record", classResult.error);
	throwQueryError("Attendance history", attendanceResult.error);
	throwQueryError("Subject offerings", offeringsResult.error);
	throwQueryError("Competency records", competencyResult.error);
	throwQueryError("Term progress reports", earlyReportsResult.error);
	if (!classResult.data)
		throw new Error("Class record: no class was found for this pupil.");
	const offerings = offeringsResult.data ?? [];
	const [{ data: settings, error: settingsError }, configResult] =
		await Promise.all([
			supabase
				.from("grading_settings")
				.select(
					"passing_grade,decimal_places,rounding_method,grading_weights,grade_conversion_rules",
				)
				.eq("school_year", classResult.data.school_year)
				.eq("subject_name", "")
				.is("grade_level", null)
				.order("updated_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
			offerings.length
				? supabase
						.from("class_grading_configurations")
						.select(
							"class_subject_id,school_year,grading_period,written_work_weight,performance_tasks_weight,quarterly_exam_weight,passing_grade,decimal_places,rounding_method",
						)
						.in(
							"class_subject_id",
							offerings.map((item) => item.id),
						)
						.eq("school_year", classResult.data.school_year)
						.eq("is_active", true)
				: Promise.resolve({ data: [], error: null }),
		]);
	throwQueryError("Grading settings", settingsError);
	throwQueryError("Class grading configuration", configResult.error);
	return {
		student: student as Student,
		assessments: (assessmentResult.data ?? []) as Assessment[],
		classRecord: classResult.data as ClassRecord,
		attendance: (attendanceResult.data ?? []) as Attendance[],
		settings: (settings ?? null) as GradingSettings | null,
		offerings,
		configurations: (configResult.data ?? []) as ClassGradingConfiguration[],
		competencies: (competencyResult.data ?? []) as CompetencyRecord[],
		earlyLearningReports: (earlyReportsResult.data ?? []) as EarlyLearningReport[],
	};
}

function Stat({
	label,
	value,
	tone,
}: {
	label: string;
	value: string | number;
	tone: string;
}) {
	return (
		<div className='rounded-xl border bg-card p-4'>
			<p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
				{label}
			</p>
			<p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
		</div>
	);
}

export default function PupilDetails({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const { data, error, isLoading } = useSWR(
		["pupil-details", id],
		([, pupilId]) => fetchDetails(pupilId),
		{ revalidateOnFocus: true },
	);
	const [period, setPeriod] = useState("all");
	const [subject, setSubject] = useState("all");
	const [attendanceYear, setAttendanceYear] = useState("all");
	const [fromDate, setFromDate] = useState("");
	const [toDate, setToDate] = useState("");
	const [calendarMonth, setCalendarMonth] = useState(() => new Date());
	const [showReport, setShowReport] = useState(false);
	const [reportSubject, setReportSubject] = useState("");
	const [reportPeriod, setReportPeriod] = useState("Full Year");
	const [sendingReport, setSendingReport] = useState(false);
	const [reportSendMessage, setReportSendMessage] = useState("");
	const [reportSendError, setReportSendError] = useState("");

	const attendance = data?.attendance ?? [];
	const attendanceYears = [
		...new Set(attendance.map((item) => item.attendance_date.slice(0, 4))),
	]
		.sort()
		.reverse();
	const filteredAttendance = attendance.filter(
		(item) =>
			(attendanceYear === "all" ||
				item.attendance_date.startsWith(attendanceYear)) &&
			(!fromDate || item.attendance_date >= fromDate) &&
			(!toDate || item.attendance_date <= toDate),
	);
	const attendanceSummary = useMemo(
		() =>
			filteredAttendance.reduce(
				(summary, item) => ({
					...summary,
					[item.status]: summary[item.status] + 1,
				}),
				{ present: 0, late: 0, absent: 0, excused: 0 },
			),
		[filteredAttendance],
	);
	const eligibleDays =
		attendanceSummary.present +
		attendanceSummary.late +
		attendanceSummary.absent;
	const attendanceRate = eligibleDays
		? Math.round(
				((attendanceSummary.present + attendanceSummary.late) / eligibleDays) *
					100,
			)
		: null;

	if (isLoading)
		return (
			<section className='p-8 text-sm text-muted-foreground'>
				Loading pupil profile…
			</section>
		);
	if (error || !data)
		return (
			<section className='mx-auto max-w-3xl p-6 lg:p-8'>
				<div className='rounded-xl border border-destructive/30 bg-destructive/5 p-5'>
					<h1 className='font-semibold text-destructive'>
						Unable to load this pupil profile
					</h1>
					<p className='mt-2 text-sm text-muted-foreground' role='alert'>
						{error instanceof Error
							? error.message
							: "The pupil profile could not be loaded. Please try again."}
					</p>
					<Button
						render={<Link href='/pupils' />}
						variant='outline'
						className='mt-4'
					>
						<ArrowLeft data-icon='inline-start' />
						Back to pupils
					</Button>
				</div>
			</section>
		);

	const { student, classRecord } = data;
	const isCompetencyClass = classRecord.grade_level <= 1;
	const assessments = data.assessments.filter((item) => {
		const itemPeriod = periodKeyForSchoolYear(
			item.grading_period,
			classRecord.school_year,
		);
		return (
			!(
				isTrimesterSchoolYear(classRecord.school_year) && itemPeriod === "Q4"
			) &&
			(period === "all" || itemPeriod === period) &&
			(subject === "all" || item.subject === subject)
		);
	});
	const scoreForStudent = (item: Assessment) =>
		item.assessment_scores.find((score) => score.student_id === student.id)
			?.score;
	const scored = assessments.flatMap((item) =>
		scoreForStudent(item) == null
			? []
			: [
					{
						score: Number(scoreForStudent(item)),
						total: Number(item.total_points),
						subject: item.subject,
					},
				],
	);
	const performanceTrend = assessments
		.flatMap((item) => {
			const score = scoreForStudent(item);
			const total = Number(item.total_points);
			if (score == null || !Number.isFinite(total) || total <= 0) return [];
			const value = (Number(score) / total) * 100;
			return Number.isFinite(value)
				? [{ label: item.title, value, date: item.assessment_date }]
				: [];
		})
		.sort((a, b) => a.date.localeCompare(b.date))
		.map(({ label, value }, index) => ({
			label: String(index + 1),
			value,
			tooltip: label,
		}));
	const average =
		!isCompetencyClass && scored.length
			? Math.round(
					(scored.reduce((sum, item) => sum + item.score / item.total, 0) /
						scored.length) *
						100,
				)
			: null;
	const subjectNames = [
		...new Set([
			...(classRecord.grade_level === 1 ? subjectsForGrade(1) : []),
			...data.offerings.map((item) => item.subject_name),
			...data.assessments.map((item) => item.subject),
		]),
	];
	const subjects =
		classRecord.grade_level >= 2 &&
		subjectNames.includes("Music and Arts") &&
		subjectNames.includes("Physical Education and Health")
			? [...subjectNames, "MAPEH"]
			: subjectNames;
	const availablePeriods = gradingPeriodsForGrade(
		classRecord.grade_level,
		classRecord.school_year,
		data.assessments.map((item) => ({
			short_label: item.grading_period,
			display_name: item.grading_period,
		})),
	);
	const subjectAverages = isCompetencyClass
		? []
		: subjects
				.map((name) => {
					const values = scored.filter((item) => item.subject === name);
					return {
						name,
						value: values.length
							? Math.round(
									(values.reduce(
										(sum, item) => sum + item.score / item.total,
										0,
									) /
										values.length) *
										100,
								)
							: 0,
					};
				})
				.filter((item) => item.value > 0);
	const reportPeriods = gradingPeriodsForGrade(
		classRecord.grade_level,
		classRecord.school_year,
		data.assessments
			.filter((item) => item.school_year === classRecord.school_year)
			.map((item) => ({
				short_label: item.grading_period,
				display_name: item.grading_period,
			})),
	);
	const reportRows = reportPeriods.map(({ short_label, display_name }) => {
		const reportKey = periodKeyForSchoolYear(
			short_label,
			classRecord.school_year,
		);
		const subjectNames =
			reportSubject === "MAPEH"
				? ["Music and Arts", "Physical Education and Health"]
				: [reportSubject];
		const componentResults = subjectNames.map((subjectName) => {
			const periodAssessments = data.assessments.filter(
				(item) =>
					item.subject === subjectName &&
					periodKeyForSchoolYear(
						item.grading_period,
						classRecord.school_year,
					) === reportKey &&
					item.school_year === classRecord.school_year,
			);
			const offeringId = data.offerings.find(
				(item) => item.subject_name === subjectName,
			)?.id;
			const config = data.configurations.find(
				(item) =>
					item.class_subject_id === offeringId &&
					item.school_year === classRecord.school_year &&
					periodKeyForSchoolYear(
						item.grading_period,
						classRecord.school_year,
					) === reportKey,
			);
			const fallbackWeights = categoryWeightsFor(
				classRecord.grade_level,
				subjectName,
			);
			const policy: GradingPolicy = config
				? {
						passingGrade: Number(config.passing_grade),
						decimalPlaces: Number(config.decimal_places),
						roundingMethod:
							config.rounding_method as GradingPolicy["roundingMethod"],
						weights: {
							"Written/Oral Works": Number(config.written_work_weight),
							"Product/Performance Tasks": Number(
								config.performance_tasks_weight,
							),
							Examinations: Number(config.quarterly_exam_weight),
						},
						useTransmutation: isTrimesterSchoolYear(classRecord.school_year),
					}
				: {
						passingGrade: Number(data.settings?.passing_grade ?? 75),
						decimalPlaces: Number(data.settings?.decimal_places ?? 2),
						roundingMethod: (data.settings?.rounding_method ??
							"half_up") as GradingPolicy["roundingMethod"],
						weights:
							isTrimesterSchoolYear(classRecord.school_year) ||
							isCompetencyClass
								? fallbackWeights
								: normalizeCategoryWeights(
										data.settings?.grading_weights ?? null,
										fallbackWeights,
									),
						useTransmutation: isTrimesterSchoolYear(classRecord.school_year),
					};
			const result = isCompetencyClass
				? null
				: calculateGrade(
						student.id,
						periodAssessments.map((item) => ({
							id: item.id,
							assessmentType: item.assessment_type,
							gradingCategory: item.grading_category,
							gradingPeriod: item.grading_period,
							subject: item.subject,
							totalPoints: Number(item.total_points),
						})),
						periodAssessments.flatMap((item) =>
							item.assessment_scores
								.filter((score) => score.student_id === student.id)
								.map((score) => ({
									assessmentId: item.id,
									studentId: score.student_id,
									score: score.score === null ? null : Number(score.score),
								})),
						),
						policy,
						subjectName,
						reportKey ?? undefined,
					);
			const missingCategories =
				result?.categories
					.filter((category) => category.weight > 0 && category.total === 0)
					.map((category) => category.name) ?? [];
			const weightsTotal = Object.values(policy.weights).reduce(
				(sum, weight) => sum + Number(weight),
				0,
			);
			const configurationAvailable =
				weightsTotal === 100 &&
				(Boolean(config) ||
					Boolean(data.settings) ||
					isTrimesterSchoolYear(classRecord.school_year));
			const status = isCompetencyClass
				? "Progress-based; numeric grade not applicable"
				: !configurationAvailable
					? "Missing grading configuration"
					: result?.status === "incomplete"
						? "Incomplete scores"
						: missingCategories.length
							? `Missing ${missingCategories.join(", ")}`
							: result?.remark === "Unverified"
								? "Grade unverified"
								: (result?.remark ?? "Incomplete");
			const recorded = periodAssessments.filter(
				(item) =>
					scoreForStudent(item) !== null && scoreForStudent(item) !== undefined,
			).length;
			return {
				subjectName,
				result,
				status,
				configurationAvailable,
				passingGrade: policy.passingGrade,
				recorded,
			};
		});
		const result =
			componentResults.length === 1 ? componentResults[0].result : null;
		const componentGrades = componentResults.map((item) => ({
			subject: item.subjectName,
			grade: item.result?.transmutedGrade ?? null,
		}));
		const final =
			reportSubject === "MAPEH"
				? mapehCompositeTermGrade(
						componentGrades[0]?.grade ?? null,
						componentGrades[1]?.grade ?? null,
					)
				: (result?.transmutedGrade ?? null);
		const configurationAvailable =
			isCompetencyClass ||
			componentResults.every((item) => item.configurationAvailable);
		const status = isCompetencyClass
			? "Progress-based; numeric grade not applicable"
			: reportSubject === "MAPEH"
				? final === null
					? (componentResults.find(
							(item) =>
								item.status !== "Passed" && item.status !== "Needs support",
						)?.status ?? "MAPEH component grades incomplete or unverified")
					: final >= 75
						? "Passed"
						: "Needs support"
				: (componentResults[0]?.status ?? "Incomplete");
		return {
			quarter: display_name,
			key: short_label,
			initial:
				reportSubject === "MAPEH" ? null : (result?.weightedPercentage ?? null),
			final,
			descriptor: descriptorForGrade(final)?.label ?? null,
			componentGrades,
			count: componentResults.reduce((sum, item) => sum + item.recorded, 0),
			status,
			configurationAvailable,
			passingGrade: Math.round(
				componentResults.reduce((sum, item) => sum + item.passingGrade, 0) /
					Math.max(1, componentResults.length),
			),
			categories: (result?.categories ?? []).map((category) => ({
				name: category.name,
				weight: category.weight,
				average: category.average,
				contribution: category.contribution,
				rawRecorded: category.rawRecorded,
				rawTotal: category.rawTotal,
			})),
		};
	});
	const selectedReportRows = reportRows.filter((row) =>
		reportPeriod === "Full Year"
			? !(isTrimesterSchoolYear(classRecord.school_year) && row.key === "Q4")
			: row.quarter === reportPeriod,
	);
	const reportHasSettings =
		selectedReportRows.length > 0 &&
		selectedReportRows.every((row) => row.configurationAvailable);
	const reportProgressRows = data.competencies.filter((record) => {
		const recordSubject = data.offerings.find(
			(item) => item.id === record.subject_offering_id,
		)?.subject_name;
		const recordPeriod = periodKeyForSchoolYear(
			record.grading_period,
			classRecord.school_year,
		);
		return (
			recordSubject === reportSubject &&
			(reportPeriod === "Full Year"
				? !(
						isTrimesterSchoolYear(classRecord.school_year) &&
						recordPeriod === "Q4"
					)
				: recordPeriod ===
					periodKeyForSchoolYear(
						reportPeriods.find((item) => item.display_name === reportPeriod)
							?.short_label,
						classRecord.school_year,
					))
		);
	});
	const reportNarratives = selectedReportRows.map((term) => ({
		term: term.quarter,
		report: data.earlyLearningReports.find(
			(report) =>
				report.school_year === classRecord.school_year &&
				periodKeyForSchoolYear(
					report.grading_period,
					classRecord.school_year,
				) ===
					periodKeyForSchoolYear(term.key, classRecord.school_year),
		),
	}));
	const schoolYearStart = Number(classRecord.school_year.match(/\d{4}/)?.[0]);
	const gradeOneAttendanceMonths = [
		{ name: "June", month: 6, yearOffset: 0 },
		{ name: "July", month: 7, yearOffset: 0 },
		{ name: "August", month: 8, yearOffset: 0 },
		{ name: "September", month: 9, yearOffset: 0 },
		{ name: "October", month: 10, yearOffset: 0 },
		{ name: "November", month: 11, yearOffset: 0 },
		{ name: "December", month: 12, yearOffset: 0 },
		{ name: "January", month: 1, yearOffset: 1 },
		{ name: "February", month: 2, yearOffset: 1 },
		{ name: "March", month: 3, yearOffset: 1 },
		{ name: "April", month: 4, yearOffset: 1 },
	].map(({ name, month, yearOffset }) => {
		const year = schoolYearStart + yearOffset;
		const monthRecords = Number.isFinite(year)
			? data.attendance.filter((item) => {
						const [recordYear, recordMonth] = item.attendance_date
							.split("-")
							.map(Number);
						return recordYear === year && recordMonth === month;
					})
			: [];
		return {
			name,
			daysRecorded: monthRecords.length,
			present: monthRecords.filter(
					(item) => item.status === "present" || item.status === "late",
			).length,
			absent: monthRecords.filter((item) => item.status === "absent").length,
			excused: monthRecords.filter((item) => item.status === "excused").length,
		};
	});
	const gradeOneAttendanceTotals = gradeOneAttendanceMonths.reduce(
		(totals, month) => ({
			daysRecorded: totals.daysRecorded + month.daysRecorded,
			present: totals.present + month.present,
			absent: totals.absent + month.absent,
		}),
		{ daysRecorded: 0, present: 0, absent: 0 },
	);
	const kinderAttendanceTotals = gradeOneAttendanceMonths.reduce(
		(totals, month) => ({
			daysRecorded: totals.daysRecorded + month.daysRecorded,
			present: totals.present + month.present,
			absent: totals.absent + month.absent,
			excused: totals.excused + month.excused,
		}),
		{ daysRecorded: 0, present: 0, absent: 0, excused: 0 },
	);
	const reportHasConvertedGrades =
		selectedReportRows.length > 0 &&
		selectedReportRows.every((row) => row.final !== null);
	const mapehFinal =
		reportSubject === "MAPEH"
			? mapehFinalGrade(
					reportPeriods
						.filter((item) => item.short_label !== "Q4")
						.map(
							(item) =>
								reportRows.find((row) => row.key === item.short_label)?.final ??
								null,
						),
				)
			: null;
	const passingGradeLabels = [
		...new Set(selectedReportRows.map((row) => `${row.passingGrade}%`)),
	];
	async function buildReportPdf() {
		const logoResponse = await fetch("/logo.png");
		if (!logoResponse.ok)
			throw new Error(
				"The ElemBloom logo could not be loaded for the report card.",
			);
		const logoBlob = await logoResponse.blob();
		const logoDataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () =>
				reject(
					new Error(
						"The ElemBloom logo could not be read for the report card.",
					),
				);
			reader.onload = () =>
				typeof reader.result === "string"
					? resolve(reader.result)
					: reject(
							new Error(
								"The ElemBloom logo could not be converted for the report card.",
							),
						);
			reader.readAsDataURL(logoBlob);
		});
		const pdf = new jsPDF({
			orientation: "landscape",
			unit: "mm",
			format: "a4",
		});
		const pageWidth = pdf.internal.pageSize.getWidth();
		const pageHeight = pdf.internal.pageSize.getHeight();
		const margin = 15;
		const tableWidth = pageWidth - margin * 2;
		const generatedDate = new Intl.DateTimeFormat("en-PH", {
			dateStyle: "medium",
			timeZone: "Asia/Manila",
		}).format(new Date());
		const isGradeOneReport = classRecord.grade_level === 1;
		const isKinderReport = classRecord.grade_level === 0;
		const reportTitle = isGradeOneReport
			? "LEARNER'S PROGRESS REPORT CARD"
			: isKinderReport
				? "KINDER LEARNER'S PROGRESS REPORT"
				: "PUPIL ACADEMIC REPORT CARD";

		pdf.setFillColor(46, 139, 87);
		pdf.rect(0, 0, pageWidth, 31, "F");
		pdf.setFillColor(255, 255, 255);
		pdf.roundedRect(margin, 3, 37, 25, 2, 2, "F");
		pdf.addImage(logoDataUrl, "PNG", margin + 1, 4, 35, 23);
		pdf.setTextColor(255, 255, 255);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(10);
		pdf.text(reportTitle, margin + 42, 17);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		pdf.text(`Generated ${generatedDate}`, pageWidth - margin, 20, {
			align: "right",
		});

		pdf.setTextColor(30, 41, 59);
		pdf.setFillColor(245, 248, 251);
		pdf.roundedRect(margin, 37, tableWidth, 27, 2, 2, "F");
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(13);
		pdf.text(`${student.last_name}, ${student.first_name}`, margin + 5, 45);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		pdf.text(
			`Student no. ${student.student_number}  |  Gender: ${student.gender ?? "Not recorded"}`,
			margin + 5,
			52,
		);
		pdf.text(
			`${gradeLevelLabel(classRecord.grade_level)} – ${classRecord.section_name}  |  School year ${classRecord.school_year}`,
			margin + 5,
			59,
		);
		pdf.text(
			isGradeOneReport
				? `Report scope: ${reportPeriod}`
				: isKinderReport
					? `Report scope: ${reportPeriod}`
					: `Subject: ${reportSubject || "Not selected"}  |  Report period: ${reportPeriod}`,
			pageWidth - margin - 5,
			45,
			{ align: "right" },
		);
		pdf.setTextColor(71, 85, 105);
		pdf.text(
			isGradeOneReport
				? "Descriptive progress and PACE ratings; no numeric grades."
				: isKinderReport
					? "Developmental competencies rated CO, DV, or BG; no numeric grades."
				: isCompetencyClass
					? "Categorical competency progress is shown. Numeric grades do not apply."
					: "Grades use assessment scores and saved grading policies.",
			pageWidth - margin - 5,
			53,
			{ align: "right" },
		);

		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(11);
		pdf.setTextColor(30, 41, 59);
		pdf.text(
			isGradeOneReport
				? "Term narratives and attendance"
				: isKinderReport
					? "Kinder SF9 developmental record"
				: isCompetencyClass
				? "Competency progress results"
				: "Term academic results",
			margin,
			73,
		);

		let y = 78;
		if (classRecord.grade_level === 1) {
			const bodyWidth = tableWidth;
			const halfWidth = (bodyWidth - 8) / 2;
			const drawParagraph = (text: string, fontSize: number, x: number, width: number) => {
				pdf.setFontSize(fontSize);
				const lines = pdf.splitTextToSize(text, width);
				pdf.text(lines, x, y);
				y += lines.length * (fontSize * 0.45) + 2;
			};
			pdf.setFont("helvetica", "normal");
			pdf.setFontSize(8);
			drawParagraph(
				"This report provides a descriptive account of your child's learning progress for each term. It highlights what your child can already do, what they are currently developing, and how they can be further supported.",
				8,
				margin,
				bodyWidth,
			);
			drawParagraph(
				"This report is based on varied evidence of learning, including classroom activities, observations, learner outputs, and assessments. It is designed to give a clearer understanding of development rather than relying on numerical or letter grades.",
				8,
				margin,
				bodyWidth,
			);
			reportNarratives.forEach(({ term, report }) => {
				const canDo = pdf.splitTextToSize(
					report?.what_child_can_do || "No narrative recorded.",
					halfWidth - 6,
				);
				const improve = pdf.splitTextToSize(
					report?.learning_to_improve || "No narrative recorded.",
					halfWidth - 6,
				);
				const rowHeight = Math.max(canDo.length, improve.length) * 4 + 17;
				if (y + rowHeight > pageHeight - 22) {
					pdf.addPage();
					y = 18;
				}
				pdf.setFillColor(232, 245, 236);
				pdf.rect(margin, y, bodyWidth, 8, "F");
				pdf.setFont("helvetica", "bold");
				pdf.setFontSize(9);
				pdf.setTextColor(30, 41, 59);
				pdf.text(term.toUpperCase(), margin + 2, y + 5.5);
				y += 8;
				pdf.setDrawColor(203, 213, 225);
				pdf.rect(margin, y, halfWidth, rowHeight - 8);
				pdf.rect(margin + halfWidth + 8, y, halfWidth, rowHeight - 8);
				pdf.setFontSize(8);
				pdf.text("What Your Child Can Do (Mga Nagagawa)", margin + 3, y + 5);
				pdf.text(
					"What Your Child Is Learning To Improve (Dapat Linangin)",
					margin + halfWidth + 11,
					y + 5,
				);
				pdf.setFont("helvetica", "normal");
				pdf.text(canDo, margin + 3, y + 10);
				pdf.text(improve, margin + halfWidth + 11, y + 10);
				y += rowHeight;
			});
			if (y + 78 > pageHeight - 18) {
				pdf.addPage();
				y = 18;
			}
			y += 3;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(9);
			pdf.text("ATTENDANCE RECORD", margin, y);
			y += 5;
			const attendanceColumns = [
				{ label: "Month", width: 52 },
				{ label: "Days Recorded", width: 52 },
				{ label: "Days Present", width: 52 },
				{ label: "Times Absent", width: bodyWidth - 156 },
			];
			const drawAttendanceHeader = () => {
				pdf.setFillColor(232, 245, 236);
				pdf.rect(margin, y, bodyWidth, 7, "F");
				pdf.setFont("helvetica", "bold");
				pdf.setFontSize(7);
				let x = margin;
				for (const column of attendanceColumns) {
					pdf.text(column.label, x + 2, y + 4.7);
					x += column.width;
				}
				y += 7;
			};
			drawAttendanceHeader();
			pdf.setFont("helvetica", "normal");
			pdf.setFontSize(8);
			for (const month of gradeOneAttendanceMonths) {
				if (y + 6 > pageHeight - 25) {
					pdf.addPage();
					y = 18;
					drawAttendanceHeader();
				}
				const values = [
					month.name,
					String(month.daysRecorded || "—"),
					String(month.daysRecorded ? month.present : "—"),
					String(month.daysRecorded ? month.absent : "—"),
				];
				let x = margin;
				values.forEach((value, index) => {
					pdf.text(value, x + 2, y + 4);
					x += attendanceColumns[index].width;
				});
				pdf.setDrawColor(226, 232, 240);
				pdf.line(margin, y + 6, margin + bodyWidth, y + 6);
				y += 6;
			}
			pdf.setFont("helvetica", "bold");
			pdf.text(
				`TOTAL  ·  ${gradeOneAttendanceTotals.daysRecorded} days recorded  ·  ${gradeOneAttendanceTotals.present} present  ·  ${gradeOneAttendanceTotals.absent} absent`,
				margin,
				y + 5,
			);
			y += 12;
			pdf.setFont("helvetica", "italic");
			pdf.setFontSize(7);
			pdf.text(
				"Attendance totals use saved records only. Present includes late arrivals; excused entries are not counted as present or absent.",
				margin,
				y,
			);
			y += 7;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(8);
			pdf.text("NOTE TO PARENTS/GUARDIANS", margin, y);
			y += 5;
			pdf.setFont("helvetica", "normal");
			drawParagraph(
				"This report summarizes your child's progress for the selected term(s). Detailed PACE competency ratings are maintained in the class record.",
				8,
				margin,
				bodyWidth,
			);
			y += 3;
			pdf.setDrawColor(148, 163, 184);
			pdf.line(margin, y + 5, margin + 65, y + 5);
			pdf.setFontSize(8);
			pdf.text("Parent's/Guardian's Signature", margin, y + 10);
		} else if (isKinderReport) {
			pdf.setFont("helvetica", "normal");
			pdf.setFontSize(8);
			pdf.setTextColor(71, 85, 105);
			pdf.text("Rating scale: CO — Consistent · DV — Developing · BG — Beginning", margin, y);
			y += 5;
			const comments = reportNarratives;
			if (comments.length) {
				pdf.setFont("helvetica", "bold");
				pdf.setFontSize(9);
				pdf.text("TEACHER'S COMMENTS / REMARKS", margin, y);
				y += 5;
				comments.forEach(({ term, report }) => {
					const lines = pdf.splitTextToSize(report?.teacher_comments || "No teacher comments recorded.", tableWidth - 8);
					const blockHeight = lines.length * 4 + 9;
					if (y + blockHeight > pageHeight - 16) {
						pdf.addPage();
						y = 18;
					}
					pdf.setFillColor(245, 248, 251);
					pdf.rect(margin, y, tableWidth, blockHeight, "F");
					pdf.setFont("helvetica", "bold");
					pdf.setFontSize(8);
					pdf.setTextColor(30, 41, 59);
					pdf.text(term.toUpperCase(), margin + 3, y + 4);
					pdf.setFont("helvetica", "normal");
					pdf.setTextColor(51, 65, 85);
					pdf.text(lines, margin + 3, y + 8);
					y += blockHeight + 2;
				});
			}

			const terms = selectedReportRows;
			const ratingWidth = 24;
			const competencyWidth = tableWidth - terms.length * ratingWidth;
			const drawDomainHeader = (domainName: string) => {
				if (y + 18 > pageHeight - 15) {
					pdf.addPage();
					y = 18;
				}
				pdf.setFillColor(232, 245, 236);
				pdf.rect(margin, y, tableWidth, 8, "F");
				pdf.setFont("helvetica", "bold");
				pdf.setFontSize(8);
				pdf.setTextColor(30, 41, 59);
				pdf.text(domainName, margin + 2, y + 5.5);
				y += 8;
				pdf.setFillColor(245, 248, 251);
				pdf.rect(margin, y, tableWidth, 7, "F");
				pdf.text("Developmental competency", margin + 2, y + 4.7);
				terms.forEach((term, index) => {
					pdf.text(term.quarter, margin + competencyWidth + index * ratingWidth + ratingWidth / 2, y + 4.7, { align: "center" });
				});
				y += 7;
			};
			const drawDomainRows = (domainName: string, rows: Array<{ key: string; competency: string }>) => {
				drawDomainHeader(domainName);
				rows.forEach(({ key, competency }) => {
					const lines = pdf.splitTextToSize(competency, competencyWidth - 4);
					const rowHeight = Math.max(7, lines.length * 3.5 + 2);
					if (y + rowHeight > pageHeight - 15) {
						pdf.addPage();
						y = 18;
						drawDomainHeader(domainName);
					}
					pdf.setDrawColor(218, 226, 233);
					pdf.rect(margin, y, tableWidth, rowHeight);
					pdf.setFont("helvetica", "normal");
					pdf.setFontSize(7.5);
					pdf.setTextColor(51, 65, 85);
					pdf.text(lines, margin + 2, y + 4.5);
					terms.forEach((term, index) => {
						const record = reportProgressRows.find((item) =>
							item.competency === key &&
							periodKeyForSchoolYear(item.grading_period, classRecord.school_year) ===
								periodKeyForSchoolYear(term.key, classRecord.school_year),
						);
						const cellX = margin + competencyWidth + index * ratingWidth;
						pdf.line(cellX, y, cellX, y + rowHeight);
						pdf.setFont("helvetica", "bold");
						pdf.text(record?.rating ?? "—", cellX + ratingWidth / 2, y + 4.7, { align: "center" });
					});
					y += rowHeight;
				});
			};
			const catalog = kinderCompetencyList();
			kinderCompetencyDomains.forEach((domain) => {
				drawDomainRows(domain.name, catalog.filter((item) => item.domain === domain.name));
			});
			const legacyCompetencies = [...new Set(reportProgressRows.map((item) => item.competency))]
				.filter((name) => !catalog.some((item) => item.key === name))
				.map((key) => ({ key, competency: key }));
			if (legacyCompetencies.length) drawDomainRows("Previously entered competencies", legacyCompetencies);

			if (y + 52 > pageHeight - 15) {
				pdf.addPage();
				y = 18;
			}
			y += 5;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(9);
			pdf.text("ATTENDANCE RECORD", margin, y);
			y += 5;
			const attendanceWidths = [45, 37, 37, 37, tableWidth - 156];
			const attendanceHeaders = ["Month", "Days recorded", "Present", "Absent", "Excused"];
			const drawAttendanceHeader = () => {
				pdf.setFillColor(232, 245, 236);
				pdf.rect(margin, y, tableWidth, 7, "F");
				pdf.setFont("helvetica", "bold");
				pdf.setFontSize(7);
				let headerX = margin;
				attendanceHeaders.forEach((label, index) => {
					pdf.text(label, headerX + 2, y + 4.7);
					headerX += attendanceWidths[index];
				});
				y += 7;
			};
			drawAttendanceHeader();
			pdf.setFont("helvetica", "normal");
			pdf.setFontSize(8);
			gradeOneAttendanceMonths.forEach((month) => {
				if (y + 7 > pageHeight - 15) {
					pdf.addPage();
					y = 18;
					drawAttendanceHeader();
				}
				let x = margin;
				const values = [month.name, String(month.daysRecorded || "—"), String(month.daysRecorded ? month.present : "—"), String(month.daysRecorded ? month.absent : "—"), String(month.daysRecorded ? month.excused : "—")];
				values.forEach((value, index) => {
					pdf.text(value, x + 2, y + 4.7);
					x += attendanceWidths[index];
				});
				pdf.setDrawColor(226, 232, 240);
				pdf.line(margin, y + 6, margin + tableWidth, y + 6);
				y += 6;
			});
			pdf.setFont("helvetica", "bold");
			pdf.text(`TOTAL · ${kinderAttendanceTotals.daysRecorded} days recorded · ${kinderAttendanceTotals.present} present · ${kinderAttendanceTotals.absent} absent · ${kinderAttendanceTotals.excused} excused`, margin, y + 5);
			y += 10;
			pdf.setFont("helvetica", "italic");
			pdf.setFontSize(7);
			pdf.text("Attendance values are based on saved pupil attendance entries only; they do not represent scheduled class days.", margin, y);
		} else if (isCompetencyClass) {
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(10);
			pdf.text("Term · Competency / progress area · Rating · Notes", margin, y);
			y += 7;
			pdf.setFont("helvetica", "normal");
			pdf.setFontSize(9);
			if (reportProgressRows.length) {
				reportProgressRows.forEach((record) => {
					const periodName =
						reportPeriods.find(
							(item) =>
								periodKeyForSchoolYear(
									item.short_label,
									classRecord.school_year,
								) ===
								periodKeyForSchoolYear(
									record.grading_period,
									classRecord.school_year,
								),
						)?.display_name ??
						periodLabelForSchoolYear(
							record.grading_period,
							classRecord.school_year,
						);
					const line = `${periodName} · ${record.competency}: ${record.rating}${record.notes ? ` · ${record.notes}` : ""}`;
					const lines = pdf.splitTextToSize(line, tableWidth);
					const lineHeight = lines.length * 5;
					if (y + lineHeight > pageHeight - 40) {
						pdf.addPage();
						y = 20;
					}
					pdf.text(lines, margin, y);
					y += lineHeight + 1;
				});
			} else {
				pdf.text(
					"No competency progress ratings recorded for this subject and scope.",
					margin,
					y,
				);
				y += 5;
			}
		} else {
			const widths = [30, 43, 43, 48, 34, 36, tableWidth - 234];
			const headers = [
				"Term",
				"Written/Oral Works\nPS / WS",
				"Product/Performance Tasks\nPS / WS",
				"Examinations\nPS / WS",
				"Initial Grade",
				"Term Grade",
				"Recorded / Status",
			];
			let x = margin;
			const headerHeight = 14;
			pdf.setFillColor(232, 245, 236);
			pdf.rect(margin, y, tableWidth, headerHeight, "F");
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(8);
			pdf.setTextColor(30, 41, 59);
			headers.forEach((header, index) => {
				pdf.text(
					header.split("\n"),
					x + 2,
					y + (header.includes("\n") ? 5 : 8),
				);
				x += widths[index];
			});
			y += headerHeight;

			selectedReportRows.forEach((row, rowIndex) => {
				const rowHeight = 17;
				if (y + rowHeight > pageHeight - 40) {
					pdf.addPage();
					y = 20;
				}
				pdf.setFillColor(
					rowIndex % 2 === 0 ? 255 : 248,
					rowIndex % 2 === 0 ? 255 : 250,
					rowIndex % 2 === 0 ? 255 : 252,
				);
				pdf.rect(margin, y, tableWidth, rowHeight, "F");
				pdf.setDrawColor(218, 226, 233);
				pdf.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
				const categoryCell = (name: string) => {
					const category = row.categories.find((item) => item.name === name);
					if (!category || category.average === null) return "—";
					return `${category.average.toFixed(1)}% / ${category.contribution?.toFixed(1) ?? "—"}%  (${category.weight}%)`;
				};
				const cells = [
					row.quarter,
					categoryCell("Written/Oral Works"),
					categoryCell("Product/Performance Tasks"),
					categoryCell("Examinations"),
					row.initial === null ? "Incomplete" : `${row.initial.toFixed(2)}%`,
					row.final == null ? "—" : `${row.final}`,
					`${row.count} assessment${row.count === 1 ? "" : "s"}\n${row.status}`,
				];
				x = margin;
				pdf.setFont("helvetica", "normal");
				pdf.setFontSize(8);
				pdf.setTextColor(51, 65, 85);
				cells.forEach((cell, index) => {
					pdf.text(pdf.splitTextToSize(cell, widths[index] - 4), x + 2, y + 6);
					x += widths[index];
				});
				y += rowHeight;
			});
		}

		y += 4;
		if (y > pageHeight - 42) {
			pdf.addPage();
			y = 20;
		}
		if (
			reportSubject === "MAPEH" &&
			reportPeriod === "Full Year" &&
			mapehFinal !== null
		) {
			y += 3;
			pdf.setFont("helvetica", "bold");
			pdf.text(`MAPEH final grade: ${mapehFinal}`, margin, y);
		}

		const note = isCompetencyClass
			? "Kinder and Grade 1 progress is categorical. Numeric grades and numeric transmutation are not applicable."
			: reportHasConvertedGrades
				? "Term grades use the template helper conversion."
				: reportHasSettings
					? "Initial grades are shown. The selected period does not have a verified numeric conversion rule."
					: "Grading configuration is missing or incomplete for one or more selected terms. Results are informational and must not be treated as official.";
		pdf.setFont("helvetica", "italic");
		pdf.setFontSize(8);
		pdf.setTextColor(100, 116, 139);
		pdf.text(pdf.splitTextToSize(note, tableWidth), margin, y);
		y += 9;
		pdf.setDrawColor(148, 163, 184);
		pdf.line(
			margin,
			Math.min(y + 4, pageHeight - 16),
			margin + 70,
			Math.min(y + 4, pageHeight - 16),
		);
		pdf.line(
			pageWidth - margin - 70,
			Math.min(y + 4, pageHeight - 16),
			pageWidth - margin,
			Math.min(y + 4, pageHeight - 16),
		);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(8);
		pdf.text("Class adviser", margin, Math.min(y + 9, pageHeight - 7));
		pdf.text(
			"Parent / guardian",
			pageWidth - margin,
			Math.min(y + 9, pageHeight - 7),
			{ align: "right" },
		);
		return pdf;
	}
	async function downloadReport() {
		setReportSendError("");
		try {
			const pdf = await buildReportPdf();
			pdf.save(
			`${student.last_name}-${classRecord.grade_level === 1 ? "Grade-1-SF9" : classRecord.grade_level === 0 ? "Kinder-SF9" : reportSubject || "subject"}-report-card.pdf`,
			);
		} catch (pdfError) {
			setReportSendError(
				pdfError instanceof Error
					? pdfError.message
					: "The report card PDF could not be generated.",
			);
		}
	}
	async function sendReportCard() {
		if (!student.parent_guardian_email) {
			setReportSendError(
				"Add a parent or guardian email to the pupil record before sending.",
			);
			return;
		}
		if (!reportSubject && classRecord.grade_level !== 1) {
			setReportSendError("Choose a subject before sending the report card.");
			return;
		}
		setSendingReport(true);
		setReportSendError("");
		setReportSendMessage("");
		try {
			const pdfData = (await buildReportPdf())
				.output("datauristring")
				.split(",")[1];
			if (!pdfData)
				throw new Error("The report card PDF could not be generated.");
			const scope = reportPeriod === "Full Year" ? "Full Year" : reportPeriod;
			const reportLabel =
				classRecord.grade_level === 1 ? "Grade-1-SF9" : classRecord.grade_level === 0 ? "Kinder-SF9" : reportSubject;
			const fileName =
				`${student.last_name}-${reportLabel}-${scope}-report-card.pdf`.replace(
					/[^a-zA-Z0-9._-]/g,
					"-",
				);
			const response = await fetch("/api/parent-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					studentId: student.id,
					to: student.parent_guardian_email,
					subject:
						classRecord.grade_level === 1
							? `Grade 1 learner progress report card for ${student.first_name} ${student.last_name}`
							: classRecord.grade_level === 0
								? `Kinder developmental progress report for ${student.first_name} ${student.last_name}`
								: `${reportPeriod} report card for ${student.first_name} ${student.last_name} - ${reportSubject}`,
					message:
						classRecord.grade_level === 1
							? `Dear ${student.parent_guardian_name || "Parent/Guardian"},\n\nAttached is ${student.first_name} ${student.last_name}'s learner progress report card for ${classRecord.school_year}. It includes term narratives, attendance records, and the detailed PACE competency record for each learning area.\n\nPlease contact the class adviser if you have any questions.\n\nElemBloom`
							: classRecord.grade_level === 0
								? `Dear ${student.parent_guardian_name || "Parent/Guardian"},\n\nAttached is ${student.first_name} ${student.last_name}'s Kinder developmental progress report for ${reportPeriod.toLowerCase()} of ${classRecord.school_year}. It includes developmental competency ratings, the teacher's comments, and recorded attendance. The competency scale is CO (Consistent), DV (Developing), and BG (Beginning); numeric grades do not apply.\n\nPlease contact the class adviser if you have any questions.\n\nElemBloom`
								: `Dear ${student.parent_guardian_name || "Parent/Guardian"},\n\nAttached is ${student.first_name} ${student.last_name}'s ${reportPeriod.toLowerCase()} academic report card for ${reportSubject}.\n\nNumeric grades are shown only where the grading configuration and approved conversion rule are available.\n\nPlease contact the class adviser if you have any questions.\n\nElemBloom`,
					type: "report_card",
					attachment: {
						fileName,
						mimeType: "application/pdf",
						base64: pdfData,
					},
				}),
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(result.error ?? "The report card could not be sent.");
			setReportSendMessage(
				result.logged === false
					? `Report card sent to ${student.parent_guardian_email}, but ElemBloom could not record the sent-message history.`
					: `Report card sent to ${student.parent_guardian_email}.`,
			);
		} catch (sendError) {
			setReportSendError(
				sendError instanceof Error
					? sendError.message
					: "The report card could not be sent.",
			);
		} finally {
			setSendingReport(false);
		}
	}

	return (
		<section className='mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8'>
			<Button
				render={<Link href='/pupils' />}
				variant='ghost'
				className='w-fit'
			>
				<ArrowLeft data-icon='inline-start' />
				Back to pupils
			</Button>
			<div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
				<div>
					<p className='text-sm font-medium text-primary'>Pupil profile</p>
					<h1 className='mt-1 text-3xl font-bold'>
						{classRecord.grade_level === 1
							? "Learner's Progress Report Card"
							: `${student.first_name} ${student.last_name}`}
					</h1>
					<p className='mt-2 text-muted-foreground'>
						Student no. {student.student_number} ·{" "}
						{student.gender ?? "Gender not set"} ·{" "}
						{gradeLevelLabel(classRecord.grade_level)} ·{" "}
						{classRecord.section_name} · {classRecord.school_year}
					</p>
				</div>
				<div className='flex gap-2'>
					<Button
						type='button'
						onClick={() => {
							setReportSubject(subjects[0] ?? "");
							setReportSendError("");
							setReportSendMessage("");
							setShowReport(true);
						}}
						variant='outline'
					>
						<FileText data-icon='inline-start' />
						View report card
					</Button>
					<Button render={<Link href='/pupils' />} variant='outline'>
						<Pencil data-icon='inline-start' />
						Edit pupil
					</Button>
				</div>
			</div>
			<div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
				<Stat
					label='Academic average'
					value={average == null ? "—" : `${average}%`}
					tone='text-primary'
				/>
				<Stat
					label='Attendance rate'
					value={attendanceRate == null ? "—" : `${attendanceRate}%`}
					tone='text-emerald-600'
				/>
				<Stat
					label='Present / late'
					value={`${attendanceSummary.present} / ${attendanceSummary.late}`}
					tone='text-primary'
				/>
				<Stat
					label='Absent'
					value={attendanceSummary.absent}
					tone='text-destructive'
				/>
				<div className='rounded-xl border bg-card p-4'>
					<p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
						Parent/guardian
					</p>
					<p className='mt-2 truncate font-semibold'>
						{student.parent_guardian_name || "Not recorded"}
					</p>
					<p className='mt-1 truncate text-xs text-muted-foreground'>
						{student.parent_guardian_email || "No email recorded"}
					</p>
				</div>
			</div>
			<div className='grid gap-6 lg:grid-cols-[1.15fr_0.85fr]'>
				<div className='rounded-xl border bg-card'>
					<div className='flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between'>
						<div>
							<h2 className='font-semibold'>Attendance History</h2>
							<p className='mt-1 text-sm text-muted-foreground'>
								Saved attendance records for this pupil. Excused records are
								excluded from the rate.
							</p>
						</div>
						<CalendarDays className='text-primary' />
					</div>
					<div className='grid gap-3 border-b p-5 sm:grid-cols-3'>
						<label className='grid gap-1 text-xs font-medium'>
							School year
							<select
								aria-label='Attendance school year'
								value={attendanceYear}
								onChange={(event) => setAttendanceYear(event.target.value)}
								className='rounded-lg border bg-background px-3 py-2 text-sm'
							>
								<option value='all'>All years</option>
								{attendanceYears.map((year) => (
									<option key={year} value={year}>
										{year}
									</option>
								))}
							</select>
						</label>
						<label className='grid gap-1 text-xs font-medium'>
							From
							<input
								aria-label='Attendance from date'
								type='date'
								value={fromDate}
								onChange={(event) => setFromDate(event.target.value)}
								className='rounded-lg border bg-background px-3 py-2 text-sm'
							/>
						</label>
						<label className='grid gap-1 text-xs font-medium'>
							To
							<input
								aria-label='Attendance to date'
								type='date'
								value={toDate}
								onChange={(event) => setToDate(event.target.value)}
								className='rounded-lg border bg-background px-3 py-2 text-sm'
							/>
						</label>
					</div>
					<div className='grid grid-cols-2 gap-2 border-b p-5 sm:grid-cols-4'>
						<Stat
							label='Present'
							value={attendanceSummary.present}
							tone='text-emerald-600'
						/>
						<Stat
							label='Late'
							value={attendanceSummary.late}
							tone='text-amber-600'
						/>
						<Stat
							label='Absent'
							value={attendanceSummary.absent}
							tone='text-destructive'
						/>
						<Stat
							label='Excused'
							value={attendanceSummary.excused}
							tone='text-muted-foreground'
						/>
					</div>
					<div className='p-5'>
						<div className='flex flex-wrap items-center justify-between gap-3'>
							<div>
								<h3 className='font-medium'>Attendance calendar</h3>
								<p className='mt-1 text-sm text-muted-foreground'>
									Recorded attendance only; blank dates have no saved record.
								</p>
							</div>
							<div className='flex items-center gap-2'>
								<Button
									type='button'
									variant='outline'
									size='sm'
									aria-label='Previous month'
									onClick={() =>
										setCalendarMonth(
											new Date(
												calendarMonth.getFullYear(),
												calendarMonth.getMonth() - 1,
												1,
											),
										)
									}
								>
									‹
								</Button>
								<span className='min-w-32 text-center text-sm font-medium'>
									{calendarMonth.toLocaleDateString("en-PH", {
										month: "long",
										year: "numeric",
									})}
								</span>
								<Button
									type='button'
									variant='outline'
									size='sm'
									aria-label='Next month'
									onClick={() =>
										setCalendarMonth(
											new Date(
												calendarMonth.getFullYear(),
												calendarMonth.getMonth() + 1,
												1,
											),
										)
									}
								>
									›
								</Button>
							</div>
						</div>
						<div className='mt-4 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground'>
							{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
								<span key={day} className='py-1 font-medium'>
									{day}
								</span>
							))}
							{Array.from({
								length: new Date(
									calendarMonth.getFullYear(),
									calendarMonth.getMonth(),
									1,
								).getDay(),
							}).map((_, index) => (
								<span key={`blank-${index}`} />
							))}
							{Array.from({
								length: new Date(
									calendarMonth.getFullYear(),
									calendarMonth.getMonth() + 1,
									0,
								).getDate(),
							}).map((_, index) => {
								const date = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
								const entries = filteredAttendance.filter(
									(item) => item.attendance_date === date,
								);
								const entry = entries[0];
								const colors: Record<string, string> = {
									present: "bg-emerald-500",
									late: "bg-amber-500",
									absent: "bg-red-500",
									excused: "bg-slate-400",
								};
								return (
									<div
										key={date}
										title={
											entry
												? `${formatDate(date)} · ${statusLabel(entry.status)}${entries.length > 1 ? ` · ${entries.length} records` : ""}`
												: `${formatDate(date)} · No record`
										}
										className='group relative flex min-h-9 items-center justify-center rounded-md border bg-background text-sm'
									>
										<span>{index + 1}</span>
										{entry && (
											<span
												aria-label={statusLabel(entry.status)}
												className={`absolute bottom-1 size-1.5 rounded-full ${colors[entry.status]}`}
											/>
										)}
									</div>
								);
							})}
						</div>
						<div className='mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground'>
							{[
								["Present", "bg-emerald-500"],
								["Late", "bg-amber-500"],
								["Absent", "bg-red-500"],
								["Excused", "bg-slate-400"],
							].map(([label, color]) => (
								<span key={label} className='flex items-center gap-1.5'>
									<span className={`size-2 rounded-full ${color}`} />
									{label}
								</span>
							))}
						</div>
					</div>
				</div>
				<div className='rounded-xl border bg-card'>
					<div className='border-b p-5'>
						<h2 className='font-semibold'>Academic overview</h2>
						<p className='mt-1 text-sm text-muted-foreground'>
							Average score by subject from recorded assessments.
						</p>
					</div>
					<div className='grid gap-5 p-5 lg:grid-cols-2'>
					{subjectAverages.length ? (
						<div className='flex flex-col gap-5'>
							{subjectAverages.map((item) => (
								<div key={item.name}>
									<div className='mb-2 flex justify-between text-sm'>
										<span className='font-medium'>{item.name}</span>
										<span className='text-muted-foreground'>{item.value}%</span>
									</div>
									<div className='h-3 overflow-hidden rounded-full bg-muted'>
										<div
											className='h-full rounded-full bg-primary transition-all'
											style={{ width: `${item.value}%` }}
										/>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className='p-6 text-center text-sm text-muted-foreground'>
							No academic scores available
						</div>
					)}
					<TrendChart
						title="Performance trend"
						points={performanceTrend}
						emptyMessage="No scored assessments match the selected subject and term."
						caption="Assessment score (%) · hover over a point for the activity name"
						compact
					/>
					</div>
				</div>
			</div>
			<div className='rounded-xl border bg-card'>
				<div className='flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<h2 className='font-semibold'>Assessment records</h2>
						<p className='mt-1 text-sm text-muted-foreground'>
							Only records saved for this pupil are shown.
						</p>
					</div>
					<div className='flex gap-2'>
						<select
							aria-label='Filter grading period'
							value={period}
							onChange={(event) => setPeriod(event.target.value)}
							className='rounded-lg border bg-background px-3 py-2 text-sm'
						>
							<option value='all'>All periods</option>
							{availablePeriods.map((item) => (
								<option key={item.short_label} value={item.short_label}>
									{item.display_name}
								</option>
							))}
						</select>
						<select
							aria-label='Filter subject'
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
							className='rounded-lg border bg-background px-3 py-2 text-sm'
						>
							<option value='all'>All subjects</option>
							{subjects.map((item) => (
								<option key={item}>{item}</option>
							))}
						</select>
					</div>
				</div>
				{assessments.length ? (
					<div className='overflow-x-auto'>
						<table className='w-full text-left text-sm'>
							<thead className='bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground'>
								<tr>
									<th className='px-5 py-3'>Assessment</th>
									<th className='px-5 py-3'>Subject</th>
									<th className='px-5 py-3'>Period</th>
									<th className='px-5 py-3'>Date</th>
									<th className='px-5 py-3'>Score</th>
								</tr>
							</thead>
							<tbody className='divide-y'>
								{assessments.map((item) => {
									const score = scoreForStudent(item);
									return (
										<tr key={item.id}>
											<td className='px-5 py-3 font-medium'>
												{item.title}
												<p className='text-xs text-muted-foreground'>
													{item.assessment_type}
												</p>
											</td>
											<td className='px-5 py-3'>{item.subject}</td>
											<td className='px-5 py-3'>
												{periodLabelForSchoolYear(
													item.grading_period,
													classRecord.school_year,
												)}
											</td>
											<td className='px-5 py-3'>
												{formatDate(item.assessment_date)}
											</td>
											<td className='px-5 py-3 font-medium'>
												{score == null
													? "Not recorded"
													: `${score} / ${item.total_points}`}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : (
					<div className='p-10 text-center text-sm text-muted-foreground'>
						No assessments match the selected filters.
					</div>
				)}
			</div>
			{showReport && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4'
					role='dialog'
					aria-modal='true'
					aria-labelledby='report-card-title'
				>
					<div className='max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl'>
						<div className='flex items-start justify-between gap-4'>
							<div>
								<p className='text-sm font-medium text-primary'>
									ElemBloom report card
								</p>
								<h2 id='report-card-title' className='text-2xl font-bold'>
									{student.first_name} {student.last_name}
								</h2>
								<p className='text-sm text-muted-foreground'>
									{student.student_number} ·{" "}
									{gradeLevelLabel(classRecord.grade_level)} ·{" "}
									{classRecord.section_name} · {classRecord.school_year}
								</p>
							</div>
							<div className='flex flex-wrap gap-2'>
								<Button
									type='button'
									variant='outline'
									onClick={downloadReport}
								>
									Download PDF
								</Button>
								<Button
									type='button'
									onClick={sendReportCard}
									disabled={
										sendingReport ||
										!student.parent_guardian_email
									}
								>
									<Mail data-icon='inline-start' />
									{sendingReport ? "Sending…" : "Send to parent/guardian"}
								</Button>
								<Button
									type='button'
									variant='outline'
									onClick={() => setShowReport(false)}
								>
									Close
								</Button>
							</div>
						</div>
						<div className='mt-5 grid gap-3 sm:grid-cols-3'>
							{classRecord.grade_level !== 1 && <label className='text-sm font-medium'>
								Subject
								<select
									disabled={sendingReport}
									className='mt-2 w-full rounded-lg border bg-background px-3 py-2'
									value={reportSubject}
									onChange={(event) => {
										setReportSubject(event.target.value);
										setReportSendError("");
										setReportSendMessage("");
									}}
								>
									{subjects.map((item) => (
										<option key={item}>{item}</option>
									))}
								</select>
							</label>}
							<label className='text-sm font-medium'>
								{classRecord.grade_level === 1 ? "Report scope" : "Scope"}
								<select
									disabled={sendingReport}
									className='mt-2 w-full rounded-lg border bg-background px-3 py-2'
									value={reportPeriod}
									onChange={(event) => {
										setReportPeriod(event.target.value);
										setReportSendError("");
										setReportSendMessage("");
									}}
								>
									<option>Full Year</option>
									{reportPeriods.map((item) => (
										<option key={item.short_label}>{item.display_name}</option>
									))}
								</select>
							</label>
							{!isCompetencyClass && <label className='text-sm font-medium'>
								Passing Grade:
								<div className='rounded-lg border bg-muted/30 p-3 text-sm text-center'>
									<strong>
										{passingGradeLabels.length
											? passingGradeLabels.join(" / ")
											: "Not configured"}
									</strong>
								</div>
							</label>}
						</div>
						{!isCompetencyClass && !reportHasSettings && (
							<p className='mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700'>
								Grading settings are missing or weights do not total 100%. This
								report is informational and cannot be presented as an official
								final grade.
							</p>
						)}
						<p className='mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700'>
							{classRecord.grade_level === 1
								? "Grade 1 progress is descriptive and competency-based; numeric and letter grades are not used as subject grades."
								: classRecord.grade_level === 0
									? "Kinder progress is recorded by developmental competency using CO, DV, and BG. Numeric grades do not apply."
								: "Academic results are based on the latest E-Class Records provided and released by DepEd."}
						</p>
						{!student.parent_guardian_email && (
							<p className='mt-4 rounded-lg border border-muted bg-muted/40 p-3 text-sm text-muted-foreground'>
								Add a parent or guardian email to this pupil’s record to enable
								sending.
							</p>
						)}
						{reportSendError && (
							<p
								className='mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
								role='alert'
							>
								{reportSendError}
							</p>
						)}
						{reportSendMessage && (
							<p
								className='mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary'
								role='status'
							>
								{reportSendMessage}
							</p>
						)}
						{classRecord.grade_level === 1 && (
							<div className='mt-6 space-y-6'>
								<section className='rounded-xl border bg-muted/10 p-5'>
									<p className='text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
										Republic of the Philippines · Department of Education
									</p>
									<h3 className='mt-2 text-center text-xl font-bold tracking-wide'>
										Learner&apos;s Progress Report Card
									</h3>
									<p className='mt-1 text-center text-sm text-muted-foreground'>
										School Year {classRecord.school_year}
									</p>
									<div className='mt-5 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2'>
										<p><span className='text-muted-foreground'>Name:</span> <strong>{student.last_name}, {student.first_name}</strong></p>
										<p><span className='text-muted-foreground'>LRN / Student no.:</span> <strong>{student.student_number}</strong></p>
										<p><span className='text-muted-foreground'>Grade / Section:</span> <strong>Grade 1 · {classRecord.section_name}</strong></p>
										<p><span className='text-muted-foreground'>Parent / Guardian:</span> <strong>{student.parent_guardian_name || "—"}</strong></p>
									</div>
									<p className='mt-4 text-sm leading-6 text-muted-foreground'>
										This report provides a descriptive account of your child&apos;s learning progress for each term. It highlights what your child can already do, what they are currently developing, and how they can be further supported.
									</p>
									<p className='mt-2 text-sm leading-6 text-muted-foreground'>
										This report is based on varied evidence of learning, including classroom activities, observations, learner outputs, and assessments. It is designed to give a clearer understanding of your child&apos;s development rather than relying on numerical or letter grades.
									</p>
								</section>

								<section className='space-y-3'>
									<h3 className='font-semibold'>Term narratives</h3>
									{reportNarratives.map(({ term, report }) => (
										<article key={term} className='overflow-hidden rounded-xl border'>
											<h4 className='bg-primary/10 px-4 py-3 text-sm font-bold uppercase tracking-wide'>{term}</h4>
											<div className='grid md:grid-cols-2'>
												<div className='border-b p-4 md:border-b-0 md:border-r'>
													<h5 className='text-sm font-semibold'>What Your Child Can Do <span className='font-normal text-muted-foreground'>(Mga Nagagawa)</span></h5>
													<p className='mt-2 min-h-16 whitespace-pre-wrap text-sm leading-6 text-muted-foreground'>{report?.what_child_can_do || "No term narrative recorded."}</p>
												</div>
												<div className='p-4'>
													<h5 className='text-sm font-semibold'>What Your Child Is Learning To Improve <span className='font-normal text-muted-foreground'>(Dapat Linangin)</span></h5>
													<p className='mt-2 min-h-16 whitespace-pre-wrap text-sm leading-6 text-muted-foreground'>{report?.learning_to_improve || "No term narrative recorded."}</p>
												</div>
											</div>
											<div className='border-t px-4 py-3 text-right text-xs text-muted-foreground'>Parent&apos;s / Guardian&apos;s Signature: ______________________________</div>
										</article>
									))}
								</section>

								<section className='overflow-hidden rounded-xl border'>
									<div className='border-b p-4'>
										<h3 className='font-semibold'>Attendance record</h3>
										<p className='mt-1 text-xs text-muted-foreground'>Days recorded are based on saved attendance entries. Present includes late arrivals; excused entries are excluded from present and absent totals.</p>
									</div>
									<div className='overflow-x-auto'>
										<table className='w-full min-w-[560px] text-left text-sm'>
											<thead className='bg-muted/40 text-xs uppercase text-muted-foreground'><tr><th className='px-4 py-3'>Month</th><th className='px-4 py-3'>Days recorded</th><th className='px-4 py-3'>Days present</th><th className='px-4 py-3'>Times absent</th></tr></thead>
											<tbody className='divide-y'>
												{gradeOneAttendanceMonths.map((month) => <tr key={month.name}><td className='px-4 py-2.5 font-medium'>{month.name}</td><td className='px-4 py-2.5'>{month.daysRecorded || "—"}</td><td className='px-4 py-2.5'>{month.daysRecorded ? month.present : "—"}</td><td className='px-4 py-2.5'>{month.daysRecorded ? month.absent : "—"}</td></tr>)}
											</tbody>
											<tfoot className='border-t bg-muted/20 font-semibold'><tr><td className='px-4 py-3'>Total</td><td className='px-4 py-3'>{gradeOneAttendanceTotals.daysRecorded}</td><td className='px-4 py-3'>{gradeOneAttendanceTotals.present}</td><td className='px-4 py-3'>{gradeOneAttendanceTotals.absent}</td></tr></tfoot>
										</table>
									</div>
								</section>

							</div>
						)}
						{!isCompetencyClass && reportSubject && (
							<div className='mt-6 overflow-x-auto'>
								<table className='w-full text-left text-sm'>
									<thead className='border-b bg-muted/30 text-xs uppercase text-muted-foreground'>
										<tr>
											<th className='px-3 py-3'>Term</th>
											<th className='px-3 py-3'>
												Written/Oral Works
												<br />
												PS / WS (weight)
											</th>
											<th className='px-3 py-3'>
												Product/Performance Tasks
												<br />
												PS / WS (weight)
											</th>
											<th className='px-3 py-3'>
												Examinations
												<br />
												PS / WS (weight)
											</th>
											<th className='px-3 py-3'>Initial grade</th>
											<th className='px-3 py-3'>Term grade</th>
											<th className='px-3 py-3'>Recorded / status</th>
										</tr>
									</thead>
									<tbody className='divide-y'>
										{selectedReportRows.map((row) => {
											const categoryCell = (name: string) => {
												const category = row.categories.find(
													(item) => item.name === name,
												);
												return category?.average == null
													? "—"
													: `${category.average.toFixed(2)}% / ${category.contribution?.toFixed(2) ?? "—"}% (${category.weight}%)`;
											};
											return (
												<tr key={row.quarter}>
													<td className='px-3 py-3 font-medium'>
														{row.quarter}
													</td>
													<td className='px-3 py-3'>
														{categoryCell("Written/Oral Works")}
													</td>
													<td className='px-3 py-3'>
														{categoryCell("Product/Performance Tasks")}
													</td>
													<td className='px-3 py-3'>
														{categoryCell("Examinations")}
													</td>
													<td className='px-3 py-3'>
														{row.initial == null
															? "Incomplete"
															: `${row.initial.toFixed(2)}%`}
													</td>
													<td className='px-3 py-3'>
														{row.final == null ? "—" : row.final}
													</td>
													<td className='px-3 py-3'>
														{row.count} assessment{row.count === 1 ? "" : "s"}
														<br />
														<span className='text-xs text-muted-foreground'>
															{row.status}
														</span>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
						{classRecord.grade_level === 0 && reportSubject && (
							<div className='mt-6 space-y-6'>
								<section className='space-y-3'>
									<div>
										<h3 className='font-semibold'>Teacher&apos;s comments / remarks</h3>
										<p className='text-xs text-muted-foreground'>Comments saved for each term in the selected report scope.</p>
									</div>
									{reportNarratives.map(({ term, report }) => (
										<article key={term} className='rounded-lg border'>
											<h4 className='bg-muted/30 px-4 py-2 text-sm font-semibold'>{term}</h4>
											<p className='min-h-12 whitespace-pre-wrap px-4 py-3 text-sm text-muted-foreground'>{report?.teacher_comments || "No teacher comments recorded for this term."}</p>
										</article>
									))}
								</section>
								<section className='space-y-3'>
									<div>
										<h3 className='font-semibold'>Developmental competencies</h3>
										<p className='text-xs text-muted-foreground'>Rating scale: CO — Consistent · DV — Developing · BG — Beginning. Unrecorded competencies are shown as —.</p>
									</div>
									<div className='space-y-4'>
										{kinderCompetencyDomains.map((domain) => {
											const domainItems = kinderCompetencyList().filter((item) => item.domain === domain.name);
											return <div key={domain.name} className='overflow-x-auto rounded-lg border'>
												<h4 className='bg-muted/30 px-4 py-2 text-sm font-semibold'>{domain.name}</h4>
												<table className='w-full min-w-[640px] text-left text-sm'>
													<thead className='bg-muted/10 text-xs text-muted-foreground'><tr><th className='w-12 px-3 py-2 text-center'>No.</th><th className='px-3 py-2'>Developmental competency</th>{selectedReportRows.map((term) => <th key={term.key} className='w-24 px-3 py-2 text-center'>{term.quarter}</th>)}</tr></thead>
													<tbody className='divide-y'>
														{domainItems.map((item, index) => <tr key={item.key}>
															<td className='px-3 py-2 text-center text-muted-foreground'>{index + 1}</td>
															<td className='px-3 py-2'>{item.competency}</td>
															{selectedReportRows.map((term) => {
																const rating = reportProgressRows.find((record) =>
																	record.competency === kinderCompetencyKey(domain.name, item.competency) &&
																	periodKeyForSchoolYear(record.grading_period, classRecord.school_year) === periodKeyForSchoolYear(term.key, classRecord.school_year),
																)?.rating;
																return <td key={term.key} className='px-3 py-2 text-center font-semibold'>{rating || "—"}</td>;
															})}
														</tr>)}
													</tbody>
												</table>
											</div>;
										})}
										{(() => {
											const catalog = kinderCompetencyList();
											const legacy = [...new Set(reportProgressRows.map((record) => record.competency))].filter((name) => !catalog.some((item) => item.key === name));
											return legacy.length ? <div className='overflow-x-auto rounded-lg border'>
												<h4 className='bg-muted/30 px-4 py-2 text-sm font-semibold'>Previously entered competencies</h4>
												<table className='w-full min-w-[640px] text-left text-sm'>
													<thead className='bg-muted/10 text-xs text-muted-foreground'><tr><th className='px-3 py-2'>Developmental competency</th>{selectedReportRows.map((term) => <th key={term.key} className='w-24 px-3 py-2 text-center'>{term.quarter}</th>)}</tr></thead>
													<tbody className='divide-y'>{legacy.map((name) => <tr key={name}><td className='px-3 py-2'>{name}</td>{selectedReportRows.map((term) => <td key={term.key} className='px-3 py-2 text-center font-semibold'>{reportProgressRows.find((record) => record.competency === name && periodKeyForSchoolYear(record.grading_period, classRecord.school_year) === periodKeyForSchoolYear(term.key, classRecord.school_year))?.rating ?? "—"}</td>)}</tr>)}</tbody>
												</table>
											</div> : null;
										})()}
									</div>
								</section>
								<section className='overflow-hidden rounded-xl border'>
									<div className='border-b p-4'>
										<h3 className='font-semibold'>Attendance record</h3>
										<p className='mt-1 text-xs text-muted-foreground'>Attendance is based on saved pupil attendance entries only; it does not represent scheduled class days.</p>
									</div>
									<div className='overflow-x-auto'>
										<table className='w-full min-w-[640px] text-left text-sm'>
											<thead className='bg-muted/40 text-xs uppercase text-muted-foreground'><tr><th className='px-4 py-3'>Month</th><th className='px-4 py-3'>Days recorded</th><th className='px-4 py-3'>Present</th><th className='px-4 py-3'>Absent</th><th className='px-4 py-3'>Excused</th></tr></thead>
											<tbody className='divide-y'>{gradeOneAttendanceMonths.map((month) => <tr key={month.name}><td className='px-4 py-2.5 font-medium'>{month.name}</td><td className='px-4 py-2.5'>{month.daysRecorded || "—"}</td><td className='px-4 py-2.5'>{month.daysRecorded ? month.present : "—"}</td><td className='px-4 py-2.5'>{month.daysRecorded ? month.absent : "—"}</td><td className='px-4 py-2.5'>{month.daysRecorded ? month.excused : "—"}</td></tr>)}</tbody>
											<tfoot className='border-t bg-muted/20 font-semibold'><tr><td className='px-4 py-3'>Total recorded</td><td className='px-4 py-3'>{kinderAttendanceTotals.daysRecorded}</td><td className='px-4 py-3'>{kinderAttendanceTotals.present}</td><td className='px-4 py-3'>{kinderAttendanceTotals.absent}</td><td className='px-4 py-3'>{kinderAttendanceTotals.excused}</td></tr></tfoot>
										</table>
									</div>
								</section>
							</div>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
