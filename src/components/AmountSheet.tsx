import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { GoalView } from '../domain/selectors'
import type { TransactionCategory, TransactionType } from '../domain/types'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { AmountInput, Field, TextInput } from './ui/Field'
import { Icon } from './ui/Icon'
import { formatMoney, minorUnitScale, parseAmount } from '../lib/money'
import { generateMilestones } from '../domain/milestones'
import { toDisplayPercent } from '../domain/selectors'
import { useCommands } from '../hooks/useCommands'
import './AmountSheet.css'

interface AmountSheetProps {
  open: boolean
  onClose: () => void
  view: GoalView
  mode: TransactionType
}

const ADD_CATEGORIES: { value: TransactionCategory; label: string }[] = [
  { value: 'allowance', label: 'Allowance' },
  { value: 'gift', label: 'Gift' },
  { value: 'work', label: 'Work' },
  { value: 'pocket', label: 'Pocket money' },
  { value: 'savings', label: 'Savings' },
  { value: 'other', label: 'Other' },
]

const SPEND_CATEGORIES: { value: TransactionCategory; label: string }[] = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'refund', label: 'Returned it' },
  { value: 'other', label: 'Other' },
]

/**
 * Add or spend money against one goal.
 *
 * The whole flow is a single sheet — the brief is explicit that adding money
 * must not become a wizard. Everything that would normally be a second step
 * (quick amounts, category, note) is inline and optional, and the only
 * required input is the amount itself.
 */
