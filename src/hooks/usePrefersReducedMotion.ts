import { useEffect, useState } from 'react'

/**
 * Whether motion should be suppressed right now.
 *
 * Combines the OS-level `prefers-reduced-motion` query with the app's own
 * setting, which is written to `<html data-motion>`. JavaScript-driven motion
 * (count-ups, confetti, canvas work) has to check this explicitly — CSS
 * duration tokens can't reach it.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => computeReducedMotion())

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(computeReducedMotion())

    query.addEventListener('change', update)

    // The app setting changes the `data-motion` attribute rather than the
    // media query, so the attribute is observed too.
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    })

    return () => {
      query.removeEventListener('change', update)
      observer.disconnect()
    }
  }, [])

  return reduced
}

function computeReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  const preference = document.documentElement.dataset.motion
  if (preference === 'reduced') return true
  if (preference === 'full') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
