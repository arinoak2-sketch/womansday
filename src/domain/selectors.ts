/**
 * Derived values.
 *
 * Everything here is computed from `goals` + `transactions` on demand. No
 * balance, total, or percentage is ever written back to storage, which is what
 * keeps edits and deletes from leaving stale numbers behind.
 */

import type {
  AppData,
  CurrencyCode,
  SavingsGoal,
  Transaction,
  TransactionType,
} from './types'
import { nextMilestone } from './milestones'
import type { MilestoneState } from './types'
import {
  addDays,
  daysBetween,
  parseInstant,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../lib/date'

export interface GoalBalance {
  savedMinor: number
  addedMinor: number
  spentMinor: number
  transactionCount: number
}

export const EMPTY_BALANCE: GoalBalance = {
  savedMinor: 0,
  addedMinor: 0,
  spentMinor: 0,
  transactionCount: 0,
}

/** Sum a transaction list into a balance. Adds increase, spends decrease. */
export function computeBalance(transactions: readonly Transaction[]): GoalBalance {
  let addedMinor = 0
  let spentMinor = 0
  for (const tx of transactions) {
    const amount = Math.max(0, Math.trunc(tx.amountMinor))
    if (tx.type === 'add') addedMinor += amount
    else spentMinor += amount
  }
  return {
    addedMinor,
    spentMinor,
    savedMinor: addedMinor - spentMinor,
    transactionCount: transactions.length,
  }
}

/** Group transactions by goal id, newest first within each goal. */
export function groupTransactionsByGoal(
  transactions: readonly Transaction[],
): Map<string, Transaction[]> {
  const byGoal = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const list = byGoal.get(tx.goalId)
    if (list) list.push(tx)
    else byGoal.set(tx.goalId, [tx])
  }
  for (const list of byGoal.values()) list.sort(compareByDateDesc)
  return byGoal
}

export function compareByDateDesc(a: Transaction, b: Transaction): number {
  const diff = parseInstant(b.at).getTime() - parseInstant(a.at).getTime()
  return diff !== 0 ? diff : b.id.localeCompare(a.id)
}

/** Balance for every goal, including goals with no transactions yet. */
export function computeBalances(
  goals: readonly SavingsGoal[],
  transactions: readonly Transaction[],
): Map<string, GoalBalance> {
  const grouped = groupTransactionsByGoal(transactions)
  const balances = new Map<string, GoalBalance>()
  for (const goal of goals) {
    balances.set(goal.id, computeBalance(grouped.get(goal.id) ?? []))
  }
  return balances
}

/* ------------------------------------------------------------------ */
/* Per-goal view model                                                 */
/* ------------------------------------------------------------------ */

export interface GoalView {
  goal: SavingsGoal
  balance: GoalBalance
  /** Clamped to the target so an over-funded goal never shows 112%. */
  savedMinor: number
  /** Raw balance, which may exceed the target if the user over-saves. */
  rawSavedMinor: number
  remainingMinor: number
  /** 0–1, clamped. */
  ratio: number
  /** 0–100, rounded for display. */
  percent: number
  isComplete: boolean
  isArchived: boolean
  next: MilestoneState | null
  savedThisWeekMinor: number
  savedThisMonthMinor: number
}

export function buildGoalView(
  goal: SavingsGoal,
  transactions: readonly Transaction[],
  now: Date = new Date(),
): GoalView {
  const balance = computeBalance(transactions)
  // A balance should never be negative — the store refuses any command that
  // would make it so — but clamping here means a hand-edited storage payload
  // degrades to 0 rather than rendering nonsense.
  const rawSavedMinor = Math.max(0, balance.savedMinor)
  const target = Math.max(1, goal.targetMinor)
  const savedMinor = Math.min(rawSavedMinor, target)
  const ratio = clamp01(rawSavedMinor / target)

  return {
    goal,
    balance,
    savedMinor,
    rawSavedMinor,
    remainingMinor: Math.max(0, target - rawSavedMinor),
    ratio,
    percent: toDisplayPercent(ratio),
    isComplete: rawSavedMinor >= goal.targetMinor,
    isArchived: Boolean(goal.archivedAt),
    next: nextMilestone(goal, rawSavedMinor),
    savedThisWeekMinor: netInRange(transactions, startOfWeek(now), now),
    savedThisMonthMinor: netInRange(transactions, startOfMonth(now), now),
  }
}

/**
 * Percentages are floored below 100 so a goal one rupee short reads 99%, not a
 * misleading 100%. Only a genuinely met target shows 100.
 */
export function toDisplayPercent(ratio: number): number {
  if (ratio >= 1) return 100
  const percent = Math.floor(ratio * 100)
  // Any non-zero progress deserves at least 1%, otherwise the first small
  // contribution to a large goal looks like it did nothing.
  return ratio > 0 ? Math.max(1, percent) : 0
}

