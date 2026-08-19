import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Milestone, SavingsGoal } from '../domain/types'
import { Confetti } from './Confetti'
import { Button } from './ui/Button'
import { CountUp } from './ui/CountUp'
import { Icon } from './ui/Icon'
import { formatMoney } from '../lib/money'
import { playSound } from '../services/sound'
import { vibrate } from '../services/haptics'
import { useSettings } from '../store/AppStore'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import './Celebration.css'

interface CelebrationItem {
  goal: SavingsGoal
  milestone: Milestone
  savedMinor: number
}

interface CelebrationContextValue {
  /** Queue milestones for celebration. Ignored when celebrations are off. */
  celebrate: (goal: SavingsGoal, milestones: Milestone[], savedMinor: number) => void
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null)

/** How long a celebration stays before dismissing itself. */
const AUTO_DISMISS_MS = 5200
const AUTO_DISMISS_COMPLETE_MS = 7000

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const reducedMotion = usePrefersReducedMotion()
  const [queue, setQueue] = useState<CelebrationItem[]>([])
  const [fireKey, setFireKey] = useState(0)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closeRef = useRef<HTMLButtonElement>(null)

  const current = queue[0] ?? null

  const celebrate = useCallback<CelebrationContextValue['celebrate']>(
    (goal, milestones, savedMinor) => {
      if (!settings.celebrations || milestones.length === 0) return
      // Several milestones can fall to one large contribution. Showing every
      // one in sequence would be tedious, so only the highest is celebrated —
      // it's the one that means the most anyway.
      const highest = milestones[milestones.length - 1]
      setQueue((current) => [...current, { goal, milestone: highest, savedMinor }])
    },
    [settings.celebrations],
  )

  const dismiss = useCallback(() => {
    setQueue((current) => current.slice(1))
  }, [])

  // Fire the effects when a celebration reaches the front of the queue.
  useEffect(() => {
    if (!current) return

    const isCompletion = current.milestone.kind === 'completion'
    setFireKey((key) => key + 1)
    playSound(isCompletion ? 'complete' : 'milestone')
    vibrate('celebrate')

    // Focus the dismiss button so keyboard users aren't stranded behind an
    // overlay they can't reach, and Escape has something to act on.
    closeRef.current?.focus()

    clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(
      dismiss,
      isCompletion ? AUTO_DISMISS_COMPLETE_MS : AUTO_DISMISS_MS,
    )

    return () => clearTimeout(dismissTimer.current)
  }, [current, dismiss])

  useEffect(() => {
    if (!current) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        dismiss()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current, dismiss])

  const value = useMemo<CelebrationContextValue>(() => ({ celebrate }), [celebrate])

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {current && (
        <CelebrationOverlay
          item={current}
          fireKey={fireKey}
          reducedMotion={reducedMotion}
          onDismiss={dismiss}
          closeRef={closeRef}
        />
      )}
    </CelebrationContext.Provider>
  )
}

function CelebrationOverlay({
  item,
  fireKey,
  reducedMotion,
  onDismiss,
  closeRef,
}: {
  item: CelebrationItem
  fireKey: number
  reducedMotion: boolean
  onDismiss: () => void
  closeRef: React.RefObject<HTMLButtonElement | null>
}) {
  const { goal, milestone, savedMinor } = item
  const isCompletion = milestone.kind === 'completion'

  return (
    <div
      className={['celebration', isCompletion && 'celebration--complete'].filter(Boolean).join(' ')}
      data-accent={goal.accent}
      // A dialog rather than an alert: it has focusable content and the user
      // dismisses it explicitly.
      role="dialog"
      aria-modal="true"
      aria-label={`${milestone.label}. ${goal.name}.`}
      onClick={onDismiss}
    >
      <Confetti fireKey={fireKey} intensity={isCompletion ? 'complete' : 'milestone'} />

      <div className="celebration__card" onClick={(event) => event.stopPropagation()}>
        <div className="celebration__badge" aria-hidden="true">
          <Icon name={isCompletion ? 'trophy' : 'sparkle'} size={isCompletion ? 34 : 30} />
          {!reducedMotion && <span className="celebration__badge-ring" />}
        </div>

        <p className="celebration__goal">{goal.name}</p>

        <h2 className="celebration__title">
          {isCompletion ? 'Goal achieved' : milestone.label}
        </h2>

        <p className="celebration__blurb">{milestone.blurb}</p>

        <p className="celebration__amount numeric">
          <CountUp
            value={savedMinor}
            format={(value) => formatMoney(Math.round(value), goal.currency)}
            durationMs={900}
          />
          <span className="celebration__of">of {formatMoney(goal.targetMinor, goal.currency)}</span>
        </p>

        <Button ref={closeRef} variant="primary" size="lg" block onClick={onDismiss}>
          {isCompletion ? 'Wonderful' : 'Keep going'}
        </Button>
      </div>
    </div>
  )
}

export function useCelebration(): CelebrationContextValue {
  const value = useContext(CelebrationContext)
  if (!value) throw new Error('useCelebration must be used inside <CelebrationProvider>')
  return value
}
