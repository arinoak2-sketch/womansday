import { describe, expect, it } from 'vitest'
import { applyCommand, type Command } from '../../store/commands'
import { emptyData } from '../../store/persistence'
import { buildGoalView, computeBalance } from '../selectors'
import { fromMajor } from '../../lib/money'
import type { AppData } from '../types'

const INR = (major: number) => fromMajor(major, 'INR')

/** Apply a command and fail loudly if it was rejected. */
function ok(data: AppData, command: Command): AppData {
  const outcome = applyCommand(data, command)
  if (!outcome.ok) throw new Error(`command rejected: ${outcome.error.message}`)
  return outcome.data
}

function seed(overrides: { targetMajor?: number; startingMajor?: number } = {}) {
  const outcome = applyCommand(emptyData(), {
    type: 'create-goal',
    input: {
      name: 'PlayStation 5',
      targetMinor: INR(overrides.targetMajor ?? 50_000),
      currency: 'INR',
      startingMinor: overrides.startingMajor ? INR(overrides.startingMajor) : 0,
    },
  })
  if (!outcome.ok) throw new Error(outcome.error.message)
  return { data: outcome.data, goalId: outcome.createdGoalId! }
}

function balanceOf(data: AppData, goalId: string): number {
  return computeBalance(data.transactions.filter((tx) => tx.goalId === goalId)).savedMinor
}

