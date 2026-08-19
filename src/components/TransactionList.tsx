import { useMemo, useState } from 'react'
import type { SavingsGoal, Transaction, TransactionType } from '../domain/types'
import { compareByDateDesc } from '../domain/selectors'
import { formatMoney } from '../lib/money'
import { formatTime, parseInstant, relativeDayLabel, startOfDay } from '../lib/date'
import { Icon } from './ui/Icon'
import { Segmented, type SegmentOption } from './ui/Misc'
import { EditTransactionDialog } from './EditTransactionDialog'
import { ConfirmDialog } from './ui/Dialog'
import { useCommands } from '../hooks/useCommands'
import './TransactionList.css'

export type TransactionFilter = 'all' | 'add' | 'spend' | 'week' | 'month'

const FILTERS: SegmentOption<TransactionFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'add', label: 'Added' },
  { value: 'spend', label: 'Spent' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
]

interface TransactionListProps {
  transactions: Transaction[]
  /** Resolves goal names and accents when the list spans several goals. */
  goalsById: Map<string, SavingsGoal>
  /** Show which goal each entry belongs to. Off on a single goal's page. */
  showGoalName?: boolean
  /** Render the filter row. */
  filterable?: boolean
  /** Shown when the list is empty after filtering. */
  emptyState: React.ReactNode
  /** Cap the number of rows; the rest stay hidden behind the caller's UI. */
  limit?: number
  editable?: boolean
}

export function TransactionList({
  transactions,
  goalsById,
  showGoalName = false,
  filterable = false,
  emptyState,
  limit,
  editable = true,
}: TransactionListProps) {
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const { execute } = useCommands()

  const visible = useMemo(() => {
    const now = new Date()
    const filtered = transactions.filter((tx) => matchesFilter(tx, filter, now))
    filtered.sort(compareByDateDesc)
    return limit ? filtered.slice(0, limit) : filtered
  }, [transactions, filter, limit])

  const groups = useMemo(() => groupByDay(visible), [visible])

  function confirmDelete() {
    if (!deleting) return
    const goal = goalsById.get(deleting.goalId)
    execute(
      { type: 'delete-transaction', transactionId: deleting.id },
      {
        successMessage: `${formatMoney(deleting.amountMinor, goal?.currency ?? 'INR')} entry removed`,
        sound: 'success',
      },
    )
    setDeleting(null)
  }

  return (
    <div className="tx">
      {filterable && (
        <div className="tx__filters">
          <Segmented
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            label="Filter transactions"
            size="sm"
          />
        </div>
      )}

      {groups.length === 0 ? (
        <div className="tx__empty">{emptyState}</div>
      ) : (
        <div className="tx__groups">
          {groups.map((group) => (
            <section key={group.key} className="tx__group">
              <h4 className="tx__day">{group.label}</h4>
              <ul className="tx__list">
                {group.entries.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    goal={goalsById.get(transaction.goalId)}
                    showGoalName={showGoalName}
                    editable={editable}
                    onEdit={() => setEditing(transaction)}
                    onDelete={() => setDeleting(transaction)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditTransactionDialog
          open
          transaction={editing}
          goal={goalsById.get(editing.goalId)}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this entry?"
        message={
          deleting ? (
            <>
              The {deleting.type === 'add' ? 'contribution' : 'spend'} of{' '}
              <strong>
                {formatMoney(deleting.amountMinor, goalsById.get(deleting.goalId)?.currency ?? 'INR')}
              </strong>{' '}
              will be removed and the goal's balance recalculated. This can't be undone.
            </>
          ) : null
        }
        confirmLabel="Delete entry"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function TransactionRow({
  transaction,
  goal,
  showGoalName,
  editable,
  onEdit,
  onDelete,
}: {
  transaction: Transaction
  goal: SavingsGoal | undefined
  showGoalName: boolean
  editable: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isAdd = transaction.type === 'add'
  const at = parseInstant(transaction.at)
  const currency = goal?.currency ?? 'INR'

  const description =
    transaction.note ?? (transaction.category ? categoryLabel(transaction.category) : null)

  return (
    <li className="tx__row" data-accent={goal?.accent ?? 'amber'}>
      <span
        className={['tx__icon', isAdd ? 'tx__icon--add' : 'tx__icon--spend'].join(' ')}
        aria-hidden="true"
      >
        <Icon name={isAdd ? 'plus' : 'minus'} size={16} />
      </span>

      <div className="tx__detail">
        <p className="tx__primary">
          {showGoalName && goal ? goal.name : (description ?? (isAdd ? 'Added to savings' : 'Spent from savings'))}
        </p>
        <p className="tx__meta">
          {showGoalName && description ? <span>{description}</span> : null}
          {showGoalName && description ? <span aria-hidden="true">·</span> : null}
          <time dateTime={transaction.at}>{formatTime(at)}</time>
        </p>
      </div>

      <p className={['tx__amount', 'numeric', isAdd ? 'tx__amount--add' : 'tx__amount--spend'].join(' ')}>
        {/*
          The +/− sign carries the direction on its own, so the meaning
          survives for anyone who can't distinguish the two colours.
        */}
        {formatMoney(isAdd ? transaction.amountMinor : -transaction.amountMinor, currency, {
          signed: true,
        })}
      </p>

      {editable && (
        <div className="tx__actions">
          <button
            type="button"
            className="tx__action"
            onClick={onEdit}
            aria-label={`Edit ${formatMoney(transaction.amountMinor, currency)} entry`}
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            type="button"
            className="tx__action tx__action--danger"
            onClick={onDelete}
            aria-label={`Delete ${formatMoney(transaction.amountMinor, currency)} entry`}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function matchesFilter(tx: Transaction, filter: TransactionFilter, now: Date): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'add':
    case 'spend':
      return tx.type === (filter as TransactionType)
    case 'week': {
      const start = new Date(now)
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      return parseInstant(tx.at).getTime() >= startOfDay(start).getTime()
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return parseInstant(tx.at).getTime() >= start.getTime()
    }
  }
}

interface DayGroup {
  key: string
  label: string
  entries: Transaction[]
}

function groupByDay(transactions: Transaction[]): DayGroup[] {
  const now = new Date()
  const groups: DayGroup[] = []
  let current: DayGroup | null = null

  for (const transaction of transactions) {
    const day = startOfDay(parseInstant(transaction.at))
    const key = day.toISOString()
    if (!current || current.key !== key) {
      current = { key, label: relativeDayLabel(day, now), entries: [] }
      groups.push(current)
    }
    current.entries.push(transaction)
  }
  return groups
}

const CATEGORY_LABELS: Record<string, string> = {
  allowance: 'Allowance',
  gift: 'Gift',
  work: 'Work',
  pocket: 'Pocket money',
  savings: 'Savings',
  refund: 'Returned',
  purchase: 'Purchase',
  emergency: 'Emergency',
  other: 'Other',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Other'
}
