/**
 * Milestone generation.
 *
 * Milestones are derived from a goal's target, never stored, so editing a
 * target immediately produces the right set. The only persisted piece is
 * `goal.celebratedMilestoneIds`, which stops a celebration firing twice.
 */

import type { CurrencyCode, Milestone, MilestoneState, SavingsGoal } from './types'
import { formatMoney, minorUnitScale } from '../lib/money'

/** Percentage marks, in ascending order. 100% is handled separately. */
const PERCENT_MARKS = [10, 25, 50, 75, 90] as const

/**
 * Round "first amount saved" marks, in major units. Which of these apply is
 * decided relative to the goal size, so a ₹2,000 goal celebrates ₹500 while a
 * ₹1,00,000 goal celebrates ₹25,000 instead of a trivial ₹100.
 */
const AMOUNT_LADDER = [
  100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
]

/** An amount mark below this share of the target is noise. */
const AMOUNT_MIN_SHARE = 0.04
/** Above this share it crowds the 90% / completion marks. */
const AMOUNT_MAX_SHARE = 0.85
/** Amount marks are dropped when they land this close to a percentage mark. */
const DEDUPE_SHARE = 0.02

const PERCENT_COPY: Record<number, { label: string; blurb: string }> = {
  10: { label: '10% complete', blurb: 'The first stretch is the hardest. You cleared it.' },
  25: { label: '25% complete', blurb: 'Quarter of the way there. Keep going.' },
  50: { label: '50% complete', blurb: 'Halfway there.' },
  75: { label: '75% complete', blurb: "You're getting seriously close." },
  90: { label: '90% complete', blurb: 'Almost within reach now.' },
}

/**
 * Percentage thresholds are floored, not rounded: a 10% mark on a ₹50,000 goal
 * must be reachable at exactly ₹5,000, and flooring guarantees the threshold is
 * never a fraction of a minor unit that the balance can't land on.
 */
function percentThreshold(targetMinor: number, percent: number): number {
  return Math.floor((targetMinor * percent) / 100)
}

/**
 * Build the full milestone ladder for a goal, ascending by threshold.
 */
export function generateMilestones(goal: Pick<SavingsGoal, 'targetMinor' | 'currency'>): Milestone[] {
  const { targetMinor, currency } = goal
  if (!Number.isFinite(targetMinor) || targetMinor <= 0) return []

  const milestones: Milestone[] = []

  for (const percent of PERCENT_MARKS) {
    const thresholdMinor = percentThreshold(targetMinor, percent)
    if (thresholdMinor <= 0) continue
    const copy = PERCENT_COPY[percent]
    milestones.push({
      id: `percent:${percent}`,
      kind: 'percent',
      thresholdMinor,
      label: copy.label,
      blurb: copy.blurb,
    })
  }

  for (const major of AMOUNT_LADDER) {
    const thresholdMinor = major * minorUnitScale(currency)
    const share = thresholdMinor / targetMinor
    if (share < AMOUNT_MIN_SHARE || share > AMOUNT_MAX_SHARE) continue

    // Skip when a percentage mark already sits essentially here — "50%
    // complete" is better copy than "First ₹1,000 saved" for the same number.
    const clashes = milestones.some(
      (m) => Math.abs(m.thresholdMinor - thresholdMinor) / targetMinor < DEDUPE_SHARE,
    )
    if (clashes) continue

    milestones.push({
      id: `amount:${major}`,
      kind: 'amount',
      thresholdMinor,
      label: `First ${formatMoney(thresholdMinor, currency)} saved`,
      blurb: 'Real money, set aside. That counts.',
    })
  }

  milestones.push({
    id: 'completion',
    kind: 'completion',
    thresholdMinor: targetMinor,
    label: 'Goal achieved',
    blurb: 'You set out to do this, and you did it.',
  })

  milestones.sort((a, b) => a.thresholdMinor - b.thresholdMinor || a.id.localeCompare(b.id))
  return milestones
}

/** Attach achieved/progress state for a given balance. */
export function milestoneStates(
  goal: Pick<SavingsGoal, 'targetMinor' | 'currency'>,
  savedMinor: number,
): MilestoneState[] {
  const milestones = generateMilestones(goal)
  let previousThreshold = 0
  return milestones.map((milestone) => {
    const span = milestone.thresholdMinor - previousThreshold
    const covered = savedMinor - previousThreshold
    const progress = span <= 0 ? 1 : clamp01(covered / span)
    previousThreshold = milestone.thresholdMinor
    return {
      ...milestone,
      achieved: savedMinor >= milestone.thresholdMinor,
      progress,
    }
  })
}

/** The next milestone the balance has not yet cleared, or null when done. */
export function nextMilestone(
  goal: Pick<SavingsGoal, 'targetMinor' | 'currency'>,
  savedMinor: number,
): MilestoneState | null {
  return milestoneStates(goal, savedMinor).find((m) => !m.achieved) ?? null
}

/**
 * Milestones reached by `savedMinor` that the user has not been shown yet.
 * Ascending, so a single large contribution celebrates in a sensible order.
 */
export function pendingCelebrations(goal: SavingsGoal, savedMinor: number): Milestone[] {
  const celebrated = new Set(goal.celebratedMilestoneIds)
  return generateMilestones(goal).filter(
    (m) => savedMinor >= m.thresholdMinor && !celebrated.has(m.id),
  )
}

/** How much more is needed to reach a milestone. Never negative. */
export function amountToMilestone(milestone: Milestone, savedMinor: number): number {
  return Math.max(0, milestone.thresholdMinor - savedMinor)
}

/** Short label for a milestone in tight spaces. */
export function milestoneShortLabel(milestone: Milestone, currency: CurrencyCode): string {
  if (milestone.kind === 'completion') return 'Complete'
  if (milestone.kind === 'percent') return milestone.id.replace('percent:', '') + '%'
  return formatMoney(milestone.thresholdMinor, currency)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
