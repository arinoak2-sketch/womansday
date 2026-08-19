/**
 * A very small history router.
 *
 * The app has six screens and needs precise control over enter/exit
 * transitions, so a routing library would be more surface area than value.
 * Routes are parsed into a discriminated union, which means an unknown URL is a
 * *typed* state the app renders a real "not found" screen for.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'goal'; goalId: string }
  | { name: 'new-goal' }
  | { name: 'analytics' }
  | { name: 'achievements' }
  | { name: 'settings' }
  | { name: 'not-found'; path: string }

const BASE = normalizeBase(import.meta.env.BASE_URL ?? '/')

function normalizeBase(base: string): string {
  if (!base || base === '/') return ''
  return base.endsWith('/') ? base.slice(0, -1) : base
}

/** Turn a browser pathname into a route. */
export function parseRoute(pathname: string): Route {
  let path = pathname
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length)
  if (!path.startsWith('/')) path = `/${path}`
  const segments = path.split('/').filter(Boolean).map(decodeSegment)

  if (segments.length === 0) return { name: 'dashboard' }
  switch (segments[0]) {
    case 'goal':
      return segments[1] ? { name: 'goal', goalId: segments[1] } : { name: 'not-found', path }
    case 'new':
      return { name: 'new-goal' }
    case 'analytics':
      return { name: 'analytics' }
    case 'achievements':
      return { name: 'achievements' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'not-found', path }
  }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Build an href for a route. Always the only place URLs are constructed. */
export function href(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return `${BASE}/`
    case 'goal':
      return `${BASE}/goal/${encodeURIComponent(route.goalId)}`
    case 'new-goal':
      return `${BASE}/new`
    case 'analytics':
      return `${BASE}/analytics`
    case 'achievements':
      return `${BASE}/achievements`
    case 'settings':
      return `${BASE}/settings`
    case 'not-found':
      return `${BASE}/`
  }
}

export function routeKey(route: Route): string {
  return route.name === 'goal' ? `goal:${route.goalId}` : route.name
}

interface RouterValue {
  route: Route
  navigate: (route: Route, options?: { replace?: boolean }) => void
  back: () => void
  /** True when there is app history to go back to, for showing a back button. */
  canGoBack: boolean
}

const RouterContext = createContext<RouterValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(globalThis.location?.pathname ?? '/'),
  )
  // Tracks pushes made inside the app, so "back" is only offered when it would
  // stay inside the app rather than leaving it.
  const [depth, setDepth] = useState(0)

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname))
      setDepth((current) => Math.max(0, current - 1))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback<RouterValue['navigate']>((next, options = {}) => {
    const url = href(next)
    if (options.replace) {
      window.history.replaceState(null, '', url)
    } else {
      if (url === window.location.pathname) return
      window.history.pushState(null, '', url)
      setDepth((current) => current + 1)
    }
    setRoute(next)
    // A new screen should start at the top; browsers only restore scroll for
    // real navigations, not pushState.
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const back = useCallback(() => {
    if (depth > 0) window.history.back()
    else {
      window.history.replaceState(null, '', href({ name: 'dashboard' }))
      setRoute({ name: 'dashboard' })
    }
  }, [depth])

  const value = useMemo<RouterValue>(
    () => ({ route, navigate, back, canGoBack: depth > 0 }),
    [route, navigate, back, depth],
  )

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter must be used inside <RouterProvider>')
  return value
}

/**
 * An anchor that navigates in-app. It stays a real `<a href>` so middle-click,
 * ctrl-click and "open in new tab" keep working, and screen readers announce
 * it as a link rather than a button.
 */
export function Link({
  to,
  children,
  onClick,
  ...rest
}: {
  to: Route
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  const { navigate } = useRouter()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented) return
    // Let the browser handle anything that isn't a plain left click.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate(to)
  }

  return (
    <a href={href(to)} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
