import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

interface ConfettiProps {
  /** Bump this to fire a fresh burst. */
  fireKey: number
  /** A fuller burst for goal completion. */
  intensity?: 'milestone' | 'complete'
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  color: string
  /** Ribbons tumble; discs spin flat. Two shapes is enough variety. */
  shape: 'ribbon' | 'disc'
  life: number
  maxLife: number
}

/**
 * Canvas confetti.
 *
 * Restrained on purpose: a muted metallic palette, ribbons rather than
 * cartoon stars, and a short fall with real air drag. The brief for this app
 * is "premium", and premium celebration is brief and physical rather than
 * loud and long.
 *
 * Renders nothing at all under reduced motion — the celebration overlay still
 * appears, it simply doesn't throw particles.
 */
export function Confetti({ fireKey, intensity = 'milestone' }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const frameRef = useRef(0)

  useEffect(() => {
    if (reducedMotion || fireKey === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Match the backing store to the device pixel ratio, capped at 2 — beyond
    // that the extra fill cost buys nothing visible for particles this small.
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const palette = readPalette()
    const count = intensity === 'complete' ? 130 : 72
    const particles: Particle[] = []

    for (let i = 0; i < count; i += 1) {
      // Two side cannons angled inward read better than a single centre spray:
      // the middle of the screen stays clear for the milestone text.
      const fromLeft = i % 2 === 0
      const originX = fromLeft ? width * 0.08 : width * 0.92
      const originY = height * 0.62
      const angle = (fromLeft ? -1 : 1) * (Math.PI / 4 + Math.random() * 0.5)
      const speed = 9 + Math.random() * (intensity === 'complete' ? 9 : 6)
      const maxLife = 100 + Math.random() * 70

      particles.push({
        x: originX,
        y: originY,
        vx: Math.sin(angle) * speed,
        vy: -Math.abs(Math.cos(angle)) * speed - Math.random() * 5,
        size: 5 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.24,
        color: palette[i % palette.length],
        shape: Math.random() > 0.35 ? 'ribbon' : 'disc',
        life: 0,
        maxLife,
      })
    }

    const GRAVITY = 0.28
    const DRAG = 0.985

    function tick() {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      let alive = false

      for (const p of particles) {
        p.life += 1
        if (p.life > p.maxLife) continue
        alive = true

        p.vy += GRAVITY
        p.vx *= DRAG
        p.vy *= DRAG
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.spin

        // Fade over the last third of a particle's life.
        const fadeStart = p.maxLife * 0.66
        ctx.globalAlpha =
          p.life < fadeStart ? 1 : Math.max(0, 1 - (p.life - fadeStart) / (p.maxLife - fadeStart))

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color

        if (p.shape === 'ribbon') {
          // Scaling height by cos() fakes the ribbon turning edge-on.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.rotation)))
        } else {
          ctx.beginPath()
          ctx.ellipse(0, 0, p.size / 2, (p.size / 2) * Math.abs(Math.cos(p.rotation)), 0, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      ctx.globalAlpha = 1
      if (alive) frameRef.current = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, width, height)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [fireKey, intensity, reducedMotion])

  if (reducedMotion) return null

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
}

/**
 * Pull the confetti colours from the live theme tokens so a celebration in
 * dark mode uses the dark palette. Falls back to the light values if the
 * computed styles aren't readable for any reason.
 */
function readPalette(): string[] {
  const fallback = ['#c1912a', '#2f9068', '#a05585', '#5568b8', '#b76239', '#e6d3a3']
  try {
    const styles = getComputedStyle(document.documentElement)
    const tokens = [
      '--accent-amber-fill',
      '--accent-jade-fill',
      '--accent-plum-fill',
      '--accent-indigo-fill',
      '--accent-clay-fill',
      '--accent-fill',
    ]
    const colors = tokens.map((token) => styles.getPropertyValue(token).trim()).filter(Boolean)
    return colors.length > 0 ? colors : fallback
  } catch {
    return fallback
  }
}
