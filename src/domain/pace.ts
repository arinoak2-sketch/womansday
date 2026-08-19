/**
 * Target-date maths.
 *
 * Two questions are answered here, and they are kept separate on purpose:
 *   - *Required* pace: what you must save from now on to hit the date.
 *   - *Observed* pace: what you have actually been saving so far.
 * Comparing the two is what turns a target date into useful feedback rather
 * than a number that quietly goes red.
 *
 * A target date in the past is a normal state, not an error: the app reports
 * how far past it is and keeps the required-pace figures non-negative.
 */

import type { CurrencyCode, Transaction } from './types'
import { daysBetween, humanizeDays, parseCalendarDate, parseInstant, startOfDay } from '../lib/date'
import { roundUpToNice } from '../lib/money'

const DAYS_PER_MONTH = 30.4375

export type PaceVerdict =
  | 'no-target'
  | 'complete'
  | 'overdue'
  | 'due-today'
  | 'ahead'
  | 'on-track'
  | 'behind'
  | 'too-early'

export interface PaceInfo {
  hasTargetDate: boolean
  targetDate: Date | null
  isComplete: boolean
  isOverdue: boolean
  /** Whole days until the target date. 0 once the date is today or past. */
  daysRemaining: number
  /** Days past the target date. 0 when not overdue. */
  daysOverdue: number
  /** Human phrase for the time left, e.g. "20 weeks". */
  timeRemainingLabel: string
  remainingMinor: number

  /** Required from here on. Rounded up so following them always suffices. */
  perDayMinor: number
  perWeekMinor: number
  perMonthMinor: number

  /** Measured from the user's own history; null until there's enough of it. */
  observedPerWeekMinor: number | null
  /** Where the observed pace lands them, if it lands them anywhere. */
  projectedDate: Date | null
  verdict: PaceVerdict
}

/** Below this many days of history, an observed pace is just noise. */
const MIN_HISTORY_DAYS = 7
/** Tolerance either side of the required pace that still counts as on track. */
const ON_TRACK_TOLERANCE = 0.05

export function computePace(input: {
  remainingMinor: number
  targetDate?: string
  currency: CurrencyCode
  transactions: readonly Transaction[]
  createdAt: string
  isComplete: boolean
  now?: Date
}): PaceInfo {
  const { remainingMinor, currency, transactions, createdAt, isComplete } = input
  const now = input.now ?? new Date()
  const targetDate = parseCalendarDate(input.targetDate)

  const observed = computeObservedPace(transactions, createdAt, now)
  const projectedDate = projectCompletion(remainingMinor, observed, now)

  const base = {
    hasTargetDate: targetDate !== null,
    targetDate,
    isComplete,
    remainingMinor: Math.max(0, remainingMinor),
    observedPerWeekMinor: observed === null ? null : Math.round(observed * 7),
    projectedDate,
  }

  if (isComplete) {
    return {
      ...base,
      isOverdue: false,
      daysRemaining: 0,
      daysOverdue: 0,
      timeRemainingLabel: '',
      perDayMinor: 0,
      perWeekMinor: 0,
      perMonthMinor: 0,
      verdict: 'complete',
    }
  }

  if (!targetDate) {
    return {
      ...base,
      isOverdue: false,
      daysRemaining: 0,
      daysOverdue: 0,
      timeRemainingLabel: '',
      perDayMinor: 0,
      perWeekMinor: 0,
      perMonthMinor: 0,
      verdict: 'no-target',
    }
  }

  const days = daysBetween(startOfDay(now), targetDate)

  if (days < 0) {
    return {
      ...base,
      isOverdue: true,
      daysRemaining: 0,
      daysOverdue: Math.abs(days),
      timeRemainingLabel: humanizeDays(Math.abs(days)),
      // The date has passed, so there is no schedule left to spread the
      // remainder over. The whole remainder is what's outstanding.
      perDayMinor: base.remainingMinor,
      perWeekMinor: base.remainingMinor,
      perMonthMinor: base.remainingMinor,
      verdict: 'overdue',
    }
  }

  // On the target day itself there is no future left to divide by; the full
  // remainder is due now. Dividing by zero days is what produces Infinity.
  const effectiveDays = Math.max(1, days)
  const perDayExact = base.remainingMinor / effectiveDays

  const perDayMinor = roundUpToNice(perDayExact, currency)
  const perWeekMinor = roundUpToNice(Math.min(base.remainingMinor, perDayExact * 7), currency)
  const perMonthMinor = roundUpToNice(
    Math.min(base.remainingMinor, perDayExact * DAYS_PER_MONTH),
    currency,
  )

  const requiredPerDay = perDayExact
  let verdict: PaceVerdict
  if (days === 0) {
    verdict = 'due-today'
  } else if (observed === null) {
    verdict = 'too-early'
  } else if (observed >= requiredPerDay * (1 + ON_TRACK_TOLERANCE)) {
    verdict = 'ahead'
  } else if (observed >= requiredPerDay * (1 - ON_TRACK_TOLERANCE)) {
    verdict = 'on-track'
  } else {
    verdict = 'behind'
  }

  return {
    ...base,
    isOverdue: false,
    daysRemaining: days,
    daysOverdue: 0,
    timeRemainingLabel: humanizeDays(days),
    perDayMinor,
    perWeekMinor,
    perMonthMinor,
    verdict,
  }
}

