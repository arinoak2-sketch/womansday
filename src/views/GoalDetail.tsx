import { useMemo, useState } from 'react'
import { useAppStore, useGoalView } from '../store/AppStore'
import { useRouter } from '../router/router'
import { useCommands } from '../hooks/useCommands'
import { computePace, paceBadge, paceHeadline } from '../domain/pace'
import { milestoneStates } from '../domain/milestones'
import { formatMoney } from '../lib/money'
import { formatDate, formatLongDate, humanizeDays, parseInstant } from '../lib/date'
import { PageHeader } from '../components/AppShell'
import { ProgressRing } from '../components/ui/Progress'
import { CountUp } from '../components/ui/CountUp'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge, EmptyState, Section } from '../components/ui/Misc'
import { ConfirmDialog } from '../components/ui/Dialog'
import { ProductImage } from '../components/ProductImage'
import { AmountSheet } from '../components/AmountSheet'
import { EditGoalDialog } from '../components/EditGoalDialog'
import { TransactionList } from '../components/TransactionList'
import { NotFound } from './NotFound'
import './GoalDetail.css'

export function GoalDetail({ goalId }: { goalId: string }) {
  const { data } = useAppStore()
  const { execute } = useCommands()
  const { navigate, back } = useRouter()
  const view = useGoalView(goalId)

  const [sheet, setSheet] = useState<'add' | 'spend' | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState<'delete' | 'archive' | 'unarchive' | null>(null)

  const transactions = useMemo(
    () => data.transactions.filter((tx) => tx.goalId === goalId),
    [data.transactions, goalId],
  )

  const goalsById = useMemo(
    () => new Map(data.goals.map((goal) => [goal.id, goal])),
    [data.goals],
  )

  // A deleted goal leaves a stale URL behind — a real screen beats a blank one.
  if (!view) return <NotFound path={`/goal/${goalId}`} />

  const { goal } = view
  const milestones = milestoneStates(goal, view.rawSavedMinor)
  const achievedCount = milestones.filter((m) => m.achieved).length

  const pace = computePace({
    remainingMinor: view.remainingMinor,
    targetDate: goal.targetDate,
    currency: goal.currency,
    transactions,
    createdAt: goal.createdAt,
    isComplete: view.isComplete,
  })

  const latestSnapshot = goal.product?.snapshots.at(-1)

  function confirmAction() {
    if (confirming === 'delete') {
      execute(
        { type: 'delete-goal', goalId: goal.id },
        { successMessage: `${goal.name} deleted`, sound: 'success' },
      )
      navigate({ name: 'dashboard' }, { replace: true })
    } else if (confirming === 'archive') {
      execute(
        { type: 'set-goal-archived', goalId: goal.id, archived: true },
        { successMessage: `${goal.name} archived`, sound: 'success' },
      )
    } else if (confirming === 'unarchive') {
      execute(
        { type: 'set-goal-archived', goalId: goal.id, archived: false },
        { successMessage: `${goal.name} restored`, sound: 'success' },
      )
    }
    setConfirming(null)
  }

  return (
    <div className="goal-detail" data-accent={goal.accent}>
      <PageHeader
        title={goal.name}
        eyebrow={view.isComplete ? 'Achieved' : 'Savings goal'}
        onBack={back}
        actions={
          <>
            <Button variant="ghost" icon="edit" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {view.isArchived ? (
              <Button variant="ghost" icon="archive" onClick={() => setConfirming('unarchive')}>
                Restore
              </Button>
            ) : (
              view.isComplete && (
                <Button variant="ghost" icon="archive" onClick={() => setConfirming('archive')}>
                  Archive
                </Button>
              )
            )}
          </>
        }
      />

      {/* ── Hero ───────────────────────────────────────────────────── */}

      <section className="gd-hero panel">
        <div className="gd-hero__ring">
          <ProgressRing
            ratio={view.ratio}
            label={`${goal.name} progress`}
            size={188}
            thickness={12}
            complete={view.isComplete}
          >
            <span className="gd-hero__percent numeric">{view.percent}%</span>
            <span className="gd-hero__percent-caption">complete</span>
          </ProgressRing>
        </div>

        <div className="gd-hero__body">
          <div className="gd-hero__tags">
            {view.isComplete && (
              <Badge tone="goal" icon="trophy">
                Achieved
              </Badge>
            )}
            {view.isArchived && <Badge icon="archive">Archived</Badge>}
            {!view.isComplete && goal.priority !== 'medium' && (
              <Badge tone={goal.priority === 'high' ? 'goal' : 'neutral'} icon="flag">
                {goal.priority === 'high' ? 'High priority' : 'Low priority'}
              </Badge>
            )}
          </div>

          <p className="gd-hero__amount numeric">
            <CountUp
              value={view.rawSavedMinor}
              format={(value) => formatMoney(Math.round(value), goal.currency)}
            />
            <span className="gd-hero__target">of {formatMoney(goal.targetMinor, goal.currency)}</span>
          </p>

          <p className="gd-hero__remaining">
            {view.isComplete
              ? `Fully funded${goal.completedAt ? ` on ${formatDate(parseInstant(goal.completedAt))}` : ''}.`
              : `${formatMoney(view.remainingMinor, goal.currency)} left to save.`}
          </p>

          <div className="gd-hero__actions">
            <Button variant="primary" size="lg" icon="plus" onClick={() => setSheet('add')}>
              Add money
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon="minus"
              onClick={() => setSheet('spend')}
              disabled={view.rawSavedMinor === 0}
            >
              Spend
            </Button>
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────── */}

      <ul className="gd-stats">
        <StatTile
          label="This week"
          value={formatMoney(view.savedThisWeekMinor, goal.currency, { signed: view.savedThisWeekMinor !== 0 })}
        />
        <StatTile
          label="This month"
          value={formatMoney(view.savedThisMonthMinor, goal.currency, { signed: view.savedThisMonthMinor !== 0 })}
        />
        <StatTile label="Milestones" value={`${achievedCount} of ${milestones.length}`} />
        <StatTile label="Started" value={formatDate(parseInstant(goal.createdAt), { omitYear: true })} />
      </ul>

      {/* ── Pace ───────────────────────────────────────────────────── */}

      {pace.hasTargetDate && !view.isComplete && (
        <section className={['gd-pace', pace.isOverdue && 'gd-pace--overdue'].filter(Boolean).join(' ')}>
          <div className="gd-pace__head">
            <div>
              <p className="overline">Target date</p>
              <p className="gd-pace__date">
                {pace.targetDate ? formatLongDate(pace.targetDate) : '—'}
              </p>
            </div>
            <Badge tone={paceTone(pace.verdict)} icon={pace.isOverdue ? 'alert' : 'clock'}>
              {paceBadge(pace)}
              {/* The badge is abbreviated for space; the full sentence is
                  still announced. */}
              <span className="sr-only">. {paceHeadline(pace)}</span>
            </Badge>
          </div>

          {pace.isOverdue ? (
            <p className="gd-pace__body">
              This date passed {pace.timeRemainingLabel} ago and there's still{' '}
              <strong>{formatMoney(view.remainingMinor, goal.currency)}</strong> to go. Nothing is
              broken — pick a new date, or keep going at your own pace.
            </p>
          ) : (
            <>
              <p className="gd-pace__body">
                <strong>{humanizeDays(pace.daysRemaining)}</strong> left to save{' '}
                <strong>{formatMoney(view.remainingMinor, goal.currency)}</strong>.
              </p>
              <ul className="gd-pace__rates">
                <li>
                  <span className="subtle">Per week</span>
                  <strong className="numeric">{formatMoney(pace.perWeekMinor, goal.currency)}</strong>
                </li>
                <li>
                  <span className="subtle">Per month</span>
                  <strong className="numeric">{formatMoney(pace.perMonthMinor, goal.currency)}</strong>
                </li>
                {pace.observedPerWeekMinor !== null && (
                  <li>
                    <span className="subtle">Your pace</span>
                    <strong className="numeric">
                      {formatMoney(pace.observedPerWeekMinor, goal.currency)}/wk
                    </strong>
                  </li>
                )}
              </ul>
            </>
          )}

          {pace.projectedDate && !pace.isOverdue && (
            <p className="gd-pace__projection">
              At your current pace you'd get there around{' '}
              <strong>{formatDate(pace.projectedDate)}</strong>.
            </p>
          )}
        </section>
      )}

      {/* ── Milestones ─────────────────────────────────────────────── */}

      <Section
        title="Milestones"
        description="Worked out from your target. Each one is celebrated as you reach it."
        id="milestones"
      >
        <ol className="gd-milestones">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className={['gd-milestone', milestone.achieved && 'gd-milestone--achieved']
                .filter(Boolean)
                .join(' ')}
            >
              <span className="gd-milestone__marker" aria-hidden="true">
                {milestone.achieved ? <Icon name="check" size={13} /> : null}
              </span>
              <div className="gd-milestone__text">
                <p className="gd-milestone__label">{milestone.label}</p>
                <p className="gd-milestone__amount numeric-ui">
                  {formatMoney(milestone.thresholdMinor, goal.currency)}
                </p>
              </div>
              {/* Status as text, not just a filled dot. */}
              <span className="gd-milestone__status">
                {milestone.achieved
                  ? 'Reached'
                  : `${formatMoney(milestone.thresholdMinor - view.rawSavedMinor, goal.currency)} away`}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Product ────────────────────────────────────────────────── */}

      {goal.product && (
        <Section title="Product" id="product">
          <div className="gd-product panel">
            <ProductImage
              product={goal.product}
              name={goal.product.title}
              accent={goal.accent}
              size={80}
              className="product-image--hero"
            />
            <div className="gd-product__body">
              <p className="gd-product__title">{goal.product.title}</p>
              {goal.product.brand && <p className="subtle">{goal.product.brand}</p>}
              {goal.product.description && (
                <p className="gd-product__description">{goal.product.description}</p>
              )}

              {latestSnapshot ? (
                <p className="gd-product__snapshot">
                  <Icon name="clock" size={14} />
                  Priced at {formatMoney(latestSnapshot.amountMinor, latestSnapshot.currency)} when
                  checked on {formatDate(parseInstant(latestSnapshot.retrievedAt))}. This isn't a
                  live price.
                </p>
              ) : (
                <p className="gd-product__snapshot">
                  <Icon name="info" size={14} />
                  No price was recorded for this product.
                </p>
              )}

              {goal.product.url && (
                <a
                  className="gd-product__link"
                  href={goal.product.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View product page
                  <Icon name="arrow-up-right" size={15} />
                </a>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Notes ──────────────────────────────────────────────────── */}

      {goal.note && (
        <Section title="Notes" id="notes">
          <blockquote className="gd-note">{goal.note}</blockquote>
        </Section>
      )}

      {/* ── History ────────────────────────────────────────────────── */}

      <Section title="History" description={`${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`} id="history">
        <div className="panel gd-history">
          <TransactionList
            transactions={transactions}
            goalsById={goalsById}
            filterable
            emptyState={
              <EmptyState
                icon="wallet"
                size="sm"
                title="Nothing recorded yet"
                message="Add your first contribution and it'll show up here with the date and note."
                action={
                  <Button variant="primary" icon="plus" onClick={() => setSheet('add')}>
                    Add money
                  </Button>
                }
              />
            }
          />
        </div>
      </Section>

      {/* ── Danger zone ────────────────────────────────────────────── */}

      <section className="gd-danger">
        <div>
          <p className="gd-danger__title">Delete this goal</p>
          <p className="gd-danger__body">
            {transactions.length === 0
              ? `Removes ${goal.name}. This can't be undone.`
              : transactions.length === 1
                ? `Removes ${goal.name} and its single entry. This can't be undone.`
                : `Removes ${goal.name} and all ${transactions.length} of its entries. This can't be undone.`}
          </p>
        </div>
        <Button variant="danger" icon="trash" onClick={() => setConfirming('delete')}>
          Delete goal
        </Button>
      </section>

      {/* ── Overlays ───────────────────────────────────────────────── */}

      {sheet && (
        <AmountSheet open onClose={() => setSheet(null)} view={view} mode={sheet} />
      )}

      <EditGoalDialog open={editing} view={view} onClose={() => setEditing(false)} />

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === 'delete'
            ? `Delete ${goal.name}?`
            : confirming === 'archive'
              ? `Archive ${goal.name}?`
              : `Restore ${goal.name}?`
        }
        message={
          confirming === 'delete' ? (
            <>
              This permanently removes the goal
              {transactions.length > 0 ? (
                <>
                  {' '}and its{' '}
                  <strong>
                    {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
                  </strong>
                  , including the {formatMoney(view.rawSavedMinor, goal.currency)} recorded against
                  it
                </>
              ) : null}
              . This can't be undone.
            </>
          ) : confirming === 'archive' ? (
            <>
              {goal.name} moves out of your achieved list. You can still open it any time, and
              nothing is deleted.
            </>
          ) : (
            <>{goal.name} returns to your achieved list.</>
          )
        }
        confirmLabel={
          confirming === 'delete' ? 'Delete goal' : confirming === 'archive' ? 'Archive' : 'Restore'
        }
        destructive={confirming === 'delete'}
        onConfirm={confirmAction}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <li className="gd-stat">
      <p className="overline">{label}</p>
      <p className="gd-stat__value numeric">{value}</p>
    </li>
  )
}

function paceTone(verdict: ReturnType<typeof computePace>['verdict']) {
  if (verdict === 'overdue') return 'negative' as const
  if (verdict === 'ahead' || verdict === 'on-track') return 'positive' as const
  return 'neutral' as const
}
