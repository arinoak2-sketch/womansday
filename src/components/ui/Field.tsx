import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { currencySymbol } from '../../lib/money'
import type { CurrencyCode } from '../../domain/types'
import { Icon } from './Icon'
import './Field.css'

interface FieldShellProps {
  label: string
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/**
 * Wraps a control with its label, hint and error, and wires the ARIA between
 * them. Every control in the app goes through this so no field can ship
 * without an accessible name or with an error the screen reader won't announce.
 */
export function Field({ label, hideLabel, hint, error, optional, children }: FieldShellProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={['field', error && 'field--invalid'].filter(Boolean).join(' ')}>
      <label className={hideLabel ? 'sr-only' : 'field__label'} htmlFor={inputId}>
        {label}
        {optional && <span className="field__optional"> — optional</span>}
      </label>

      {children({ inputId, describedBy, invalid: Boolean(error) })}

      {hint && !error && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}

      {error && (
        // `role="status"` rather than `alert`: validation messages appear as
        // the user types, and assertive interruptions on every keystroke are
        // hostile to screen-reader users.
        <p className="field__error" id={errorId} role="status">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={['input', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
})

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={['input', 'input--textarea', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <div className="select">
      <select
        ref={ref}
        className={['input', 'select__control', className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="select__chevron" />
    </div>
  )
})

/* ------------------------------------------------------------------ */
/* Amount input                                                        */
/* ------------------------------------------------------------------ */

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  currency: CurrencyCode
  invalid?: boolean
  /** Oversized treatment for the primary amount in a sheet. */
  size?: 'md' | 'lg'
}

/**
 * The money field.
 *
 * `inputMode="decimal"` gets the numeric keypad on phones while still allowing
 * grouping characters to be pasted — `type="number"` would silently reject
 * "2,000" and strips leading zeros in ways that fight the parser.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { currency, invalid, size = 'md', className, ...rest },
  ref,
) {
  return (
    <div className={['amount-input', `amount-input--${size}`].join(' ')}>
      <span className="amount-input__symbol" aria-hidden="true">
        {currencySymbol(currency)}
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        className={['input', 'amount-input__control', className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  )
})
