export type TrendPoint = { label: string; value: number; tooltip?: string }

export function TrendChart({
	title,
	points,
	emptyMessage = "No recorded data is available for this trend yet.",
	maxValue = 100,
	valueSuffix = "%",
	caption = "Average recorded assessment score (%)",
	compact = false,
}: {
	title: string;
	points: TrendPoint[];
	emptyMessage?: string;
	maxValue?: number;
	valueSuffix?: string;
	caption?: string;
	compact?: boolean;
}) {
	const visiblePoints = points.slice(-8);
	const width = 640;
	const height = compact ? 170 : 220;
	const left = 42;
	const right = 12;
	const top = 14;
	const bottom = 38;
	const chartWidth = width - left - right;
	const chartHeight = height - top - bottom;
	const chartMaximum = Math.max(1, maxValue);
	const coordinates = visiblePoints.map((point, index) => ({
		...point,
		x: left + (visiblePoints.length < 2 ? chartWidth / 2 : (index / (visiblePoints.length - 1)) * chartWidth),
		y: top + chartHeight - (Math.max(0, Math.min(chartMaximum, point.value)) / chartMaximum) * chartHeight,
	}));
	const path = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");

	return (
		<section className='rounded-xl border bg-card p-4'>
			<h3 className='font-semibold'>{title}</h3>
			{coordinates.length ? (
				<div className='mt-3'>
					<svg
						className='h-auto w-full overflow-visible'
						viewBox={`0 0 ${width} ${height}`}
						role='img'
						aria-label={`${title}: ${coordinates.map((point) => `${point.tooltip ?? point.label} ${point.value.toFixed(1)}${valueSuffix}`).join(", ")}`}
					>
						{[0, 50, 100].map((tick) => {
							const value = (tick / 100) * chartMaximum;
							const y = top + chartHeight - (tick / 100) * chartHeight;
							return (
								<g key={tick}>
									<line x1={left} x2={width - right} y1={y} y2={y} className='stroke-border' strokeDasharray={tick === 0 ? undefined : "4 4"} />
									<text x={left - 8} y={y + 4} textAnchor='end' className='fill-muted-foreground' fontSize='11'>{Number.isInteger(value) ? value : value.toFixed(1)}{valueSuffix}</text>
								</g>
							);
						})}
						{coordinates.length > 1 && <path d={path} fill='none' className='stroke-primary' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' />}
						{coordinates.map((point) => (
							<g key={`${point.label}-${point.x}`}>
								<circle cx={point.x} cy={point.y} r='5' className='fill-primary' />
								<title>{`${point.tooltip ?? point.label}: ${point.value.toFixed(1)}${valueSuffix}`}</title>
							</g>
						))}
						{coordinates.map((point, index) => (
							<text key={`${point.label}-label-${index}`} x={point.x} y={height - 10} textAnchor='middle' className='fill-muted-foreground' fontSize='10'>
								{point.label.length > 13 ? `${point.label.slice(0, 12)}…` : point.label}
							</text>
						))}
					</svg>
					<p className='text-xs text-muted-foreground'>{caption} · most recent {coordinates.length} records</p>
				</div>
			) : (
				<p className='mt-3 rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground'>{emptyMessage}</p>
			)}
		</section>
	);
}

export function DistributionChart({
	title,
	items,
}: {
	title: string;
	items: Array<{ label: string; count: number; color?: string }>;
}) {
	const maximum = Math.max(1, ...items.map((item) => item.count));
	return (
		<section className='rounded-xl border bg-card p-4'>
			<h3 className='font-semibold'>{title}</h3>
			<div className='mt-4 space-y-3'>
				{items.map((item) => (
					<div key={item.label}>
						<div className='mb-1 flex justify-between gap-3 text-sm'>
							<span>{item.label}</span>
							<span className='tabular-nums text-muted-foreground'>{item.count}</span>
						</div>
						<div className='h-2 overflow-hidden rounded-full bg-muted'>
							<div className={`h-full rounded-full ${item.color ?? "bg-primary"}`} style={{ width: `${(item.count / maximum) * 100}%` }} />
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
