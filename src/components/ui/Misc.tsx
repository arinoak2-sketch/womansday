import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './Misc.css'

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
  icon?: IconName
  title: string
  /** One line of encouragement, not an instruction manual. */
  message: ReactNode
  action?: ReactNode
  /** Compact treatment for empty regions inside a populated page. */
  size?: 'md' | 'sm'
}

/**
 * No screen in this app is ever blank. An empty state names what's missing,
 * says something worth reading, and offers the one action that fills it.
 */
export function EmptyState({ icon, title, message, action, size = 'md' }: EmptyStateProps) {
  return (
    <div className={['empty', `empty--${size}`].join(' ')}>
      {icon && (
        <span className="empty__icon" aria-hidden="true">
          <Icon name={icon} size={size === 'sm' ? 20 : 26} />
        </span>
      )}
      <h3 className="empty__title">{title}</h3>
      <p className="empty__message">{message}</p>
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** Announced instead of the visible label when the label is an abbreviation. */
  srLabel?: string
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Names the group for screen readers, e.g. "Filter transactions". */
  label: string
  size?: 'sm' | 'md'
}

/**
 * Filter/segment switcher.
 *
 * Implemented as a radiogroup rather than a row of buttons, so arrow keys move
 * between options and the selected one is announced as such — which is what
 * assistive tech expects from a control that picks exactly one value.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: SegmentedProps<T>) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const directions: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    }
    const step = directions[event.key]
    if (!step) return
    event.preventDefault()
    const index = options.findIndex((option) => option.value === value)
    // Wraps at both ends, which is the expected behaviour for a radiogroup.
    const next = options[(index + step + options.length) % options.length]
    onChange(next.value)
  }

  return (
    <div
      className={['segmented', `segmented--${size}`].join(' ')}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // Only the selected option is in the tab order; arrow keys move
            // within the group once it has focus.
            tabIndex={selected ? 0 : -1}
            className={['segmented__option', selected && 'segmented__option--selected']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.srLabel ? <span className="sr-only">{option.srLabel}</span> : null}
            <span aria-hidden={option.srLabel ? true : undefined}>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

interface SkeletonProps {
  width?: string
  height?: string
  radius?: string
  className?: string
}

/** Placeholder block for content that is still loading. */
export function Skeleton({ width = '100%', height = '1rem', radius, className }: SkeletonProps) {
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'positive' | 'negative' | 'goal'
  icon?: IconName
}

export function Badge({ children, tone = 'neutral', icon }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Section heading                                                     */
/* ------------------------------------------------------------------ */

interface SectionProps {
  title: string
  /** Right-aligned control, e.g. a "View all" link or a filter. */
  action?: ReactNode
  description?: ReactNode
  children: ReactNode
  id?: string
}

export function Section({ title, action, description, children, id }: SectionProps) {
  const headingId = id ? `${id}-heading` : undefined
  return (
    <section className="section" aria-labelledby={headingId} id={id}>
      <div className="section__head">
        <div className="section__heading">
          <h2 className="section__title" id={headingId}>
            {title}
          </h2>
          {description && <p className="section__description">{description}</p>}
        </div>
        {action && <div className="section__action">{action}</div>}
      </div>
      {children}
    </section>
  )
}
