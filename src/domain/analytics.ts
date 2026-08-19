/**
 * Analytics.
 *
 * Every figure here is derived from the transaction log on demand. Nothing is
 * cached or stored, so an edited or deleted entry is reflected everywhere at
 * once.
 *
 * Where there isn't enough history to say something true, these functions
 * return null rather than a zero — "no data yet" and "you saved nothing" are
 * different statements and the UI needs to tell them apart.
 */

import type { AppData, Transaction } from './types'
import type { GoalView } from './selectors'
import {
  addMonths,
  daysBetween,
  parseInstant,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../lib/date'

export interface WeekBucket {
  start: Date
  addedMinor: number
  spentMinor: number
  netMinor: number
}

export interface MonthBucket {
  start: Date
  label: string
  addedMinor: number
  spentMinor: number
  netMinor: number
}

export interface AnalyticsSummary {
  totalAddedMinor: number
  totalSpentMinor: number
  netSavedMinor: number
  /** Null until at least one full week of history exists. */
  averageWeeklyMinor: number | null
  averageMonthlyMinor: number | null
  bestWeek: WeekBucket | null
  mostActiveGoal: { view: GoalView; transactionCount: number } | null
  closestGoal: GoalView | null
  completedCount: number
  activeCount: number
  firstActivity: Date | null
  /** Distinct days with at least one contribution. */
  savingDays: number
}

/** A week of history is the minimum before an average means anything. */
const MIN_DAYS_FOR_AVERAGE = 7

export function buildAnalytics(
  data: AppData,
  views: { active: GoalView[]; completed: GoalView[]; archived: GoalView[] },
  now: Date = new Date(),
): AnalyticsSummary {
  const transactions = data.transactions
  const allViews = [...views.active, ...views.completed, ...views.archived]

  let totalAddedMinor = 0
  let totalSpentMinor = 0
  let earliest: number | null = null
  const savingDayKeys = new Set<number>()
  const countsByGoal = new Map<string, number>()

  for (const tx of transactions) {
    const at = parseInstant(tx.at).getTime()
    if (earliest === null || at < earliest) earliest = at

    if (tx.type === 'add') {
      totalAddedMinor += tx.amountMinor
      savingDayKeys.add(startOfDay(new Date(at)).getTime())
    } else {
      totalSpentMinor += tx.amountMinor
    }

    countsByGoal.set(tx.goalId, (countsByGoal.get(tx.goalId) ?? 0) + 1)
  }

  const firstActivity = earliest === null ? null : new Date(earliest)
  const historyDays = firstActivity === null ? 0 : daysBetween(firstActivity, now) + 1
  const netSavedMinor = totalAddedMinor - totalSpentMinor

  const hasEnoughHistory = historyDays >= MIN_DAYS_FOR_AVERAGE && totalAddedMinor > 0
  const averageWeeklyMinor = hasEnoughHistory
    ? Math.round((netSavedMinor / historyDays) * 7)
    : null
  const averageMonthlyMinor = hasEnoughHistory
    ? Math.round((netSavedMinor / historyDays) * 30.4375)
    : null

  let mostActiveGoal: AnalyticsSummary['mostActiveGoal'] = null
  for (const [goalId, count] of countsByGoal) {
    const view = allViews.find((candidate) => candidate.goal.id === goalId)
    if (!view) continue
    if (!mostActiveGoal || count > mostActiveGoal.transactionCount) {
      mostActiveGoal = { view, transactionCount: count }
    }
  }

  const inProgress = views.active.filter((view) => view.rawSavedMinor > 0)
  const closestGoal =
    inProgress.length > 0
      ? inProgress.reduce((best, view) => (view.ratio > best.ratio ? view : best))
      : null

  return {
    totalAddedMinor,
    totalSpentMinor,
    netSavedMinor,
    averageWeeklyMinor,
    averageMonthlyMinor,
    bestWeek: findBestWeek(transactions),
    mostActiveGoal,
    closestGoal,
    completedCount: views.completed.length + views.archived.filter((v) => v.isComplete).length,
    activeCount: views.active.length,
    firstActivity,
    savingDays: savingDayKeys.size,
  }
}

/** The calendar week with the largest net gain. Null when nothing was added. */
function findBestWeek(transactions: readonly Transaction[]): WeekBucket | null {
  if (transactions.length === 0) return null

  const weeks = new Map<number, WeekBucket>()
  for (const tx of transactions) {
    const start = startOfWeek(parseInstant(tx.at))
    const key = start.getTime()
    const bucket = weeks.get(key) ?? { start, addedMinor: 0, spentMinor: 0, netMinor: 0 }
    if (tx.type === 'add') bucket.addedMinor += tx.amountMinor
    else bucket.spentMinor += tx.amountMinor
    bucket.netMinor = bucket.addedMinor - bucket.spentMinor
    weeks.set(key, bucket)
  }

  let best: WeekBucket | null = null
  for (const bucket of weeks.values()) {
    if (bucket.netMinor <= 0) continue
    if (!best || bucket.netMinor > best.netMinor) best = bucket
  }
  return best
}

/**
 * Monthly in/out totals over a trailing window, including months with no
 * activity so the chart's x-axis stays evenly spaced.
 */
export function buildMonthlyFlow(
  transactions: readonly Transaction[],
  months: number,
  now: Date = new Date(),
): MonthBucket[] {
  const end = startOfMonth(now)
  const start = addMonths(end, -(months - 1))

  const buckets = new Map<number, { added: number; spent: number }>()
  for (const tx of transactions) {
    const month = startOfMonth(parseInstant(tx.at))
    if (month < start || month > end) continue
    const key = month.getTime()
    const bucket = buckets.get(key) ?? { added: 0, spent: 0 }
    if (tx.type === 'add') bucket.added += tx.amountMinor
    else bucket.spent += tx.amountMinor
    buckets.set(key, bucket)
  }

  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short' })
  const result: MonthBucket[] = []
  for (let i = 0; i < months; i += 1) {
    const monthStart = addMonths(start, i)
    const bucket = buckets.get(monthStart.getTime()) ?? { added: 0, spent: 0 }
    result.push({
      start: monthStart,
      label: formatter.format(monthStart),
      addedMinor: bucket.added,
      spentMinor: bucket.spent,
      netMinor: bucket.added - bucket.spent,
    })
  }
  return result
}
