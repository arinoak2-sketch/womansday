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
import { Icon, type IconName } from './Icon'
import './Toast.css'

export type ToastTone = 'neutral' | 'positive' | 'negative'

export interface ToastOptions {
  message: string
  tone?: ToastTone
  icon?: IconName
  /** Milliseconds on screen. Errors default to longer. */
  duration?: number
  /** A single inline action, e.g. Undo. */
  action?: { label: string; onPress: () => void }
}

interface Toast extends Required<Pick<ToastOptions, 'message' | 'tone'>> {
  id: number
  icon?: IconName
  duration: number
  action?: ToastOptions['action']
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 4200
const ERROR_DURATION = 6500
/** More than a few stacked toasts is noise; the oldest are dropped. */
const MAX_VISIBLE = 3

const TONE_ICONS: Record<ToastTone, IconName> = {
  neutral: 'info',
  positive: 'check',
  negative: 'alert',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const tone = options.tone ?? 'neutral'
      const id = nextId.current++
      const duration =
        options.duration ?? (tone === 'negative' ? ERROR_DURATION : DEFAULT_DURATION)

      const entry: Toast = {
        id,
        message: options.message,
        tone,
        icon: options.icon ?? TONE_ICONS[tone],
        duration,
        action: options.action,
      }

      setToasts((current) => [...current, entry].slice(-MAX_VISIBLE))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        One persistent live region. Creating it only when a toast appears would
        mean assistive tech misses the first announcement, because the region
        has to exist before its contents change.
      */}
      <div className="toast-layer" role="region" aria-label="Notifications">
        <ol className="toast-list">
          {toasts.map((entry) => (
            <li
              key={entry.id}
              className={`toast toast--${entry.tone}`}
              // Errors interrupt; confirmations wait their turn.
              role={entry.tone === 'negative' ? 'alert' : 'status'}
              aria-live={entry.tone === 'negative' ? 'assertive' : 'polite'}
            >
              {entry.icon && <Icon name={entry.icon} size={18} className="toast__icon" />}
              <span className="toast__message">{entry.message}</span>
              {entry.action && (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    entry.action?.onPress()
                    dismiss(entry.id)
                  }}
                >
                  {entry.action.label}
                </button>
              )}
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(entry.id)}
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}
