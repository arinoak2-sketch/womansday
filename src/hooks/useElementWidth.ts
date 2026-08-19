import { useEffect, useRef, useState } from 'react'

/**
 * Measured pixel width of an element.
 *
 * Charts need real pixels, not a scaled viewBox: `preserveAspectRatio="none"`
 * would stretch strokes and text along with the geometry. Measuring lets marks
 * keep their specified 2px lines and 8px dots at every container size.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // ResizeObserver catches container changes a window resize listener would
    // miss — a rail collapsing, a font loading, a details panel expanding.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const next = entry.contentRect.width
      if (next > 0) setWidth(next)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