/** Net change (adds minus spends) within a half-open [from, to) window. */
export function netInRange(
  transactions: readonly Transaction[],
  from: Date,
  to: Date,
): number {
  let net = 0
  const fromMs = from.getTime()
  const toMs = to.getTime()
  for (const tx of transactions) {
    const at = parseInstant(tx.at).getTime()
    if (at < fromMs || at > toMs) continue
    net += tx.type === 'add' ? tx.amountMinor : -tx.amountMinor
  }
  return net
}

/** Total of one direction within a window. */
export function sumInRange(
  transactions: readonly Transaction[],
  type: TransactionType,
  from: Date,
  to: Date,
): number {
  let total = 0
  const fromMs = from.getTime()
  const toMs = to.getTime()
  for (const tx of transactions) {
    if (tx.type !== type) continue
    const at = parseInstant(tx.at).getTime()
    if (at < fromMs || at > toMs) continue
    total += tx.amountMinor
  }
  return total
}

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */

export interface PortfolioSummary {
  currency: CurrencyCode
  activeGoals: GoalView[]
  completedGoals: GoalView[]
  archivedGoals: GoalView[]
  /** Across active goals only — the number the dashboard leads with. */
  totalSavedMinor: number
  totalTargetMinor: number
  totalRemainingMinor: number
  /** Weighted by target, so a large goal moves the needle more than a small one. */
  overallRatio: number
  overallPercent: number
  /** Lifetime figures across every goal, archived included. */
  lifetimeAddedMinor: number
  lifetimeSpentMinor: number
  completedCount: number
  topPriorityGoal: GoalView | null
  closestGoal: GoalView | null
}

/**
 * Build the whole dashboard model in one pass.
 *
 * `goals` and `transactions` come straight from the store; this is the single
 * place that decides what "active", "completed" and "archived" mean.
 */
export function buildPortfolio(data: AppData, now: Date = new Date()): PortfolioSummary {
  const grouped = groupTransactionsByGoal(data.transactions)
  const views = data.goals.map((goal) => buildGoalView(goal, grouped.get(goal.id) ?? [], now))

  const archivedGoals: GoalView[] = []
  const completedGoals: GoalView[] = []
  const activeGoals: GoalView[] = []

  for (const view of views) {
    if (view.isArchived) archivedGoals.push(view)
    else if (view.isComplete) completedGoals.push(view)
    else activeGoals.push(view)
  }

  activeGoals.sort(compareActiveGoals)
  completedGoals.sort(compareCompletedGoals)
  archivedGoals.sort(compareCompletedGoals)

  let totalSavedMinor = 0
  let totalTargetMinor = 0
  for (const view of activeGoals) {
    totalSavedMinor += view.rawSavedMinor
    totalTargetMinor += view.goal.targetMinor
  }
  // Completed goals still hold money the user has saved, so they belong in the
  // headline total even though they've left the active list.
  for (const view of completedGoals) totalSavedMinor += view.rawSavedMinor

  let lifetimeAddedMinor = 0
  let lifetimeSpentMinor = 0
  for (const view of views) {
    lifetimeAddedMinor += view.balance.addedMinor
    lifetimeSpentMinor += view.balance.spentMinor
  }

  const overallRatio =
    totalTargetMinor > 0
      ? clamp01(
          activeGoals.reduce((sum, view) => sum + Math.min(view.rawSavedMinor, view.goal.targetMinor), 0) /
            totalTargetMinor,
        )
      : activeGoals.length === 0 && completedGoals.length > 0
        ? 1
        : 0

  const withProgress = activeGoals.filter((view) => view.rawSavedMinor > 0)
  const closestGoal =
    withProgress.length > 0
      ? withProgress.reduce((best, view) => (view.ratio > best.ratio ? view : best))
      : null

  return {
    currency: data.settings.currency,
    activeGoals,
    completedGoals,
    archivedGoals,
    totalSavedMinor,
    totalTargetMinor,
    totalRemainingMinor: Math.max(0, totalTargetMinor - totalSavedMinor),
    overallRatio,
    overallPercent: toDisplayPercent(overallRatio),
    lifetimeAddedMinor,
    lifetimeSpentMinor,
    completedCount: completedGoals.length + archivedGoals.filter((v) => v.isComplete).length,
    topPriorityGoal: activeGoals[0] ?? null,
    closestGoal,
  }
}

const PRIORITY_RANK: Record<SavingsGoal['priority'], number> = { high: 0, medium: 1, low: 2 }

/** High priority first, then whichever is closest to done, then newest. */
function compareActiveGoals(a: GoalView, b: GoalView): number {
  const byPriority = PRIORITY_RANK[a.goal.priority] - PRIORITY_RANK[b.goal.priority]
  if (byPriority !== 0) return byPriority
  if (b.ratio !== a.ratio) return b.ratio - a.ratio
  return parseInstant(b.goal.createdAt).getTime() - parseInstant(a.goal.createdAt).getTime()
}

