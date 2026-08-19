import { useId } from 'react'
import type { MilestoneState } from '../../domain/types'
import './Progress.css'

/* ------------------------------------------------------------------ */
/* Ring                                                                */
/* ------------------------------------------------------------------ */

interface ProgressRingProps {
  /** 0–1. Values outside the range are clamped. */
  ratio: number
  /** Diameter in px. */
  size?: number
  thickness?: number
  /** Accessible description, e.g. "PlayStation 5 progress". */
  label: string
  /** Rendered inside the ring — usually the percentage and a caption. */
  children?: React.ReactNode
  /** Adds a soft glow once complete. */
  complete?: boolean
}

/**
 * The headline progress visual.
 *
 * Drawn as an SVG arc whose `stroke-dashoffset` transitions, so a contribution
 * makes the ring visibly sweep forward. The rotation is applied to the circle
 * rather than the whole SVG so the text inside stays upright.
 */
export function ProgressRing({
  ratio,
  size = 172,
  thickness = 10,
  label,
  children,
  complete = false,
}: ProgressRingProps) {
  const gradientId = useId()
  const clamped = clamp01(ratio)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped)
  const percent = Math.round(clamped * 100)

  return (
    <div
      className={['ring', complete && 'ring--complete'].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={`${percent}% complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--goal-fill, var(--accent-fill))" />
            <stop
              offset="100%"
              stopColor="color-mix(in oklab, var(--goal-fill, var(--accent-fill)) 72%, var(--accent-fill))"
            />
          </linearGradient>
        </defs>

        <circle
          className="ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
        />

        <circle
          className="ring__indicator"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          // Start the arc at 12 o'clock instead of 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      {children && <div className="ring__content">{children}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

interface ProgressBarProps {
  ratio: number
  label: string
  /**
   * Draws a tick per milestone. Pass a filtered list — a full ladder of ten
   * on a card-width bar reads as a dashed border rather than as markers.
   */
  milestones?: MilestoneState[]
  /** Denominator the milestone ticks are positioned against. */
  targetMinor?: number
  size?: 'sm' | 'md'
  complete?: boolean
}

export function ProgressBar({
  ratio,
  label,
  milestones,
  targetMinor,
  size = 'md',
  complete = false,
}: ProgressBarProps) {
  const clamped = clamp01(ratio)
  const percent = Math.round(clamped * 100)

  return (
    <div
      className={['bar', `bar--${size}`, complete && 'bar--complete'].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={`${percent}% complete`}
    >
      <div className="bar__track">
        <div className="bar__fill" style={{ transform: `scaleX(${clamped})` }} />

        {milestones && targetMinor
          ? milestones
              // The completion marker sits at 100%, where it would be clipped
              // by the track's own end cap.
              .filter((m) => m.kind !== 'completion' && m.thresholdMinor < targetMinor)
              .map((milestone) => (
                <span
                  key={milestone.id}
                  className={['bar__tick', milestone.achieved && 'bar__tick--achieved']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: `${(milestone.thresholdMinor / targetMinor) * 100}%` }}
                  aria-hidden="true"
                />
              ))
          : null}
      </div>
    </div>
  )
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
