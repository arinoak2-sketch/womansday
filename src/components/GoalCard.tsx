import { useState } from 'react'
import type { GoalView } from '../domain/selectors'
import { Link } from '../router/router'
import { ProgressBar } from './ui/Progress'
import { Badge } from './ui/Misc'
import { Icon } from './ui/Icon'
import { ProductImage } from './ProductImage'
import { formatMoney } from '../lib/money'
import { milestoneStates } from '../domain/milestones'
import { computePace } from '../domain/pace'
import { useAppStore } from '../store/AppStore'
import { AmountSheet } from './AmountSheet'
import './GoalCard.css'

interface GoalCardProps {
  view: GoalView
  /** Position in the list, used to stagger the entrance animation. */
  index?: number
}

/**
 * A goal at a glance.
 *
 * The card is a plain container with a "stretched link" on the title: the
 * whole surface is clickable, but the DOM keeps a single real anchor and the
 * Add button stays a genuine sibling button. Nesting a button inside an anchor
 * would be invalid and would break both keyboard and screen-reader behaviour.
 */
export function GoalCard({ view, index = 0 }: GoalCardProps) {
  const { data } = useAppStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { goal } = view

  // Only the quarter marks are shown on a card-width bar. The full ladder is
  // on the goal's own page; ten ticks here would read as a dashed border.
  const quarterMarks = milestoneStates(goal, view.rawSavedMinor).filter((milestone) =>
    ['percent:25', 'percent:50', 'percent:75'].includes(milestone.id),
  )

  const pace = computePace({
    remainingMinor: view.remainingMinor,
    targetDate: goal.targetDate,
    currency: goal.currency,
    transactions: data.transactions.filter((tx) => tx.goalId === goal.id),
    createdAt: goal.createdAt,
    isComplete: view.isComplete,
  })

  return (
    <>
      <article
        className={['goal-card', view.isComplete && 'goal-card--complete', 'animate-rise']
          .filter(Boolean)
          .join(' ')}
        data-accent={goal.accent}
        style={{ '--stagger-index': index } as React.CSSProperties}
      >
        <div className="goal-card__top">
          <ProductImage
            product={goal.product}
            name={goal.name}
            accent={goal.accent}
            size={56}
            className="goal-card__thumb"
          />

          <div className="goal-card__identity">
            <h3 className="goal-card__name">
              <Link to={{ name: 'goal', goalId: goal.id }} className="goal-card__link">
                {goal.name}
              </Link>
            </h3>
            <div className="goal-card__tags">
              {view.isComplete ? (
                <Badge tone="goal" icon="trophy">
                  Achieved
                </Badge>
              ) : goal.priority === 'high' ? (
                <Badge tone="goal" icon="flag">
                  High priority
                </Badge>
              ) : null}
              {!view.isComplete && pace.hasTargetDate && (
                <Badge tone={pace.isOverdue ? 'negative' : 'neutral'} icon="calendar">
                  {pace.isOverdue ? `${pace.timeRemainingLabel} over` : pace.timeRemainingLabel}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="goal-card__figures">
          <p className="goal-card__saved numeric">{formatMoney(view.rawSavedMinor, goal.currency)}</p>
          <p className="goal-card__target">
            of {formatMoney(goal.targetMinor, goal.currency)}
          </p>
        </div>

        <ProgressBar
          ratio={view.ratio}
          label={`${goal.name} progress`}
          milestones={quarterMarks}
          targetMinor={goal.targetMinor}
          complete={view.isComplete}
        />

        <div className="goal-card__foot">
          <p className="goal-card__status">
            {/* The percentage is repeated as text so progress is never carried
                by the bar's colour and length alone. */}
            <span className="goal-card__percent numeric-ui">{view.percent}%</span>
            <span className="goal-card__remaining">
              {view.isComplete
                ? 'Fully funded'
                : `${formatMoney(view.remainingMinor, goal.currency)} to go`}
            </span>
          </p>

          {!view.isComplete && (
            <button
              type="button"
              className="goal-card__add"
              onClick={() => setSheetOpen(true)}
              aria-label={`Add money to ${goal.name}`}
            >
              <Icon name="plus" size={18} />
            </button>
          )}
        </div>
      </article>

      <AmountSheet open={sheetOpen} onClose={() => setSheetOpen(false)} view={view} mode="add" />
    </>
  )
}
