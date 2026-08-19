import { useEffect } from 'react'
import { AppStoreProvider, useAppStore } from './store/AppStore'
import { RouterProvider, routeKey, useRouter } from './router/router'
import { ToastProvider } from './components/ui/Toast'
import { CelebrationProvider } from './components/Celebration'
import { AppShell } from './components/AppShell'
import { Dashboard } from './views/Dashboard'
import { GoalDetail } from './views/GoalDetail'
import { NewGoal } from './views/NewGoal'
import { Analytics } from './views/Analytics'
import { Achievements } from './views/Achievements'
import { Settings } from './views/Settings'
import { Onboarding } from './views/Onboarding'
import { NotFound } from './views/NotFound'
import { primeAudio, setSoundEnabled } from './services/sound'
import './styles/tokens.css'
import './styles/base.css'
import './App.css'

export function App() {
  return (
    <AppStoreProvider>
      <ToastProvider>
        <CelebrationProvider>
          <RouterProvider>
            <Preferences />
            <Root />
          </RouterProvider>
        </CelebrationProvider>
      </ToastProvider>
    </AppStoreProvider>
  )
}

/**
 * Pushes settings out to the places CSS and the audio engine can see them.
 *
 * Theme and motion live as attributes on `<html>` because the token layer
 * keys off them; sound is a module-level flag because cues fire from
 * non-React code paths too.
 */
function Preferences() {
  const { settings } = useAppStore()

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    const root = document.documentElement
    if (settings.motion === 'system') root.removeAttribute('data-motion')
    else root.dataset.motion = settings.motion
  }, [settings.motion])

  useEffect(() => {
    setSoundEnabled(settings.sound)
  }, [settings.sound])

  // Browsers only allow audio to start from a user gesture. Priming on the
  // first interaction means the first *meaningful* cue — a milestone — can
  // actually play, instead of being swallowed.
  useEffect(() => {
    if (!settings.sound) return
    function onFirstGesture() {
      primeAudio()
    }
    window.addEventListener('pointerdown', onFirstGesture, { once: true })
    window.addEventListener('keydown', onFirstGesture, { once: true })
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture)
      window.removeEventListener('keydown', onFirstGesture)
    }
  }, [settings.sound])

  // Paints the browser UI (address bar, notch area) to match the theme.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!(meta instanceof HTMLMetaElement)) return
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg')
      .trim()
    if (background) meta.content = background
  }, [settings.theme])

  return null
}

function Root() {
  const { route } = useRouter()
  const { settings } = useAppStore()

  // Onboarding takes over the whole viewport — no shell, no navigation — so
  // the first run is a single uninterrupted decision.
  if (!settings.onboardedAt) return <Onboarding />

  return (
    <AppShell>
      {/*
        Keying on the route restarts the enter animation for each screen and
        guarantees per-page state (filters, form drafts) can't leak across a
        navigation.
      */}
      <div className="page" key={routeKey(route)}>
        <CurrentView />
      </div>
    </AppShell>
  )
}

function CurrentView() {
  const { route } = useRouter()

  switch (route.name) {
    case 'dashboard':
      return <Dashboard />
    case 'goal':
      return <GoalDetail goalId={route.goalId} />
    case 'new-goal':
      return <NewGoal />
    case 'analytics':
      return <Analytics />
    case 'achievements':
      return <Achievements />
    case 'settings':
      return <Settings />
    case 'not-found':
      return <NotFound path={route.path} />
  }
}