describe('create-goal', () => {
  it('creates a goal with no transactions when there is no starting amount', () => {
    const { data, goalId } = seed()
    expect(data.goals).toHaveLength(1)
    expect(data.transactions).toHaveLength(0)
    expect(balanceOf(data, goalId)).toBe(0)
  })

  it('records a starting amount as a real transaction, not a stored balance', () => {
    const { data, goalId } = seed({ startingMajor: 18_500 })
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].type).toBe('add')
    expect(balanceOf(data, goalId)).toBe(INR(18_500))
  })

  it('reports milestones cleared by the starting amount', () => {
    const outcome = applyCommand(emptyData(), {
      type: 'create-goal',
      input: {
        name: 'PS5',
        targetMinor: INR(50_000),
        currency: 'INR',
        startingMinor: INR(18_500),
      },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.celebrations.milestones.map((m) => m.id)).toContain('percent:25')
  })

  it('rejects an empty name, a zero target, and a past target date', () => {
    const base = emptyData()
    expect(
      applyCommand(base, {
        type: 'create-goal',
        input: { name: '   ', targetMinor: INR(100), currency: 'INR' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-name' } })

    expect(
      applyCommand(base, {
        type: 'create-goal',
        input: { name: 'X', targetMinor: 0, currency: 'INR' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-target' } })

    expect(
      applyCommand(base, {
        type: 'create-goal',
        input: {
          name: 'X',
          targetMinor: INR(100),
          currency: 'INR',
          targetDate: '2020-01-01',
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-date' } })
  })

  it('rejects a starting amount larger than the target', () => {
    expect(
      applyCommand(emptyData(), {
        type: 'create-goal',
        input: {
          name: 'X',
          targetMinor: INR(1_000),
          currency: 'INR',
          startingMinor: INR(5_000),
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-amount' } })
  })
})

describe('spending guards', () => {
  it('refuses to spend more than the goal holds', () => {
    const { data, goalId } = seed({ startingMajor: 3_200 })
    const outcome = applyCommand(data, {
      type: 'add-transaction',
      input: { goalId, type: 'spend', amountMinor: INR(5_000) },
    })
    expect(outcome).toMatchObject({ ok: false, error: { code: 'insufficient-funds' } })
    if (outcome.ok) return
    // The message must state what's actually available.
    expect(outcome.error.message).toContain('3,200')
    expect(outcome.error.availableMinor).toBe(INR(3_200))
  })

  it('allows spending exactly the balance, leaving zero', () => {
    const { data, goalId } = seed({ startingMajor: 3_200 })
    const next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'spend', amountMinor: INR(3_200) },
    })
    expect(balanceOf(next, goalId)).toBe(0)
  })

  it('never lets a balance go negative through any sequence of commands', () => {
    let data = seed({ startingMajor: 1_000 }).data
    const goalId = data.goals[0].id

    for (const amount of [500, 400, 300, 200, 100]) {
      const outcome = applyCommand(data, {
        type: 'add-transaction',
        input: { goalId, type: 'spend', amountMinor: INR(amount) },
      })
      if (outcome.ok) data = outcome.data
      expect(balanceOf(data, goalId)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('editing and deleting transactions', () => {
  it('recalculates the balance after an edit', () => {
    const { data, goalId } = seed({ startingMajor: 10_000 })
    const txId = data.transactions[0].id

    const next = ok(data, {
      type: 'update-transaction',
      transactionId: txId,
      input: { amountMinor: INR(4_000) },
    })
    expect(balanceOf(next, goalId)).toBe(INR(4_000))
  })

  it('refuses an edit that would drive the balance below zero', () => {
    let data = seed({ startingMajor: 10_000 }).data
    const goalId = data.goals[0].id
    data = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'spend', amountMinor: INR(8_000) },
    })

    // Reducing the original contribution to ₹1,000 would leave −₹7,000.
    const outcome = applyCommand(data, {
      type: 'update-transaction',
      transactionId: data.transactions[0].id,
      input: { amountMinor: INR(1_000) },
    })
    expect(outcome).toMatchObject({ ok: false, error: { code: 'insufficient-funds' } })
    expect(balanceOf(data, goalId)).toBe(INR(2_000))
  })

  it('refuses a delete that would leave the goal owing money', () => {
    let data = seed({ startingMajor: 10_000 }).data
    const goalId = data.goals[0].id
    data = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'spend', amountMinor: INR(8_000) },
    })

    const outcome = applyCommand(data, {
      type: 'delete-transaction',
      transactionId: data.transactions[0].id,
    })
    expect(outcome).toMatchObject({ ok: false, error: { code: 'insufficient-funds' } })
  })

  it('deletes a goal along with its transactions, leaving no orphans', () => {
    const { data, goalId } = seed({ startingMajor: 5_000 })
    const next = ok(data, { type: 'delete-goal', goalId })
    expect(next.goals).toHaveLength(0)
    expect(next.transactions).toHaveLength(0)
  })
})

describe('completion reconciliation', () => {
  it('marks a goal complete once it is fully funded', () => {
    const { data, goalId } = seed({ targetMajor: 1_000 })
    const next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(1_000) },
    })
    expect(next.goals[0].completedAt).toBeTruthy()
  })

  it('clears completion when the balance drops back below the target', () => {
    const { data, goalId } = seed({ targetMajor: 1_000 })
    let next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(1_000) },
    })
    expect(next.goals[0].completedAt).toBeTruthy()

    next = ok(next, {
      type: 'add-transaction',
      input: { goalId, type: 'spend', amountMinor: INR(400) },
    })
    expect(next.goals[0].completedAt).toBeUndefined()
  })

  it('lets a milestone celebrate again after the balance falls below it', () => {
    const { data, goalId } = seed({ targetMajor: 1_000 })
    let next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(500) },
    })
    next = ok(next, {
      type: 'celebrate-milestones',
      goalId,
      milestoneIds: ['percent:50'],
    })
    expect(next.goals[0].celebratedMilestoneIds).toContain('percent:50')

    // Spending back below 50% drops the record…
    next = ok(next, {
      type: 'add-transaction',
      input: { goalId, type: 'spend', amountMinor: INR(300) },
    })
    expect(next.goals[0].celebratedMilestoneIds).not.toContain('percent:50')

    // …so re-reaching it celebrates again.
    const outcome = applyCommand(next, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(300) },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.celebrations.milestones.map((m) => m.id)).toContain('percent:50')
  })

  it('recalculates completion and milestones when the target is edited', () => {
    const { data, goalId } = seed({ targetMajor: 50_000, startingMajor: 10_000 })

    // Lowering the target below the balance completes the goal.
    let next = ok(data, {
      type: 'update-goal',
      goalId,
      input: { targetMinor: INR(8_000) },
    })
    expect(next.goals[0].completedAt).toBeTruthy()

    // Raising it again re-opens it.
    next = ok(next, { type: 'update-goal', goalId, input: { targetMinor: INR(90_000) } })
    expect(next.goals[0].completedAt).toBeUndefined()
  })

  it('drops celebrated ids for milestones that no longer exist', () => {
    const { data, goalId } = seed({ targetMajor: 50_000, startingMajor: 25_000 })
    let next = ok(data, {
      type: 'celebrate-milestones',
      goalId,
      milestoneIds: ['amount:10000', 'percent:50'],
    })
    expect(next.goals[0].celebratedMilestoneIds.length).toBeGreaterThan(0)

    // A much larger target invalidates the small amount milestone.
    next = ok(next, { type: 'update-goal', goalId, input: { targetMinor: INR(5_000_000) } })
    expect(next.goals[0].celebratedMilestoneIds).not.toContain('amount:10000')
  })
})

describe('goal views', () => {
  it('clamps an over-funded goal to 100% while keeping the true balance', () => {
    const { data, goalId } = seed({ targetMajor: 1_000 })
    const next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(1_500) },
    })
    const view = buildGoalView(
      next.goals[0],
      next.transactions.filter((tx) => tx.goalId === goalId),
    )
    expect(view.percent).toBe(100)
    expect(view.ratio).toBe(1)
    expect(view.rawSavedMinor).toBe(INR(1_500))
    expect(view.remainingMinor).toBe(0)
  })

  it('never rounds an unfinished goal up to 100%', () => {
    const { data, goalId } = seed({ targetMajor: 10_000 })
    const next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(9_999) },
    })
    const view = buildGoalView(
      next.goals[0],
      next.transactions.filter((tx) => tx.goalId === goalId),
    )
    expect(view.percent).toBe(99)
    expect(view.isComplete).toBe(false)
  })

  it('shows at least 1% for any non-zero progress on a large goal', () => {
    const { data, goalId } = seed({ targetMajor: 1_000_000 })
    const next = ok(data, {
      type: 'add-transaction',
      input: { goalId, type: 'add', amountMinor: INR(100) },
    })
    const view = buildGoalView(
      next.goals[0],
      next.transactions.filter((tx) => tx.goalId === goalId),
    )
    expect(view.percent).toBe(1)
  })
})
