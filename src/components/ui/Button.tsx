import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { playSound } from '../../services/sound'
import { vibrate } from '../../services/haptics'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon. Pairs with `children`, or stands alone with `aria-label`. */
  icon?: IconName
  iconAfter?: IconName
  /** Stretch to the container width — used for the primary action in sheets. */
  block?: boolean
  /** Square icon-only button. Requires `aria-label`. */
  iconOnly?: boolean
  loading?: boolean
  children?: ReactNode
}

/**
 * The one button in the app.
 *
 * Every press plays the `tap` cue and a short haptic, so feedback is uniform
 * without each caller remembering to wire it up. Both degrade to nothing when
 * unavailable or switched off in settings.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconAfter,
    block = false,
    iconOnly = false,
    loading = false,
    disabled,
    className,
    onClick,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 22 : 18

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault()
      return
    }
    playSound('tap')
    vibrate('tap')
    onClick?.(event)
  }

  return (
    <button
      ref={ref}
      type={type}
      className={['btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon-only', className]
        .filter(Boolean)
        .join(' ')}
      // A loading button stays focusable and keeps its accessible name, but is
      // inert — disabling it outright would move focus and lose the context.
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size={iconSize} />
      )}
      {children && <span className="btn__label">{children}</span>}
      {iconAfter && !loading && <Icon name={iconAfter} size={iconSize} />}
    </button>
  )
})
