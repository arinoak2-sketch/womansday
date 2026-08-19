import type { ReactNode } from 'react'
import { Link, useRouter, type Route } from '../router/router'
import { Icon, type IconName } from './ui/Icon'
import { Button } from './ui/Button'
import { useAppStore } from '../store/AppStore'
import './AppShell.css'

interface NavItem {
  route: Route
  label: string
  icon: IconName
}

const NAV_ITEMS: NavItem[] = [
  { route: { name: 'dashboard' }, label: 'Home', icon: 'home' },
  { route: { name: 'analytics' }, label: 'Insights', icon: 'chart' },
  { route: { name: 'achievements' }, label: 'Achieved', icon: 'trophy' },
  { route: { name: 'settings' }, label: 'Settings', icon: 'settings' },
]

/**
 * App chrome.
 *
 * Two genuinely different navigation layouts rather than one stretched to fit:
 * a thumb-reachable tab bar on phones, and a persistent rail on desktop that
 * keeps the primary action visible while leaving the full width to content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { route } = useRouter()
  const { portfolio, ephemeral } = useAppStore()

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="rail" aria-label="Main">
        <div className="rail__brand">
          <span className="rail__mark" aria-hidden="true">
            <Icon name="wallet" size={20} />
          </span>
          <span className="rail__wordmark">Aurum</span>
        </div>

        <Link to={{ name: 'new-goal' }} className="rail__cta">
          <Icon name="plus" size={18} />
          New goal
        </Link>

        <ul className="rail__list">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                to={item.route}
                className="rail__link"
                aria-current={isActive(route, item.route) ? 'page' : undefined}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="rail__foot">
          {portfolio.activeGoals.length === 0
            ? 'No active goals'
            : `${portfolio.activeGoals.length} active ${
                portfolio.activeGoals.length === 1 ? 'goal' : 'goals'
              }`}
        </p>
      </nav>

      <div className="shell__body">
        {ephemeral && (
          // Storage being blocked is invisible until a refresh wipes the data,
          // so it's stated up front rather than discovered the hard way.
          <p className="shell__warning" role="status">
            <Icon name="alert" size={16} />
            This browser is blocking local storage, so goals won't be saved when you close the tab.
          </p>
        )}

        <main id="main" className="shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        <ul className="tabbar__list">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <TabLink key={item.label} item={item} active={isActive(route, item.route)} />
          ))}

          <li className="tabbar__item tabbar__item--cta">
            <Link to={{ name: 'new-goal' }} className="tabbar__cta" aria-label="Create a new goal">
              <Icon name="plus" size={24} />
            </Link>
          </li>

          {NAV_ITEMS.slice(2).map((item) => (
            <TabLink key={item.label} item={item} active={isActive(route, item.route)} />
          ))}
        </ul>
      </nav>
    </div>
  )
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li className="tabbar__item">
      <Link
        to={item.route}
        className="tabbar__link"
        aria-current={active ? 'page' : undefined}
      >
        <Icon name={item.icon} size={21} />
        <span className="tabbar__label">{item.label}</span>
      </Link>
    </li>
  )
}

/** A goal page keeps Home highlighted — it's reached from there. */
function isActive(current: Route, target: Route): boolean {
  if (current.name === target.name) return true
  return target.name === 'dashboard' && current.name === 'goal'
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

interface PageHeaderProps {
  title: string
  /** Small label above the title. */
  eyebrow?: string
  description?: ReactNode
  actions?: ReactNode
  /** Shows a back control. Used on goal detail and goal creation. */
  onBack?: () => void
  backLabel?: string
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  onBack,
  backLabel = 'Back',
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack && (
        <Button variant="quiet" size="sm" icon="arrow-left" onClick={onBack} className="page-header__back">
          {backLabel}
        </Button>
      )}

      <div className="page-header__row">
        <div className="page-header__text">
          {eyebrow && <p className="overline">{eyebrow}</p>}
          <h1 className="page-header__title">{title}</h1>
          {description && <p className="page-header__description">{description}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  )
}
