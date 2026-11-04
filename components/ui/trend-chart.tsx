export type TrendPoint = { label: string; value: number }

export function TrendChart({
	title,
	points,
	emptyMessage = "No recorded data is available for this trend yet.",
}: {
	title: string;
	points: TrendPoint[];
	emptyMessage?: string;
}) {
	const visiblePoints = points.slice(-8);
	const width = 640;
	const height = 220;
	const left = 42;
	const right = 12;
	const top = 14;
	const bottom = 38;
	const chartWidth = width - left - right;
	const chartHeight = height - top - bottom;
	const coordinates = visiblePoints.map((point, index) => ({
		...point,
		x: left + (visiblePoints.length < 2 ? chartWidth / 2 : (index / (visiblePoints.length - 1)) * chartWidth),
		y: top + chartHeight - (Math.max(0, Math.min(100, point.value)) / 100) * chartHeight,
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
						aria-label={`${title}: ${coordinates.map((point) => `${point.label} ${point.value.toFixed(1)} percent`).join(", ")}`}
					>
						{[0, 50, 100].map((tick) => {
							const y = top + chartHeight - (tick / 100) * chartHeight;
							return (
								<g key={tick}>
									<line x1={left} x2={width - right} y1={y} y2={y} className='stroke-border' strokeDasharray={tick === 0 ? undefined : "4 4"} />
									<text x={left - 8} y={y + 4} textAnchor='end' className='fill-muted-foreground' fontSize='11'>{tick}%</text>
								</g>
							);
						})}
						{coordinates.length > 1 && <path d={path} fill='none' className='stroke-primary' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' />}
						{coordinates.map((point) => (
							<g key={`${point.label}-${point.x}`}>
								<circle cx={point.x} cy={point.y} r='5' className='fill-primary' />
								<title>{`${point.label}: ${point.value.toFixed(1)}%`}</title>
							</g>
						))}
						{coordinates.map((point, index) => (
							<text key={`${point.label}-label-${index}`} x={point.x} y={height - 10} textAnchor='middle' className='fill-muted-foreground' fontSize='10'>
								{point.label.length > 13 ? `${point.label.slice(0, 12)}…` : point.label}
							</text>
						))}
					</svg>
					<p className='text-xs text-muted-foreground'>Average recorded assessment score (%) · most recent {coordinates.length} records</p>
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
