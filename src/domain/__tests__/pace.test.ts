import { describe, expect, it } from 'vitest'
import { computePace } from '../pace'
import { fromMajor } from '../../lib/money'
import type { Transaction } from '../types'

const NOW = new Date(2026, 7, 16) // 16 Aug 2026, local time

function tx(daysAgo: number, amountMajor: number, type: Transaction['type'] = 'add'): Transaction {
  const at = new Date(NOW)
  at.setDate(at.getDate() - daysAgo)
  return {
    id: `t${daysAgo}_${amountMajor}`,
    goalId: 'g1',
    type,
    amountMinor: fromMajor(amountMajor, 'INR'),
    at: at.toISOString(),
  }
}

describe('computePace', () => {
  it('reports no target when no date is set', () => {
    const pace = computePace({
      remainingMinor: fromMajor(30_000, 'INR'),
      currency: 'INR',
      transactions: [],
      createdAt: NOW.toISOString(),
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('no-target')
    expect(pace.hasTargetDate).toBe(false)
    expect(pace.perWeekMinor).toBe(0)
  })

  it('computes a weekly pace that actually covers the remainder', () => {
    // ₹30,000 remaining over 140 days (20 weeks) → ₹1,500/week.
    const pace = computePace({
      remainingMinor: fromMajor(30_000, 'INR'),
      targetDate: '2027-01-03',
      currency: 'INR',
      transactions: [],
      createdAt: NOW.toISOString(),
      isComplete: false,
      now: NOW,
    })
    expect(pace.daysRemaining).toBe(140)
    expect(pace.perWeekMinor).toBe(fromMajor(1_500, 'INR'))

    // The headline promise: saving the recommended amount every week reaches
    // the target on time.
    const weeks = pace.daysRemaining / 7
    expect(pace.perWeekMinor * weeks).toBeGreaterThanOrEqual(pace.remainingMinor)
  })

  it('never divides by zero on the target date itself', () => {
    const pace = computePace({
      remainingMinor: fromMajor(5_000, 'INR'),
      targetDate: '2026-08-16',
      currency: 'INR',
      transactions: [],
      createdAt: NOW.toISOString(),
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('due-today')
    expect(pace.daysRemaining).toBe(0)
    expect(Number.isFinite(pace.perWeekMinor)).toBe(true)
    expect(pace.perWeekMinor).toBeGreaterThan(0)
  })

  it('handles a target date in the past without negative values', () => {
    const pace = computePace({
      remainingMinor: fromMajor(5_000, 'INR'),
      targetDate: '2026-01-01',
      currency: 'INR',
      transactions: [],
      createdAt: '2025-06-01T00:00:00.000Z',
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('overdue')
    expect(pace.isOverdue).toBe(true)
    expect(pace.daysRemaining).toBe(0)
    expect(pace.daysOverdue).toBeGreaterThan(0)
    expect(pace.perWeekMinor).toBeGreaterThanOrEqual(0)
    expect(pace.timeRemainingLabel).toBeTruthy()
  })

  it('reports completion ahead of any date logic', () => {
    const pace = computePace({
      remainingMinor: 0,
      targetDate: '2020-01-01',
      currency: 'INR',
      transactions: [tx(3, 1_000)],
      createdAt: '2025-06-01T00:00:00.000Z',
      isComplete: true,
      now: NOW,
    })
    expect(pace.verdict).toBe('complete')
    expect(pace.isOverdue).toBe(false)
  })

  it('withholds a verdict until there is enough history', () => {
    const pace = computePace({
      remainingMinor: fromMajor(30_000, 'INR'),
      targetDate: '2027-01-03',
      currency: 'INR',
      transactions: [tx(1, 500)],
      createdAt: tx(1, 500).at,
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('too-early')
    expect(pace.observedPerWeekMinor).toBeNull()
  })

  it('calls out being ahead of the required pace', () => {
    // ₹14,000 saved over 28 days = ₹500/day, far above what's required.
    const transactions = [tx(28, 7_000), tx(14, 7_000)]
    const pace = computePace({
      remainingMinor: fromMajor(30_000, 'INR'),
      targetDate: '2027-01-03',
      currency: 'INR',
      transactions,
      createdAt: transactions[0].at,
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('ahead')
    expect(pace.observedPerWeekMinor).toBeGreaterThan(0)
    expect(pace.projectedDate).not.toBeNull()
  })

  it('calls out falling behind', () => {
    const transactions = [tx(60, 300)]
    const pace = computePace({
      remainingMinor: fromMajor(30_000, 'INR'),
      targetDate: '2026-09-16',
      currency: 'INR',
      transactions,
      createdAt: transactions[0].at,
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('behind')
  })

  it('gives no projection when the net pace is zero or negative', () => {
    const transactions = [tx(30, 1_000), tx(10, 1_000, 'spend')]
    const pace = computePace({
      remainingMinor: fromMajor(30_000, 'INR'),
      currency: 'INR',
      transactions,
      createdAt: transactions[0].at,
      isComplete: false,
      now: NOW,
    })
    expect(pace.observedPerWeekMinor).toBeNull()
    expect(pace.projectedDate).toBeNull()
  })

  it('ignores a malformed target date rather than throwing', () => {
    const pace = computePace({
      remainingMinor: fromMajor(100, 'INR'),
      targetDate: '2026-02-31',
      currency: 'INR',
      transactions: [],
      createdAt: NOW.toISOString(),
      isComplete: false,
      now: NOW,
    })
    expect(pace.verdict).toBe('no-target')
  })
})