/** Most recently finished first. */
function compareCompletedGoals(a: GoalView, b: GoalView): number {
  const aAt = parseInstant(a.goal.completedAt ?? a.goal.archivedAt ?? a.goal.createdAt).getTime()
  const bAt = parseInstant(b.goal.completedAt ?? b.goal.archivedAt ?? b.goal.createdAt).getTime()
  return bAt - aAt
}

/* ------------------------------------------------------------------ */
/* Activity feed                                                       */
/* ------------------------------------------------------------------ */

export interface ActivityEntry {
  transaction: Transaction
  goal: SavingsGoal | undefined
}

export interface ActivityGroup {
  key: string
  label: string
  date: Date
  entries: ActivityEntry[]
}

/** Recent transactions grouped under Today / Yesterday / date headings. */
export function buildActivityFeed(
  data: AppData,
  options: { limit?: number; goalId?: string; now?: Date } = {},
): ActivityGroup[] {
  const { limit = 30, goalId, now = new Date() } = options
  const goalsById = new Map(data.goals.map((goal) => [goal.id, goal]))

  const relevant = (goalId ? data.transactions.filter((tx) => tx.goalId === goalId) : data.transactions)
    .slice()
    .sort(compareByDateDesc)
    .slice(0, limit)

  const groups: ActivityGroup[] = []
  let current: ActivityGroup | null = null

  for (const transaction of relevant) {
    const date = startOfDay(parseInstant(transaction.at))
    const key = date.toISOString()
    if (!current || current.key !== key) {
      current = { key, label: dayHeading(date, now), date, entries: [] }
      groups.push(current)
    }
    current.entries.push({ transaction, goal: goalsById.get(transaction.goalId) })
  }

  return groups
}

function dayHeading(date: Date, now: Date): string {
  const diff = daysBetween(date, now)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return `${diff} days ago`
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/* ------------------------------------------------------------------ */
/* Upcoming milestones                                                 */
/* ------------------------------------------------------------------ */

export interface UpcomingMilestone {
  goal: SavingsGoal
  milestone: MilestoneState
  remainingMinor: number
  /** 0–1 progress toward this milestone specifically. */
  progress: number
}

/** The milestones the user is closest to clearing, nearest first. */
export function buildUpcomingMilestones(
  activeGoals: readonly GoalView[],
  limit = 3,
): UpcomingMilestone[] {
  const upcoming: UpcomingMilestone[] = []
  for (const view of activeGoals) {
    if (!view.next) continue
    upcoming.push({
      goal: view.goal,
      milestone: view.next,
      remainingMinor: Math.max(0, view.next.thresholdMinor - view.rawSavedMinor),
      progress: view.next.progress,
    })
  }
  upcoming.sort((a, b) => b.progress - a.progress || a.remainingMinor - b.remainingMinor)
  return upcoming.slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Time series                                                         */
/* ------------------------------------------------------------------ */

export interface DailyPoint {
  date: Date
  /** Net change on this day. */
  netMinor: number
  addedMinor: number
  spentMinor: number
  /** Running balance across all goals at end of this day. */
  cumulativeMinor: number
}

/**
 * Daily series over the trailing `days` window, including days with no
 * activity so the chart's x-axis stays evenly spaced.
 */
export function buildDailySeries(
  transactions: readonly Transaction[],
  days: number,
  now: Date = new Date(),
): DailyPoint[] {
  const end = startOfDay(now)
  const start = addDays(end, -(days - 1))

  const buckets = new Map<number, { added: number; spent: number }>()
  let openingBalance = 0

  for (const tx of transactions) {
    const day = startOfDay(parseInstant(tx.at)).getTime()
    const signed = tx.type === 'add' ? tx.amountMinor : -tx.amountMinor
    if (day < start.getTime()) {
      // Everything before the window folds into the opening balance so the
      // cumulative line starts at the right height.
      openingBalance += signed
      continue
    }
    if (day > end.getTime()) continue
    const bucket = buckets.get(day) ?? { added: 0, spent: 0 }
    if (tx.type === 'add') bucket.added += tx.amountMinor
    else bucket.spent += tx.amountMinor
    buckets.set(day, bucket)
  }

  const points: DailyPoint[] = []
  let running = openingBalance
  for (let i = 0; i < days; i += 1) {
    const date = addDays(start, i)
    const bucket = buckets.get(date.getTime()) ?? { added: 0, spent: 0 }
    const netMinor = bucket.added - bucket.spent
    running += netMinor
    points.push({
      date,
      netMinor,
      addedMinor: bucket.added,
      spentMinor: bucket.spent,
      cumulativeMinor: running,
    })
  }
  return points
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
