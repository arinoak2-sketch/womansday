import { useEffect, useId, useState } from 'react'
import type { AccentName, Priority } from '../domain/types'
import type { GoalView } from '../domain/selectors'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { AmountInput, Field, Select, TextArea, TextInput } from './ui/Field'
import { Icon } from './ui/Icon'
import { minorUnitScale, parseAmount, formatMoney } from '../lib/money'
import { useCommands } from '../hooks/useCommands'

const ACCENTS: { value: AccentName; label: string }[] = [
  { value: 'amber', label: 'Amber' },
  { value: 'jade', label: 'Jade' },
  { value: 'plum', label: 'Plum' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'clay', label: 'Clay' },
  { value: 'slate', label: 'Slate' },
]

interface EditGoalDialogProps {
  open: boolean
  view: GoalView
  onClose: () => void
}

export function EditGoalDialog({ open, view, onClose }: EditGoalDialogProps) {
  const { execute } = useCommands()
  const { goal } = view
  const scale = minorUnitScale(goal.currency)

  const [name, setName] = useState(goal.name)
  const [target, setTarget] = useState(String(goal.targetMinor / scale))
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '')
  const [priority, setPriority] = useState<Priority>(goal.priority)
  const [accent, setAccent] = useState<AccentName>(goal.accent)
  const [note, setNote] = useState(goal.note ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const formId = useId()

  useEffect(() => {
    if (!open) return
    setName(goal.name)
    setTarget(String(goal.targetMinor / scale))
    setTargetDate(goal.targetDate ?? '')
    setPriority(goal.priority)
    setAccent(goal.accent)
    setNote(goal.note ?? '')
    setErrors({})
  }, [open, goal, scale])

  const parsedTarget = parseAmount(target, goal.currency)
  // Lowering the target below what's already saved is legitimate — it just
  // completes the goal — so it's surfaced as information, not an error.
  const willComplete =
    parsedTarget.ok && !view.isComplete && view.rawSavedMinor >= parsedTarget.minor

  function save(event?: React.FormEvent) {
    event?.preventDefault()
    const nextErrors: Record<string, string> = {}

    if (name.trim() === '') nextErrors.name = 'Give your goal a name.'
    if (!parsedTarget.ok) nextErrors.target = parsedTarget.message

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    if (!parsedTarget.ok) return

    const result = execute(
      {
        type: 'update-goal',
        goalId: goal.id,
        input: {
          name,
          targetMinor: parsedTarget.minor,
          targetDate: targetDate === '' ? null : targetDate,
          priority,
          accent,
          note: note.trim() === '' ? null : note,
        },
      },
      { successMessage: 'Goal updated', sound: 'success', toastOnError: false },
    )

    if (!result.ok) {
      setErrors({ [result.error?.field ?? 'name']: result.error?.message ?? 'That could not be saved.' })
      return
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit goal"
      size="lg"
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
      <form id={formId} className="amount-sheet" onSubmit={save} data-accent={accent} noValidate>
        <Field label="Goal name" error={errors.name}>
          {({ inputId, describedBy, invalid }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value)
                setErrors((current) => ({ ...current, name: '' }))
              }}
            />
          )}
        </Field>

        <Field
          label="Target amount"
          error={errors.target}
          hint={
            willComplete
              ? `You've already saved ${formatMoney(view.rawSavedMinor, goal.currency)}, so this will mark the goal complete.`
              : 'Milestones are recalculated automatically when the target changes.'
          }
        >
          {({ inputId, describedBy, invalid }) => (
            <AmountInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              currency={goal.currency}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value)
                setErrors((current) => ({ ...current, target: '' }))
              }}
            />
          )}
        </Field>

        <Field
          label="Target date"
          optional
          error={errors.targetDate}
          hint="Leave empty to save at your own pace."
        >
          {({ inputId, describedBy, invalid }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              type="date"
              value={targetDate}
              onChange={(event) => {
                setTargetDate(event.target.value)
                setErrors((current) => ({ ...current, targetDate: '' }))
              }}
            />
          )}
        </Field>

        <Field label="Priority">
          {({ inputId }) => (
            <Select
              id={inputId}
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              <option value="high">High — surface this first</option>
              <option value="medium">Medium</option>
              <option value="low">Low — no rush</option>
            </Select>
          )}
        </Field>

        <Field label="Colour">
          {() => (
            <div className="goal-form__accents" role="radiogroup" aria-label="Goal colour">
              {ACCENTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={accent === option.value}
                  aria-label={option.label}
                  data-accent={option.value}
                  className={['accent-swatch', accent === option.value && 'accent-swatch--selected']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setAccent(option.value)}
                >
                  {accent === option.value && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Notes" optional>
          {({ inputId }) => (
            <TextArea
              id={inputId}
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  )
}
