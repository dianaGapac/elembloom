"use client";

import { useEffect, useMemo, useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	interventionFocusOptions,
	suggestInterventionPlan,
	type InterventionFocus,
	type SuggestedInterventionPlan,
} from "@/lib/intervention-planner";
import type { RiskClass } from "@/lib/risk-engine";

const fieldClass =
	"mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm";

export function PlanSuggestionDialog({
	open,
	studentName,
	risk,
	subjects,
	onClose,
	onApply,
}: {
	open: boolean;
	studentName: string;
	risk: RiskClass | null;
	subjects: string[];
	onClose: () => void;
	onApply: (suggestion: SuggestedInterventionPlan) => void;
}) {
	const [subject, setSubject] = useState("");
	const [focus, setFocus] = useState<InterventionFocus>("recommended");
	const [teacherContext, setTeacherContext] = useState("");
	const [suggestion, setSuggestion] =
		useState<SuggestedInterventionPlan | null>(null);
	const subjectOptions = useMemo(
		() => (subjects.length ? subjects : ["General learning"]),
		[subjects],
	);

	useEffect(() => {
		if (!open) return;
		const suggestedSubject =
			risk?.subjects
				.filter((item) => item.belowPassing && item.average !== null)
				.sort((a, b) => (a.average ?? 0) - (b.average ?? 0))[0]?.subject ??
			risk?.subjects
				.filter((item) => item.average !== null)
				.slice()
				.sort((a, b) => (a.average ?? 0) - (b.average ?? 0))[0]?.subject ??
			subjectOptions[0];
		const savedTeacherContext =
			sessionStorage.getItem("interventionTeacherContext") ?? "";
		sessionStorage.removeItem("interventionTeacherContext");
		setSubject(suggestedSubject);
		setFocus("recommended");
		setTeacherContext(savedTeacherContext);
		setSuggestion(
			risk
				? suggestInterventionPlan({
						risk,
						subject: suggestedSubject,
						teacherContext: savedTeacherContext,
						focus: "recommended",
					})
				: null,
		);
	}, [open, risk, studentName, subjectOptions]);

	function generateSuggestion() {
		if (!risk) return;
		setSuggestion(suggestInterventionPlan({ risk, subject, teacherContext, focus }));
	}

	function changeFocus(value: InterventionFocus) {
		setFocus(value);
		if (risk) {
			setSuggestion(
				suggestInterventionPlan({ risk, subject, teacherContext, focus: value }),
			);
		}
	}

	function updateSuggestion(
		key: keyof SuggestedInterventionPlan,
		value: string,
	) {
		setSuggestion((current) =>
			current ? { ...current, [key]: value } : current,
		);
	}

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-4'
			role='presentation'
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				className='max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl'
				role='dialog'
				aria-modal='true'
				aria-labelledby='plan-suggestion-title'
			>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<p className='text-sm font-medium text-primary'>
							Teacher-reviewed suggestion
						</p>
						<h2
							id='plan-suggestion-title'
							className='mt-1 text-xl font-semibold'
						>
							Plan support for {studentName}
						</h2>
						<p className='mt-1 text-sm text-muted-foreground'>
							Suggestions use recorded subject averages and your observations.
							Review and edit every detail before saving.
						</p>
					</div>
					<Button type='button' variant='outline' onClick={onClose}>
						Close
					</Button>
				</div>
				{!risk ? (
					<p className='mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700'>
						Risk details are unavailable. Close this panel, review the pupil’s
						records, and complete the plan manually.
					</p>
				) : (
					<>
						<div className='mt-5 grid gap-4 sm:grid-cols-2'>
							<label className='text-sm font-medium'>
								Focus subject
								<select
									className={fieldClass}
									value={subject}
									onChange={(event) => setSubject(event.target.value)}
								>
									{subjectOptions.map((item) => (
										<option key={item}>{item}</option>
									))}
								</select>
							</label>
							<label className='text-sm font-medium'>
								Suggestion focus
								<select
									className={fieldClass}
									value={focus}
									onChange={(event) => {
										const option = interventionFocusOptions.find(
											(item) => item.value === event.target.value,
										);
										if (option) changeFocus(option.value);
									}}
								>
									{interventionFocusOptions.map((item) => (
										<option key={item.value} value={item.value}>{item.label}</option>
									))}
								</select>
								<span className='mt-1 block text-xs font-normal text-muted-foreground'>
									Choose the main need; you can edit every suggested field.
								</span>
							</label>
							<div className='rounded-lg border bg-muted/30 p-3 text-sm'>
								<p className='font-medium'>
									Risk level: <span className='capitalize'>{risk.level}</span>
								</p>
								<p className='mt-1 text-muted-foreground'>
									{risk.subjects.find((item) => item.subject === subject)
										?.belowPassing
										? "This subject is below its recorded passing mark."
										: risk.subjects.find((item) => item.subject === subject)
													?.average === null
											? "No score baseline is recorded for this subject."
											: "No below-passing subject average was identified; use teacher observations to set the focus."}
								</p>
							</div>
						</div>
						<label className='mt-4 block text-sm font-medium'>
							Teacher observations and known learning needs
							<textarea
								className={`${fieldClass} min-h-24`}
								value={teacherContext}
								onChange={(event) => setTeacherContext(event.target.value)}
								placeholder='Add observed strengths, specific misconceptions, strategies already tried, or other relevant context.'
							/>
							<span className='mt-1 block text-xs font-normal text-muted-foreground'>
								Avoid diagnoses or details not needed for this learning plan.
							</span>
						</label>
						<div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
							<p className='text-xs text-muted-foreground'>
								{risk.factors.length
									? `Screening evidence: ${risk.factors.join(" ")}`
									: "No specific screening factors were recorded."}
							</p>
							<Button type='button' variant='outline' onClick={generateSuggestion}>
								<WandSparkles data-icon='inline-start' />
								Refresh suggestion
							</Button>
						</div>
						{suggestion && (
							<div className='mt-4 grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2'>
								<label className='text-sm font-medium sm:col-span-2'>
									Plan title
									<input
										className={fieldClass}
										value={suggestion.title}
										onChange={(event) =>
											updateSuggestion("title", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									Goal
									<textarea
										className={fieldClass}
										value={suggestion.goal}
										onChange={(event) =>
											updateSuggestion("goal", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium'>
									Baseline
									<input
										className={fieldClass}
										value={suggestion.baseline}
										onChange={(event) =>
											updateSuggestion("baseline", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium'>
									Target performance
									<input
										className={fieldClass}
										value={suggestion.targetPerformance}
										onChange={(event) =>
											updateSuggestion("targetPerformance", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									Concern
									<input
										className={fieldClass}
										value={suggestion.concern}
										onChange={(event) => updateSuggestion("concern", event.target.value)}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									First objective
									<textarea
										className={fieldClass}
										value={suggestion.objective}
										onChange={(event) =>
											updateSuggestion("objective", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									Suggested strategy
									<textarea
										className={fieldClass}
										value={suggestion.strategy}
										onChange={(event) =>
											updateSuggestion("strategy", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									Success criteria
									<textarea
										className={fieldClass}
										value={suggestion.successCriteria}
										onChange={(event) =>
											updateSuggestion("successCriteria", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									Resources
									<textarea
										className={fieldClass}
										value={suggestion.resources}
										onChange={(event) =>
											updateSuggestion("resources", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium'>
									Support frequency
									<input
										className={fieldClass}
										value={suggestion.frequency}
										onChange={(event) =>
											updateSuggestion("frequency", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium'>
									Minutes per session
									<input
										className={fieldClass}
										inputMode='numeric'
										value={suggestion.durationMinutes}
										onChange={(event) =>
											updateSuggestion("durationMinutes", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									Expected outcome
									<textarea
										className={fieldClass}
										value={suggestion.expectedOutcome}
										onChange={(event) =>
											updateSuggestion("expectedOutcome", event.target.value)
										}
									/>
								</label>
								<label className='text-sm font-medium sm:col-span-2'>
									How progress will be measured
									<textarea
										className={fieldClass}
										value={suggestion.measurementMethod}
										onChange={(event) =>
											updateSuggestion("measurementMethod", event.target.value)
										}
									/>
								</label>
							</div>
						)}
						<div className='mt-5 flex flex-wrap justify-end gap-2'>
							<Button type='button' variant='outline' onClick={onClose}>
								Cancel
							</Button>
							<Button
								type='button'
								onClick={() => {
									if (!suggestion) return;
									const contextFactor = teacherContext.trim()
										? `Teacher observation: ${teacherContext.trim()}`
										: "";
									onApply({
										...suggestion,
										teacherContext: teacherContext.trim(),
										riskFactors: [
											...suggestion.riskFactors.filter(
												(factor) => !factor.startsWith("Teacher observation:"),
											),
											contextFactor,
										].filter(Boolean),
									});
								}}
								disabled={!suggestion}
							>
								Use suggestion and review plan
							</Button>
						</div>
					</>
				)}
			</section>
		</div>
	);
}
