/**
 * Date helpers.
 *
 * Timestamps (`Transaction.at`, `SavingsGoal.createdAt`) are full ISO-8601
 * instants. Calendar dates (`SavingsGoal.targetDate`) are `YYYY-MM-DD` and are
 * always interpreted in the *user's local* timezone — parsing them with
 * `new Date(str)` would treat them as UTC and shift the day for anyone west
 * of Greenwich, which is the classic off-by-one target-date bug.
 */

export const MS_PER_DAY = 86_400_000

/** Parse `YYYY-MM-DD` as local midnight. Returns null if malformed. */
export function parseCalendarDate(value: string | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  // Rejects impossible dates that JS would silently roll over (Feb 31).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** Format a Date as `YYYY-MM-DD` in local time. */
export function toCalendarDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Monday-based week start. */
export function startOfWeek(date: Date): Date {
  const start = startOfDay(date)
  const weekday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - weekday)
  return start
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

/**
 * Whole days from `from` to `to`, counted on calendar-day boundaries so DST
 * transitions can't produce 0.958 of a day.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime()
  const b = startOfDay(to).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const dateFmtNoYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const longDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatDate(date: Date, opts: { omitYear?: boolean } = {}): string {
  return opts.omitYear ? dateFmtNoYear.format(date) : dateFmt.format(date)
}

export function formatLongDate(date: Date): string {
  return longDateFmt.format(date)
}

export function formatMonthYear(date: Date): string {
  return monthYearFmt.format(date)
}

export function formatMonthShort(date: Date): string {
  return monthShortFmt.format(date)
}

export function formatTime(date: Date): string {
  return timeFmt.format(date)
}

/** "Today" / "Yesterday" / "3 days ago" / a date once it's older than a week. */
export function relativeDayLabel(date: Date, now: Date = new Date()): string {
  const diff = daysBetween(date, now)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return `${diff} days ago`
  if (diff === -1) return 'Tomorrow'
  if (diff < -1 && diff > -7) return `In ${Math.abs(diff)} days`
  const sameYear = date.getFullYear() === now.getFullYear()
  return formatDate(date, { omitYear: sameYear })
}

/** Human duration for target dates: "20 weeks", "3 months", "5 days". */
export function humanizeDays(days: number): string {
  const n = Math.max(0, Math.round(days))
  if (n === 0) return 'today'
  if (n === 1) return '1 day'
  if (n < 14) return `${n} days`
  if (n < 60) {
    const weeks = Math.round(n / 7)
    return weeks === 1 ? '1 week' : `${weeks} weeks`
  }
  if (n < 365) {
    const months = Math.round(n / 30.44)
    return months === 1 ? '1 month' : `${months} months`
  }
  const years = n / 365.25
  const rounded = Math.round(years * 10) / 10
  return rounded === 1 ? '1 year' : `${rounded} years`
}

/** True when `value` is a real, finite Date. */
export function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/** Safe ISO timestamp → Date, never throws. */
export function parseInstant(iso: string): Date {
  const date = new Date(iso)
  return isValidDate(date) ? date : new Date(0)
}