/**
 * Average net minor units saved per day, measured from the first contribution
 * (or goal creation, whichever is later evidence of activity) to now.
 *
 * Returns null when the history is too short to say anything honest.
 */
function computeObservedPace(
  transactions: readonly Transaction[],
  createdAt: string,
  now: Date,
): number | null {
  if (transactions.length === 0) return null

  let earliest = Number.POSITIVE_INFINITY
  let net = 0
  for (const tx of transactions) {
    const at = parseInstant(tx.at).getTime()
    if (at < earliest) earliest = at
    net += tx.type === 'add' ? tx.amountMinor : -tx.amountMinor
  }
  if (net <= 0) return null

  const createdMs = parseInstant(createdAt).getTime()
  const startMs = Math.min(earliest, createdMs)
  const elapsedDays = daysBetween(new Date(startMs), now)
  if (elapsedDays < MIN_HISTORY_DAYS) return null

  return net / elapsedDays
}

/** When the observed pace would finish the remainder. Null if it never would. */
function projectCompletion(
  remainingMinor: number,
  observedPerDay: number | null,
  now: Date,
): Date | null {
  if (remainingMinor <= 0) return startOfDay(now)
  if (observedPerDay === null || observedPerDay <= 0) return null
  const days = Math.ceil(remainingMinor / observedPerDay)
  // Beyond a century the projection stops being information.
  if (!Number.isFinite(days) || days > 365 * 100) return null
  const projected = startOfDay(now)
  projected.setDate(projected.getDate() + days)
  return projected
}

/**
 * Two-or-three word version for badges, where `paceHeadline` is too long once
 * it's set in uppercase with wide tracking.
 */
export function paceBadge(pace: PaceInfo): string {
  switch (pace.verdict) {
    case 'complete':
      return 'Reached'
    case 'no-target':
      return 'No date'
    case 'overdue':
      return 'Date passed'
    case 'due-today':
      return 'Due today'
    case 'ahead':
      return 'Ahead'
    case 'on-track':
      return 'On track'
    case 'behind':
      return 'Behind'
    case 'too-early':
      return 'Just started'
  }
}

/** One-line plain-English summary of a verdict, for screen readers and UI. */
export function paceHeadline(pace: PaceInfo): string {
  switch (pace.verdict) {
    case 'complete':
      return 'Goal reached'
    case 'no-target':
      return 'No target date set'
    case 'overdue':
      return `Target date passed ${pace.timeRemainingLabel} ago`
    case 'due-today':
      return 'Target date is today'
    case 'ahead':
      return 'Ahead of the pace you need'
    case 'on-track':
      return 'On track for your target date'
    case 'behind':
      return 'Behind the pace you need'
    case 'too-early':
      return 'Not enough history to judge pace yet'
  }
}