export function AmountSheet({ open, onClose, view, mode }: AmountSheetProps) {
  const { execute } = useCommands()
  const { goal } = view
  const isAdd = mode === 'add'

  const [raw, setRaw] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<TransactionCategory | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const formId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // Guards against a double submit landing two transactions — a real risk on
  // a slow phone where the sheet's close transition is still running.
  const submitting = useRef(false)

  // Reset whenever the sheet opens so a previous entry never leaks into the
  // next one, and focus the amount because it's the only required field.
  useEffect(() => {
    if (!open) return
    setRaw('')
    setNote('')
    setCategory(undefined)
    setError(null)
    submitting.current = false
    const timer = setTimeout(() => inputRef.current?.focus(), 220)
    return () => clearTimeout(timer)
  }, [open, mode])

  const availableMinor = view.rawSavedMinor
  const parsed = useMemo(
    () => (raw.trim() === '' ? null : parseAmount(raw, goal.currency)),
    [raw, goal.currency],
  )
  const amountMinor = parsed?.ok ? parsed.minor : null

  /* ---- Live preview ------------------------------------------------ */

  const preview = useMemo(() => {
    if (amountMinor === null) return null
    const nextSaved = isAdd
      ? view.rawSavedMinor + amountMinor
      : Math.max(0, view.rawSavedMinor - amountMinor)
    const ratio = nextSaved / Math.max(1, goal.targetMinor)

    // Which milestones this contribution would unlock, so the user can see the
    // reward before committing rather than only after.
    const unlocks = isAdd
      ? generateMilestones(goal).filter(
          (m) => m.thresholdMinor > view.rawSavedMinor && m.thresholdMinor <= nextSaved,
        )
      : []

    return {
      nextSaved,
      percent: toDisplayPercent(Math.min(1, ratio)),
      remaining: Math.max(0, goal.targetMinor - nextSaved),
      unlocks,
    }
  }, [amountMinor, isAdd, view.rawSavedMinor, goal])

  const quickAmounts = useMemo(
    () => buildQuickAmounts(isAdd ? Math.max(0, goal.targetMinor - view.rawSavedMinor) : availableMinor, goal.currency),
    [isAdd, goal.targetMinor, goal.currency, view.rawSavedMinor, availableMinor],
  )

  const finishAmount = isAdd ? Math.max(0, goal.targetMinor - view.rawSavedMinor) : availableMinor

  /* ---- Submit ------------------------------------------------------ */

  function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (submitting.current) return

    const result = parseAmount(raw, goal.currency)
    if (!result.ok) {
      setError(result.message)
      inputRef.current?.focus()
      return
    }

    // Checked here as well as in the command so the message lands against the
    // field rather than only as a toast.
    if (!isAdd && result.minor > availableMinor) {
      setError(
        availableMinor === 0
          ? "There's nothing saved toward this goal yet."
          : `You only have ${formatMoney(availableMinor, goal.currency)} saved toward this goal.`,
      )
      inputRef.current?.focus()
      return
    }

    submitting.current = true
    const outcome = execute(
      {
        type: 'add-transaction',
        input: {
          goalId: goal.id,
          type: mode,
          amountMinor: result.minor,
          note: note.trim() || undefined,
          category,
        },
      },
      {
        sound: isAdd ? 'add' : 'spend',
        successMessage: isAdd
          ? `${formatMoney(result.minor, goal.currency)} added to ${goal.name}`
          : `${formatMoney(result.minor, goal.currency)} taken from ${goal.name}`,
        toastOnError: false,
      },
    )

    if (!outcome.ok) {
      submitting.current = false
      setError(outcome.error?.message ?? 'That could not be saved.')
      return
    }

    onClose()
  }

  const categories = isAdd ? ADD_CATEGORIES : SPEND_CATEGORIES

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isAdd ? 'Add money' : 'Spend from savings'}
      description={
        isAdd ? (
          <>Toward <strong>{goal.name}</strong></>
        ) : (
          <>
            {formatMoney(availableMinor, goal.currency)} available in{' '}
            <strong>{goal.name}</strong>
          </>
        )
      }
      footer={
        // `form` links this to the <form> in the dialog body, so there is exactly
        // one submit button and Enter-to-submit works natively.
        <Button
          type="submit"
          form={formId}
          variant="primary"
          size="lg"
          block
          disabled={raw.trim() === ''}
        >
          <Icon name={isAdd ? 'plus' : 'minus'} size={18} />
          {isAdd ? 'Add to savings' : 'Record spend'}
        </Button>
      }
    >
      <form
        id={formId}
        className="amount-sheet"
        onSubmit={submit}
        data-accent={goal.accent}
        noValidate
      >
        <Field
          label={isAdd ? 'How much did you save?' : 'How much are you spending?'}
          error={error}
          hint={
            !error && !isAdd && availableMinor > 0
              ? `You can spend up to ${formatMoney(availableMinor, goal.currency)}.`
              : undefined
          }
        >
          {({ inputId, describedBy, invalid }) => (
            <AmountInput
              id={inputId}
              ref={inputRef}
              aria-describedby={describedBy}
              invalid={invalid}
              size="lg"
              currency={goal.currency}
              value={raw}
              placeholder="0"
              onChange={(event) => {
                setRaw(event.target.value)
                if (error) setError(null)
              }}
            />
          )}
        </Field>

        {(quickAmounts.length > 0 || finishAmount > 0) && (
          <div className="amount-sheet__quick">
            <span className="sr-only" id="quick-amounts-label">
              Quick amounts
            </span>
            <div className="amount-sheet__chips" role="group" aria-labelledby="quick-amounts-label">
              {quickAmounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setRaw(String(value / minorUnitScale(goal.currency)))
                    setError(null)
                  }}
                >
                  {formatMoney(value, goal.currency)}
                </button>
              ))}
              {finishAmount > 0 && (
                <button
                  type="button"
                  className="chip chip--emphasis"
                  onClick={() => {
                    setRaw(String(finishAmount / minorUnitScale(goal.currency)))
                    setError(null)
                  }}
                >
                  {isAdd ? 'Finish it' : 'All of it'}
                  <span className="chip__sub">{formatMoney(finishAmount, goal.currency)}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {preview && (
          // aria-live so the projected balance is announced as the amount is
          // typed, rather than being visual-only feedback.
          <div className="amount-sheet__preview" aria-live="polite">
            <div className="amount-sheet__preview-row">
              <span className="muted">New balance</span>
              <strong className="numeric">
                {formatMoney(preview.nextSaved, goal.currency)}
              </strong>
            </div>
            <div className="amount-sheet__preview-row">
              <span className="muted">{preview.remaining > 0 ? 'Still to go' : 'Complete'}</span>
              <strong className="numeric">
                {preview.remaining > 0
                  ? formatMoney(preview.remaining, goal.currency)
                  : `${preview.percent}%`}
              </strong>
            </div>
            {preview.unlocks.length > 0 && (
              <p className="amount-sheet__unlock">
                <Icon name="sparkle" size={15} />
                This unlocks {preview.unlocks[preview.unlocks.length - 1].label.toLowerCase()}
              </p>
            )}
          </div>
        )}

        <fieldset className="amount-sheet__categories">
          <legend className="field__label">
            {isAdd ? 'Where did it come from?' : "What was it for?"}
            <span className="field__optional"> — optional</span>
          </legend>
          <div className="amount-sheet__chips">
            {categories.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={category === option.value}
                className={['chip', category === option.value && 'chip--selected']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() =>
                  setCategory((current) => (current === option.value ? undefined : option.value))
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Add a note" optional>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              value={note}
              maxLength={280}
              placeholder={isAdd ? 'Birthday money from Nani' : 'Bought the controller'}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

      </form>
    </Dialog>
  )
}

/**
 * Quick-amount chips, scaled to what's left.
 *
 * Uses a fixed ladder of round numbers rather than fractions of the remainder,
 * because "₹1,000" is a decision someone can make instantly and "₹1,575" is
 * not. Nothing above a third of the remainder is offered — a chip that nearly
 * finishes the goal isn't a quick amount, it's the "Finish it" button.
 */
function buildQuickAmounts(headroomMinor: number, currency: Parameters<typeof formatMoney>[1]): number[] {
  if (headroomMinor <= 0) return []
  const scale = minorUnitScale(currency)
  const ladder = [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000]
  const ceiling = headroomMinor / 3

  const usable = ladder.map((major) => major * scale).filter((minor) => minor <= ceiling)
  // The four largest that fit keep the chips relevant to the goal's scale.
  return usable.slice(-4)
}
