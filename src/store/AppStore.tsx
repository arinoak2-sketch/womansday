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
import type { AppData, Settings } from '../domain/types'
import { applyCommand, type Command, type CommandOutcome } from './commands'
import { buildPortfolio, type PortfolioSummary } from '../domain/selectors'
import { loadData, saveData, storageAvailable } from './persistence'

interface AppStoreValue {
  data: AppData
  portfolio: PortfolioSummary
  settings: Settings
  /** True when this browser refuses to persist — the UI warns about it once. */
  ephemeral: boolean
  /**
   * Run a command. Returns the outcome so callers can show a field error or
   * fire a celebration; state is only replaced when the command succeeds.
   */
  run: (command: Command) => CommandOutcome
  /** Replace the whole document (import / reset). */
  replace: (data: AppData) => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())

  // The reducer is pure but `run` needs to read the freshest document even when
  // several commands fire within one React batch (a quick double tap on "Add").
  // A ref alongside state gives synchronous reads without stale closures.
  const latest = useRef(data)
  latest.current = data

  const run = useCallback((command: Command): CommandOutcome => {
    const outcome = applyCommand(latest.current, command)
    if (outcome.ok) {
      latest.current = outcome.data
      setData(outcome.data)
    }
    return outcome
  }, [])

  const replace = useCallback((next: AppData) => {
    latest.current = next
    setData(next)
  }, [])

  useEffect(() => {
    saveData(data)
  }, [data])

  // Keep multiple tabs of the same browser in step. Without this, two open
  // tabs would each hold a divergent document and the last write would win.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== null && !event.key.includes('aurum')) return
      const next = loadData()
      latest.current = next
      setData(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // `portfolio` is rebuilt from scratch on every change rather than patched, so
  // no derived total can drift from the transactions it came from.
  const portfolio = useMemo(() => buildPortfolio(data), [data])

  const value = useMemo<AppStoreValue>(
    () => ({
      data,
      portfolio,
      settings: data.settings,
      ephemeral: !storageAvailable,
      run,
      replace,
    }),
    [data, portfolio, run, replace],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('useAppStore must be used inside <AppStoreProvider>')
  return value
}

export function useSettings(): Settings {
  return useAppStore().settings
}

export function usePortfolio(): PortfolioSummary {
  return useAppStore().portfolio
}

/** Look up a single goal's view model, or null when the id is unknown. */
export function useGoalView(goalId: string | undefined) {
  const { portfolio } = useAppStore()
  return useMemo(() => {
    if (!goalId) return null
    const all = [...portfolio.activeGoals, ...portfolio.completedGoals, ...portfolio.archivedGoals]
    return all.find((view) => view.goal.id === goalId) ?? null
  }, [portfolio, goalId])
}
