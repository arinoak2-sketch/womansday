import { useMemo, useState } from 'react'
import { useAppStore } from '../store/AppStore'
import { Link, useRouter } from '../router/router'
import { buildActivityFeed, buildUpcomingMilestones } from '../domain/selectors'
import { formatMoney } from '../lib/money'
import { GoalCard } from '../components/GoalCard'
import { TransactionList } from '../components/TransactionList'
import { AmountSheet } from '../components/AmountSheet'
import { ProgressRing } from '../components/ui/Progress'
import { CountUp } from '../components/ui/CountUp'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge, EmptyState, Section } from '../components/ui/Misc'
import './Dashboard.css'

export function Dashboard() {
  const { data, portfolio } = useAppStore()
  const { navigate } = useRouter()
  const [quickAddGoalId, setQuickAddGoalId] = useState<string | null>(null)

  const goalsById = useMemo(
    () => new Map(data.goals.map((goal) => [goal.id, goal])),
    [data.goals],
  )

  const upcoming = useMemo(
    () => buildUpcomingMilestones(portfolio.activeGoals, 3),
    [portfolio.activeGoals],
  )

  const recentActivity = useMemo(() => buildActivityFeed(data, { limit: 8 }), [data])
  const recentTransactions = useMemo(
    () => recentActivity.flatMap((group) => group.entries.map((entry) => entry.transaction)),
    [recentActivity],
  )

  const spotlight = portfolio.topPriorityGoal
  const quickAddView =
    portfolio.activeGoals.find((view) => view.goal.id === quickAddGoalId) ?? null

  const hasAnyGoal = data.goals.length > 0

  if (!hasAnyGoal) {
    return <FirstRun />
  }

  return (
    <div className="dash">
      <header className="dash__hero panel">
        <div className="dash__hero-figures">
          <p className="overline">Total saved</p>
          <p className="dash__total numeric">
            <CountUp
              value={portfolio.totalSavedMinor}
              format={(value) => formatMoney(Math.round(value), portfolio.currency)}
            />
          </p>

          <div className="dash__hero-meta">
            <span>
              <strong className="numeric-ui">{portfolio.activeGoals.length}</strong>{' '}
              {portfolio.activeGoals.length === 1 ? 'active goal' : 'active goals'}
            </span>
            {portfolio.totalRemainingMinor > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="numeric-ui">
                    {formatMoney(portfolio.totalRemainingMinor, portfolio.currency)}
                  </strong>{' '}
                  still to go
                </span>
              </>
            )}
          </div>

          <div className="dash__hero-actions">
            <Button variant="primary" icon="plus" onClick={() => navigate({ name: 'new-goal' })}>
              Create new goal
            </Button>
            {portfolio.activeGoals.length > 0 && (
              <Button
                variant="secondary"
                icon="wallet"
                onClick={() => setQuickAddGoalId(portfolio.activeGoals[0].goal.id)}
              >
                Quick add
              </Button>
            )}
          </div>
        </div>

        <div className="dash__hero-ring">
          <ProgressRing
            ratio={portfolio.overallRatio}
            label="Overall progress across active goals"
            size={168}
            thickness={11}
            complete={portfolio.overallRatio >= 1 && portfolio.activeGoals.length > 0}
          >
            <span className="dash__ring-percent numeric">{portfolio.overallPercent}%</span>
            <span className="dash__ring-caption">overall</span>
          </ProgressRing>
        </div>
      </header>

      {spotlight && spotlight.goal.priority === 'high' && (
        <Link to={{ name: 'goal', goalId: spotlight.goal.id }} className="dash__spotlight" data-accent={spotlight.goal.accent}>
          <div className="dash__spotlight-text">
            <Badge tone="goal" icon="flag">
              Your highest priority
            </Badge>
            <p className="dash__spotlight-name">{spotlight.goal.name}</p>
            <p className="dash__spotlight-detail">
              {formatMoney(spotlight.rawSavedMinor, spotlight.goal.currency)} saved ·{' '}
              {formatMoney(spotlight.remainingMinor, spotlight.goal.currency)} to go
            </p>
          </div>
          <Icon name="chevron-right" size={20} className="dash__spotlight-chevron" />
        </Link>
      )}

      {upcoming.length > 0 && (
        <Section
          title="Coming up"
          description="The milestones you're closest to reaching."
          id="upcoming"
        >
          <ul className="dash__milestones">
            {upcoming.map(({ goal, milestone, remainingMinor, progress }) => (
              <li key={`${goal.id}-${milestone.id}`} className="dash__milestone" data-accent={goal.accent}>
                <div className="dash__milestone-head">
                  <span className="dash__milestone-goal">{goal.name}</span>
                  <span className="dash__milestone-amount numeric-ui">
                    {formatMoney(remainingMinor, goal.currency)} away
                  </span>
                </div>
                <p className="dash__milestone-label">{milestone.label}</p>
                <div className="dash__milestone-track" aria-hidden="true">
                  <span
                    className="dash__milestone-fill"
                    style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Your goals"
        description={
          portfolio.activeGoals.length > 0
            ? 'Everything you’re working toward right now.'
            : undefined
        }
        action={
          <Button variant="ghost" size="sm" icon="plus" onClick={() => navigate({ name: 'new-goal' })}>
            New goal
          </Button>
        }
        id="goals"
      >
        {portfolio.activeGoals.length === 0 ? (
          <EmptyState
            icon="target"
            title="Nothing active right now"
            message={
              portfolio.completedGoals.length > 0
                ? "You've finished everything you were saving for. Time to pick the next one."
                : 'Give yourself something exciting to work toward.'
            }
            action={
              <Button variant="primary" icon="plus" onClick={() => navigate({ name: 'new-goal' })}>
                Create a goal
              </Button>
            }
          />
        ) : (
          <div className="dash__grid">
            {portfolio.activeGoals.map((view, index) => (
              <GoalCard key={view.goal.id} view={view} index={index} />
            ))}
          </div>
        )}
      </Section>

      {portfolio.completedGoals.length > 0 && (
        <Section
          title="Recently achieved"
          action={
            <Link to={{ name: 'achievements' }} className="dash__link">
              View all
              <Icon name="chevron-right" size={15} />
            </Link>
          }
          id="achieved"
        >
          <div className="dash__grid">
            {portfolio.completedGoals.slice(0, 3).map((view, index) => (
              <GoalCard key={view.goal.id} view={view} index={index} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Recent activity" id="activity">
        <div className="panel dash__activity">
          <TransactionList
            transactions={recentTransactions}
            goalsById={goalsById}
            showGoalName
            emptyState={
              <EmptyState
                icon="clock"
                size="sm"
                title="Your savings story starts here"
                message="Add your first contribution and it'll appear in this timeline."
              />
            }
          />
        </div>
      </Section>

      {quickAddView && (
        <AmountSheet
          open
          onClose={() => setQuickAddGoalId(null)}
          view={quickAddView}
          mode="add"
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* First run                                                           */
/* ------------------------------------------------------------------ */

/**
 * The very first screen, before any goal exists. Deliberately not the normal
 * dashboard with zeros in it — a wall of ₹0 tiles is a discouraging way to
 * meet a savings app.
 */
function FirstRun() {
  const { navigate } = useRouter()

  return (
    <div className="first-run">
      <span className="first-run__mark" aria-hidden="true">
        <Icon name="sparkle" size={28} />
      </span>

      <h1 className="first-run__title">What are you saving for?</h1>

      <p className="first-run__body">
        Name something you actually want. Aurum turns it into a target, tracks every rupee you put
        aside, and marks the moments worth celebrating along the way.
      </p>

      <div className="first-run__actions">
        <Button variant="primary" size="lg" icon="plus" onClick={() => navigate({ name: 'new-goal' })}>
          Create your first goal
        </Button>
      </div>

      <ul className="first-run__hints">
        <li>
          <Icon name="target" size={17} />
          <span>Set a target, or look up what something actually costs</span>
        </li>
        <li>
          <Icon name="sparkle" size={17} />
          <span>Milestones are worked out for you and celebrated when you hit them</span>
        </li>
        <li>
          <Icon name="wallet" size={17} />
          <span>Everything stays on this device — no account, no sign-up</span>
        </li>
      </ul>
    </div>
  )
}
