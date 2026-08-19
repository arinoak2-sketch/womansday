/**
 * Every mutation in the app goes through `applyCommand`.
 *
 * The function is pure: given the current document and a command it returns
 * either a new document or a human-readable failure. Keeping validation and
 * mutation in one place is what guarantees the invariants hold no matter which
 * screen triggered the change — a balance can never go negative, a completed
 * goal is always genuinely funded, and milestone bookkeeping always matches the
 * balance it was derived from.
 */

import type {
  AccentName,
  AppData,
  CurrencyCode,
  Milestone,
  Priority,
  Product,
  SavingsGoal,
  Settings,
  Transaction,
  TransactionCategory,
  TransactionType,
} from '../domain/types'
import { computeBalance, groupTransactionsByGoal } from '../domain/selectors'
import { generateMilestones, pendingCelebrations } from '../domain/milestones'
import { createId } from '../lib/id'
import { formatMoney, MAX_MAJOR_UNITS, minorUnitScale } from '../lib/money'
import { isValidDate, parseCalendarDate, startOfDay } from '../lib/date'

/* ------------------------------------------------------------------ */
/* Result types                                                        */
/* ------------------------------------------------------------------ */

export type CommandErrorCode =
  | 'goal-not-found'
  | 'transaction-not-found'
  | 'invalid-name'
  | 'invalid-amount'
  | 'invalid-target'
  | 'invalid-date'
  | 'insufficient-funds'
  | 'goal-limit'
  | 'invalid-import'

export interface CommandError {
  code: CommandErrorCode
  /** Written for the person using the app, never a stack trace. */
  message: string
  /** Which form field to attach the message to, when there is one. */
  field?: string
  /** For insufficient-funds: what is actually available, in minor units. */
  availableMinor?: number
}

export interface CommandSuccess {
  ok: true
  data: AppData
  /** Milestones cleared by this command that have not been celebrated yet. */
  celebrations: { goal: SavingsGoal; milestones: Milestone[] }
  /** Ids created by this command, so the caller can navigate to them. */
  createdGoalId?: string
  createdTransactionId?: string
}

export type CommandOutcome = CommandSuccess | { ok: false; error: CommandError }

const NO_CELEBRATIONS = { goal: null as unknown as SavingsGoal, milestones: [] as Milestone[] }

function ok(data: AppData, extra: Partial<CommandSuccess> = {}): CommandSuccess {
  return { ok: true, data, celebrations: NO_CELEBRATIONS, ...extra }
}

