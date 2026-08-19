import { describe, expect, it } from 'vitest'
import { generateMilestones, milestoneStates, nextMilestone, pendingCelebrations } from '../milestones'
import { fromMajor } from '../../lib/money'
import type { SavingsGoal } from '../types'

function goal(targetMajor: number, celebrated: string[] = []): SavingsGoal {
  return {
    id: 'g1',
    name: 'Test',
    targetMinor: fromMajor(targetMajor, 'INR'),
    currency: 'INR',
    accent: 'amber',
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    celebratedMilestoneIds: celebrated,
  }
}

describe('generateMilestones', () => {
  it('always ends with a completion milestone at exactly the target', () => {
    const milestones = generateMilestones(goal(50_000))
    const last = milestones[milestones.length - 1]
    expect(last.kind).toBe('completion')
    expect(last.thresholdMinor).toBe(fromMajor(50_000, 'INR'))
  })

  it('returns milestones sorted ascending with unique ids', () => {
    for (const target of [500, 2_000, 12_000, 50_000, 100_000, 1_000_000]) {
      const milestones = generateMilestones(goal(target))
      const thresholds = milestones.map((m) => m.thresholdMinor)
      expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b))
      expect(new Set(milestones.map((m) => m.id)).size).toBe(milestones.length)
    }
  })

  it('scales milestones to the goal size', () => {
    // A ₹2,000 goal celebrates ₹500 — reached here as the 25% mark, which is
    // better copy than "First ₹500 saved" for the identical number.
    const small = generateMilestones(goal(2_000))
    expect(small.some((m) => m.thresholdMinor === fromMajor(500, 'INR'))).toBe(true)
    // It also gets small early wins that a big goal would find trivial.
    expect(small.some((m) => m.kind === 'amount' && m.thresholdMinor < fromMajor(500, 'INR'))).toBe(
      true,
    )

    // A large goal skips trivial amounts entirely.
    const large = generateMilestones(goal(100_000)).filter((m) => m.kind === 'amount')
    expect(large.length).toBeGreaterThan(0)
    expect(large.every((m) => m.thresholdMinor >= fromMajor(5_000, 'INR'))).toBe(true)
  })

  it('does not emit an amount milestone that duplicates a percentage mark', () => {
    // On a ₹2,000 goal, ₹1,000 is exactly 50% — the percentage copy wins.
    const milestones = generateMilestones(goal(2_000))
    const atHalf = milestones.filter((m) => m.thresholdMinor === fromMajor(1_000, 'INR'))
    expect(atHalf).toHaveLength(1)
    expect(atHalf[0].kind).toBe('percent')
  })

  it('handles a very small goal without producing junk', () => {
    const milestones = generateMilestones(goal(100))
    expect(milestones.length).toBeGreaterThan(0)
    expect(milestones.every((m) => m.thresholdMinor > 0)).toBe(true)
    expect(milestones[milestones.length - 1].thresholdMinor).toBe(fromMajor(100, 'INR'))
  })

  it('returns nothing for a non-positive target', () => {
    expect(generateMilestones({ targetMinor: 0, currency: 'INR' })).toEqual([])
    expect(generateMilestones({ targetMinor: -5, currency: 'INR' })).toEqual([])
  })

  it('keeps the ladder short enough to render', () => {
    for (const target of [500, 2_000, 50_000, 1_000_000]) {
      expect(generateMilestones(goal(target)).length).toBeLessThanOrEqual(10)
    }
  })
})

describe('milestoneStates / nextMilestone', () => {
  it('marks milestones achieved at exactly their threshold', () => {
    const g = goal(50_000)
    const half = fromMajor(25_000, 'INR')
    const state = milestoneStates(g, half).find((m) => m.id === 'percent:50')
    expect(state?.achieved).toBe(true)
  })

  it('reports the next unmet milestone', () => {
    const g = goal(50_000)
    const next = nextMilestone(g, fromMajor(25_000, 'INR'))
    expect(next?.achieved).toBe(false)
    expect(next!.thresholdMinor).toBeGreaterThan(half(g.targetMinor))
  })

  it('returns null once the goal is fully funded', () => {
    expect(nextMilestone(goal(50_000), fromMajor(50_000, 'INR'))).toBeNull()
  })
})

describe('pendingCelebrations', () => {
  it('returns every newly cleared milestone in ascending order', () => {
    // One large contribution can clear several milestones at once.
    const pending = pendingCelebrations(goal(50_000), fromMajor(30_000, 'INR'))
    const ids = pending.map((m) => m.id)
    expect(ids).toContain('percent:10')
    expect(ids).toContain('percent:50')
    expect(pending).toEqual([...pending].sort((a, b) => a.thresholdMinor - b.thresholdMinor))
  })

  it('never repeats a milestone that was already celebrated', () => {
    const g = goal(50_000, ['percent:10', 'percent:25', 'percent:50'])
    const pending = pendingCelebrations(g, fromMajor(30_000, 'INR'))
    expect(pending.map((m) => m.id)).not.toContain('percent:50')
  })

  it('includes completion once the target is met', () => {
    const pending = pendingCelebrations(goal(50_000), fromMajor(50_000, 'INR'))
    expect(pending.map((m) => m.id)).toContain('completion')
  })
})

function half(value: number): number {
  return Math.floor(value / 2)
}
