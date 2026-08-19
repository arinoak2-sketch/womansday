import { useEffect, useId, useState } from 'react'
import type { SavingsGoal, Transaction, TransactionCategory, TransactionType } from '../domain/types'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { AmountInput, Field, Select, TextInput } from './ui/Field'
import { Segmented } from './ui/Misc'
import { formatMoney, minorUnitScale, parseAmount } from '../lib/money'
import { useCommands } from '../hooks/useCommands'
import { categoryLabel } from './TransactionList'

interface EditTransactionDialogProps {
  open: boolean
  transaction: Transaction
  goal: SavingsGoal | undefined
  onClose: () => void
}

const CATEGORIES: TransactionCategory[] = [
  'allowance',
  'gift',
  'work',
  'pocket',
  'savings',
  'refund',
  'purchase',
  'emergency',
  'other',
]

/**
 * Edit an existing entry.
 *
 * Editing is where a savings ledger usually goes wrong: change an old
 * contribution and the balance, milestones and completion state all have to
 * follow. None of that is handled here — the command layer recalculates from
 * the transactions every time, and refuses an edit that would push the goal
 * below zero.
 */
export function EditTransactionDialog({
  open,
  transaction,
  goal,
  onClose,
}: EditTransactionDialogProps) {
  const { execute } = useCommands()
  const currency = goal?.currency ?? 'INR'

  const [type, setType] = useState<TransactionType>(transaction.type)
  const [amount, setAmount] = useState(() =>
    String(transaction.amountMinor / minorUnitScale(currency)),
  )
  const [at, setAt] = useState(() => toLocalInputValue(transaction.at))
  const [note, setNote] = useState(transaction.note ?? '')
  const [category, setCategory] = useState<TransactionCategory | ''>(transaction.category ?? '')
  const [error, setError] = useState<string | null>(null)
  const formId = useId()

  useEffect(() => {
    if (!open) return
    setType(transaction.type)
    setAmount(String(transaction.amountMinor / minorUnitScale(currency)))
    setAt(toLocalInputValue(transaction.at))
    setNote(transaction.note ?? '')
    setCategory(transaction.category ?? '')
    setError(null)
  }, [open, transaction, currency])

  function save(event?: React.FormEvent) {
    event?.preventDefault()

    const parsed = parseAmount(amount, currency)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }

    const instant = fromLocalInputValue(at)
    if (!instant) {
      setError("That date and time doesn't look right.")
      return
    }

    const result = execute(
      {
        type: 'update-transaction',
        transactionId: transaction.id,
        input: {
          amountMinor: parsed.minor,
          type,
          at: instant,
          note: note.trim() || null,
          category: category === '' ? null : category,
        },
      },
      { successMessage: 'Entry updated', sound: 'success', toastOnError: false },
    )

    if (!result.ok) {
      setError(result.error?.message ?? 'That change could not be saved.')
      return
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit entry"
      description={goal ? `In ${goal.name}` : undefined}
      footer={
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary">
            Save changes
          </Button>
        </div>
      }
    >
      <form id={formId} className="amount-sheet" onSubmit={save} noValidate>
        <Field label="Type">
          {() => (
            <Segmented
              label="Entry type"
              value={type}
              onChange={setType}
              options={[
                { value: 'add', label: 'Money in' },
                { value: 'spend', label: 'Money out' },
              ]}
            />
          )}
        </Field>

        <Field label="Amount" error={error}>
          {({ inputId, describedBy, invalid }) => (
            <AmountInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              currency={currency}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                if (error) setError(null)
              }}
            />
          )}
        </Field>

        <Field label="When" hint="Changing the date moves this entry in your history.">
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              type="datetime-local"
              value={at}
              onChange={(event) => setAt(event.target.value)}
            />
          )}
        </Field>

        <Field label="Category" optional>
          {({ inputId }) => (
            <Select
              id={inputId}
              value={category}
              onChange={(event) => setCategory(event.target.value as TransactionCategory | '')}
            >
              <option value="">No category</option>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Note" optional>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              value={note}
              maxLength={280}
              placeholder={`What was this ${formatMoney(transaction.amountMinor, currency)} for?`}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* datetime-local conversion                                           */
/* ------------------------------------------------------------------ */

/**
 * `datetime-local` speaks wall-clock time with no zone, so the ISO instant has
 * to be shifted into local time before it's shown and back out again on save.
 * Handing it a UTC string directly is the usual source of entries that jump by
 * several hours after an edit.
 */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  // `new Date('YYYY-MM-DDTHH:mm')` is parsed as local time, which is exactly
  // what the control means by it.
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