function err(
  code: CommandErrorCode,
  message: string,
  extra: Partial<CommandError> = {},
): CommandOutcome {
  return { ok: false, error: { code, message, ...extra } }
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

/** A cap that keeps the dashboard usable and storage bounded. */
export const MAX_GOALS = 60
export const MAX_NAME_LENGTH = 60
export const MAX_NOTE_LENGTH = 280

export interface CreateGoalInput {
  name: string
  targetMinor: number
  currency: CurrencyCode
  accent?: AccentName
  priority?: Priority
  targetDate?: string
  note?: string
  product?: Product
  /** Optional opening balance, recorded as a real transaction. */
  startingMinor?: number
}

export interface UpdateGoalInput {
  name?: string
  targetMinor?: number
  priority?: Priority
  accent?: AccentName
  /** Pass null to clear the target date. */
  targetDate?: string | null
  note?: string | null
}

export interface AddTransactionInput {
  goalId: string
  type: TransactionType
  amountMinor: number
  note?: string
  category?: TransactionCategory
  /** Defaults to now. */
  at?: string
}

export interface UpdateTransactionInput {
  amountMinor?: number
  type?: TransactionType
  note?: string | null
  category?: TransactionCategory | null
  at?: string
}

export type Command =
  | { type: 'create-goal'; input: CreateGoalInput }
  | { type: 'update-goal'; goalId: string; input: UpdateGoalInput }
  | { type: 'delete-goal'; goalId: string }
  | { type: 'set-goal-archived'; goalId: string; archived: boolean }
  | { type: 'add-transaction'; input: AddTransactionInput }
  | { type: 'update-transaction'; transactionId: string; input: UpdateTransactionInput }
  | { type: 'delete-transaction'; transactionId: string }
  | { type: 'attach-price-snapshot'; goalId: string; product: Product }
  | { type: 'celebrate-milestones'; goalId: string; milestoneIds: string[] }
  | { type: 'update-settings'; input: Partial<Settings> }
  | { type: 'reset-data' }
  | { type: 'import-data'; data: AppData }

export function applyCommand(data: AppData, command: Command): CommandOutcome {
  switch (command.type) {
    case 'create-goal':
      return createGoal(data, command.input)
    case 'update-goal':
      return updateGoal(data, command.goalId, command.input)
    case 'delete-goal':
      return deleteGoal(data, command.goalId)
    case 'set-goal-archived':
      return setGoalArchived(data, command.goalId, command.archived)
    case 'add-transaction':
      return addTransaction(data, command.input)
    case 'update-transaction':
      return updateTransaction(data, command.transactionId, command.input)
    case 'delete-transaction':
      return deleteTransaction(data, command.transactionId)
    case 'attach-price-snapshot':
      return attachProduct(data, command.goalId, command.product)
    case 'celebrate-milestones':
      return celebrateMilestones(data, command.goalId, command.milestoneIds)
    case 'update-settings':
      return ok({ ...data, settings: { ...data.settings, ...command.input } })
    case 'reset-data':
      return ok({ ...data, goals: [], transactions: [] })
    case 'import-data':
      return ok(command.data)
  }
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

const ACCENTS: AccentName[] = ['amber', 'jade', 'plum', 'indigo', 'clay', 'slate']

function createGoal(data: AppData, input: CreateGoalInput): CommandOutcome {
  if (data.goals.length >= MAX_GOALS) {
    return err(
      'goal-limit',
      `You can track up to ${MAX_GOALS} goals at once. Archive one you've finished to make room.`,
    )
  }

  const name = normalizeName(input.name)
  if (!name) return err('invalid-name', 'Give your goal a name.', { field: 'name' })

  const targetError = validateTarget(input.targetMinor, input.currency)
  if (targetError) return targetError

  const dateError = validateFutureDate(input.targetDate)
  if (dateError) return dateError

  const starting = Math.trunc(input.startingMinor ?? 0)
  if (starting < 0) {
    return err('invalid-amount', 'A starting amount cannot be negative.', { field: 'starting' })
  }
  if (starting > input.targetMinor) {
    return err(
      'invalid-amount',
      `A starting amount of ${formatMoney(starting, input.currency)} is more than the ${formatMoney(input.targetMinor, input.currency)} target. Lower it, or raise the target.`,
      { field: 'starting' },
    )
  }

  const now = new Date().toISOString()
  const goal: SavingsGoal = {
    id: createId('goal'),
    name,
    targetMinor: Math.trunc(input.targetMinor),
    currency: input.currency,
    accent: input.accent ?? pickAccent(data.goals),
    priority: input.priority ?? 'medium',
    createdAt: now,
    targetDate: input.targetDate || undefined,
    note: normalizeNote(input.note),
    product: input.product,
    celebratedMilestoneIds: [],
  }

  const transactions = [...data.transactions]
  let createdTransactionId: string | undefined
  if (starting > 0) {
    const opening: Transaction = {
      id: createId('tx'),
      goalId: goal.id,
      type: 'add',
      amountMinor: starting,
      at: now,
      note: 'Starting amount',
      category: 'savings',
    }
    transactions.push(opening)
    createdTransactionId = opening.id
  }

  const next: AppData = { ...data, goals: [...data.goals, goal], transactions }
  return withReconciliation(next, goal.id, { createdGoalId: goal.id, createdTransactionId })
}

function updateGoal(data: AppData, goalId: string, input: UpdateGoalInput): CommandOutcome {
  const goal = data.goals.find((g) => g.id === goalId)
  if (!goal) return missingGoal()

  const patch: Partial<SavingsGoal> = {}

  if (input.name !== undefined) {
    const name = normalizeName(input.name)
    if (!name) return err('invalid-name', 'Give your goal a name.', { field: 'name' })
    patch.name = name
  }

  if (input.targetMinor !== undefined) {
    const targetError = validateTarget(input.targetMinor, goal.currency)
    if (targetError) return targetError
    patch.targetMinor = Math.trunc(input.targetMinor)
  }

  if (input.targetDate !== undefined) {
    if (input.targetDate === null || input.targetDate === '') {
      patch.targetDate = undefined
    } else {
      // Editing an existing goal accepts any real date. A goal whose date has
      // already slipped is a normal situation the pace maths handles, and
      // refusing the edit would trap the user.
      if (!parseCalendarDate(input.targetDate)) {
        return err('invalid-date', "That date doesn't look right.", { field: 'targetDate' })
      }
      patch.targetDate = input.targetDate
    }
  }

  if (input.note !== undefined) patch.note = input.note === null ? undefined : normalizeNote(input.note)
  if (input.priority !== undefined) patch.priority = input.priority
  if (input.accent !== undefined) patch.accent = input.accent

  const next: AppData = {
    ...data,
    goals: data.goals.map((g) => (g.id === goalId ? { ...g, ...patch } : g)),
  }
  return withReconciliation(next, goalId)
}

function deleteGoal(data: AppData, goalId: string): CommandOutcome {
  if (!data.goals.some((g) => g.id === goalId)) return missingGoal()
  return ok({
    ...data,
    goals: data.goals.filter((g) => g.id !== goalId),
    // Orphaned transactions would silently distort lifetime analytics.
    transactions: data.transactions.filter((tx) => tx.goalId !== goalId),
  })
}

function setGoalArchived(data: AppData, goalId: string, archived: boolean): CommandOutcome {
  if (!data.goals.some((g) => g.id === goalId)) return missingGoal()
  return ok({
    ...data,
    goals: data.goals.map((g) =>
      g.id === goalId ? { ...g, archivedAt: archived ? new Date().toISOString() : undefined } : g,
    ),
  })
}

function attachProduct(data: AppData, goalId: string, product: Product): CommandOutcome {
  if (!data.goals.some((g) => g.id === goalId)) return missingGoal()
  return ok({
    ...data,
    goals: data.goals.map((g) => (g.id === goalId ? { ...g, product } : g)),
  })
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

function addTransaction(data: AppData, input: AddTransactionInput): CommandOutcome {
  const goal = data.goals.find((g) => g.id === input.goalId)
  if (!goal) return missingGoal()

  const amountMinor = Math.trunc(input.amountMinor)
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return err('invalid-amount', 'Enter an amount greater than zero.', { field: 'amount' })
  }

  const at = normalizeInstant(input.at)
  if (!at) return err('invalid-date', "That date doesn't look right.", { field: 'at' })

  const goalTransactions = data.transactions.filter((tx) => tx.goalId === goal.id)
  const balance = computeBalance(goalTransactions)

  if (input.type === 'spend' && amountMinor > balance.savedMinor) {
    return insufficientFunds(balance.savedMinor, goal.currency)
  }

  const transaction: Transaction = {
    id: createId('tx'),
    goalId: goal.id,
    type: input.type,
    amountMinor,
    at,
    note: normalizeNote(input.note),
    category: input.category,
  }

  const next: AppData = { ...data, transactions: [...data.transactions, transaction] }
  return withReconciliation(next, goal.id, { createdTransactionId: transaction.id })
}

function updateTransaction(
  data: AppData,
  transactionId: string,
  input: UpdateTransactionInput,
): CommandOutcome {
  const existing = data.transactions.find((tx) => tx.id === transactionId)
  if (!existing) {
    return err('transaction-not-found', "That entry no longer exists. It may have been deleted.")
  }
  const goal = data.goals.find((g) => g.id === existing.goalId)
  if (!goal) return missingGoal()

  const amountMinor =
    input.amountMinor === undefined ? existing.amountMinor : Math.trunc(input.amountMinor)
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return err('invalid-amount', 'Enter an amount greater than zero.', { field: 'amount' })
  }

  const at = input.at === undefined ? existing.at : normalizeInstant(input.at)
  if (!at) return err('invalid-date', "That date doesn't look right.", { field: 'at' })

  const updated: Transaction = {
    ...existing,
    amountMinor,
    at,
    type: input.type ?? existing.type,
    note: input.note === undefined ? existing.note : input.note === null ? undefined : normalizeNote(input.note),
    category:
      input.category === undefined ? existing.category : input.category === null ? undefined : input.category,
  }

  // Re-run the whole goal's balance with the edit applied. An edit that would
  // drive the balance below zero is refused, which is the same rule that stops
  // an over-sized spend — it just has to be checked against the *result* here
  // rather than the current balance.
  const rebuilt = data.transactions.map((tx) => (tx.id === transactionId ? updated : tx))
  const balance = computeBalance(rebuilt.filter((tx) => tx.goalId === goal.id))
  if (balance.savedMinor < 0) {
    const withoutEdit = computeBalance(
      data.transactions.filter((tx) => tx.goalId === goal.id && tx.id !== transactionId),
    )
    return insufficientFunds(withoutEdit.savedMinor, goal.currency, 'edit')
  }

  return withReconciliation({ ...data, transactions: rebuilt }, goal.id)
}

function deleteTransaction(data: AppData, transactionId: string): CommandOutcome {
  const existing = data.transactions.find((tx) => tx.id === transactionId)
  if (!existing) {
    return err('transaction-not-found', 'That entry no longer exists.')
  }

  const rebuilt = data.transactions.filter((tx) => tx.id !== transactionId)
  const balance = computeBalance(rebuilt.filter((tx) => tx.goalId === existing.goalId))
  if (balance.savedMinor < 0) {
    const goal = data.goals.find((g) => g.id === existing.goalId)
    return err(
      'insufficient-funds',
      `Removing this would leave the goal owing ${formatMoney(
        Math.abs(balance.savedMinor),
        goal?.currency ?? 'INR',
      )}. Adjust the spends on this goal first.`,
    )
  }

  return withReconciliation({ ...data, transactions: rebuilt }, existing.goalId)
}

function celebrateMilestones(
  data: AppData,
  goalId: string,
  milestoneIds: string[],
): CommandOutcome {
  if (milestoneIds.length === 0) return ok(data)
  return ok({
    ...data,
    goals: data.goals.map((goal) =>
      goal.id === goalId
        ? {
            ...goal,
            celebratedMilestoneIds: unique([...goal.celebratedMilestoneIds, ...milestoneIds]),
          }
        : goal,
    ),
  })
}

/* ------------------------------------------------------------------ */
/* Reconciliation                                                      */
/* ------------------------------------------------------------------ */

/**
 * After any change to a goal's transactions or target, bring the goal's
 * bookkeeping back in line with the balance:
 *
 *   - set or clear `completedAt` so it always reflects real funding
 *   - drop celebrated ids for milestones that no longer exist, or that the
 *     balance has fallen back below, so re-reaching one celebrates again
 *   - report milestones newly cleared but not yet shown
 */
function withReconciliation(
  data: AppData,
  goalId: string,
  extra: Partial<CommandSuccess> = {},
): CommandSuccess {
  const grouped = groupTransactionsByGoal(data.transactions)
  const goals = data.goals.map((goal) => {
    if (goal.id !== goalId) return goal
    return reconcileGoal(goal, grouped.get(goal.id) ?? [])
  })

  const next: AppData = { ...data, goals }
  const goal = goals.find((g) => g.id === goalId)
  if (!goal) return ok(next, extra)

  const balance = computeBalance(grouped.get(goalId) ?? [])
  const savedMinor = Math.max(0, balance.savedMinor)
  const milestones = pendingCelebrations(goal, savedMinor)

  return ok(next, { ...extra, celebrations: { goal, milestones } })
}

export function reconcileGoal(goal: SavingsGoal, transactions: readonly Transaction[]): SavingsGoal {
  const savedMinor = Math.max(0, computeBalance(transactions).savedMinor)
  const isComplete = savedMinor >= goal.targetMinor

  const validIds = new Set(generateMilestones(goal).map((m) => m.id))
  const thresholds = new Map(generateMilestones(goal).map((m) => [m.id, m.thresholdMinor]))
  const celebratedMilestoneIds = goal.celebratedMilestoneIds.filter((id) => {
    if (!validIds.has(id)) return false
    return savedMinor >= (thresholds.get(id) ?? Number.POSITIVE_INFINITY)
  })

  return {
    ...goal,
    celebratedMilestoneIds,
    completedAt: isComplete ? (goal.completedAt ?? new Date().toISOString()) : undefined,
  }
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

function validateTarget(targetMinor: number, currency: CurrencyCode): CommandOutcome | null {
  if (!Number.isSafeInteger(Math.trunc(targetMinor)) || targetMinor <= 0) {
    return err('invalid-target', 'Set a target greater than zero.', { field: 'target' })
  }
  if (targetMinor / minorUnitScale(currency) >= MAX_MAJOR_UNITS) {
    return err('invalid-target', 'That target is larger than this app can track.', {
      field: 'target',
    })
  }
  return null
}

/** New goals must aim at a date that hasn't already passed. */
function validateFutureDate(value: string | undefined): CommandOutcome | null {
  if (!value) return null
  const date = parseCalendarDate(value)
  if (!date) return err('invalid-date', "That date doesn't look right.", { field: 'targetDate' })
  if (date.getTime() < startOfDay(new Date()).getTime()) {
    return err('invalid-date', 'Pick a target date in the future.', { field: 'targetDate' })
  }
  return null
}

function insufficientFunds(
  availableMinor: number,
  currency: CurrencyCode,
  mode: 'spend' | 'edit' = 'spend',
): CommandOutcome {
  const available = formatMoney(Math.max(0, availableMinor), currency)
  const message =
    mode === 'spend'
      ? `You only have ${available} saved toward this goal.`
      : `That change would take this goal below zero. There's ${available} available from the other entries.`
  return err('insufficient-funds', message, { field: 'amount', availableMinor })
}

function missingGoal(): CommandOutcome {
  return err('goal-not-found', 'That goal no longer exists. It may have been deleted.')
}

function normalizeName(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
}

function normalizeNote(note: string | undefined): string | undefined {
  const trimmed = (note ?? '').trim().slice(0, MAX_NOTE_LENGTH)
  return trimmed === '' ? undefined : trimmed
}

function normalizeInstant(value: string | undefined): string | null {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  if (!isValidDate(date)) return null
  return date.toISOString()
}

/** Rotate through the accent palette so adjacent goals look distinct. */
function pickAccent(goals: readonly SavingsGoal[]): AccentName {
  const counts = new Map<AccentName, number>(ACCENTS.map((a) => [a, 0]))
  for (const goal of goals) counts.set(goal.accent, (counts.get(goal.accent) ?? 0) + 1)
  let best: AccentName = ACCENTS[0]
  let bestCount = Number.POSITIVE_INFINITY
  for (const accent of ACCENTS) {
    const count = counts.get(accent) ?? 0
    if (count < bestCount) {
      best = accent
      bestCount = count
    }
  }
  return best
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}
