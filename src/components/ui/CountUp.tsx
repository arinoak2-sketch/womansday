import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

interface CountUpProps {
  /** Target value. Whenever it changes the display animates toward it. */
  value: number
  /** Turns the animating number into its final string, e.g. money formatting. */
  format: (value: number) => string
  durationMs?: number
  className?: string
}

/**
 * Counts a number up (or down) to its new value.
 *
 * The whole point is that money should be seen to *move* when it changes. Two
 * details make it feel right rather than gimmicky: the first render never
 * animates (a dashboard shouldn't spin up from zero on every page load), and
 * an interrupted animation retargets from wherever it currently is instead of
 * snapping back to the start.
 */
export function CountUp({ value, format, durationMs = 620, className }: CountUpProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [display, setDisplay] = useState(value)

  const frame = useRef<number>(0)
  const from = useRef(value)
  const startedAt = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    // First paint, or reduced motion: show the real number immediately.
    if (!mounted.current || reducedMotion) {
      mounted.current = true
      from.current = value
      setDisplay(value)
      return
    }

    if (from.current === value) return

    startedAt.current = performance.now()
    const start = from.current
    const delta = value - start

    function step(now: number) {
      const elapsed = now - startedAt.current
      const t = Math.min(1, elapsed / durationMs)
      // easeOutExpo: most of the distance is covered early, so the number
      // settles rather than crawling to a stop.
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t)
      const current = start + delta * eased
      setDisplay(current)
      from.current = current

      if (t < 1) frame.current = requestAnimationFrame(step)
      else from.current = value
    }

    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [value, durationMs, reducedMotion])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <span className={className}>
      {/*
        Screen readers get the settled value only. Announcing every
        intermediate frame of a counting animation would be unusable, so the
        animated glyphs are hidden and the real figure is exposed once.
      */}
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
