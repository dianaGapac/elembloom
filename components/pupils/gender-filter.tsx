"use client"

export type PupilGenderFilterValue = "all" | "male" | "female"

export function matchesPupilGender(gender: string | null | undefined, filter: PupilGenderFilterValue) {
  return filter === "all" || gender === filter
}

export function sortPupilsAlphabetically<T extends { first_name: string; last_name: string }>(pupils: T[]) {
  return [...pupils].sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
}

export function PupilGenderFilter({
  value,
  onChange,
}: {
  value: PupilGenderFilterValue
  onChange: (value: PupilGenderFilterValue) => void
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      Gender
      <select
        aria-label="Filter pupils by gender"
        value={value}
        onChange={(event) => onChange(event.target.value as PupilGenderFilterValue)}
        className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
      >
        <option value="all">All genders</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
    </label>
  )
}
