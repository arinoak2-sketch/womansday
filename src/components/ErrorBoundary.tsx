import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Last line of defence.
 *
 * If a render throws, the user gets a plain explanation and a way forward —
 * never a stack trace and never a white screen. Their saved data is untouched
 * by a render failure, and saying so is the most useful thing this screen can
 * do.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is for whoever is debugging; the UI below is for the user.
    console.error('Unhandled render error', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="crash">
        <h1 className="crash__title">Something went wrong</h1>
        <p className="crash__body">
          Aurum hit an unexpected problem while drawing this screen. Your goals and savings are
          stored on this device and haven't been changed.
        </p>
        <div className="crash__actions">
          <button type="button" className="crash__button" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>

        <style>{`
          .crash {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            max-width: 30rem;
            margin: 0 auto;
            padding: 6rem 1.5rem;
            text-align: center;
            font-family: var(--font-ui, system-ui, sans-serif);
            color: var(--ink, #1a1712);
          }
          .crash__title {
            font-family: var(--font-display, Georgia, serif);
            font-size: 1.75rem;
          }
          .crash__body {
            color: var(--ink-2, #5a5348);
            line-height: 1.6;
          }
          .crash__actions { margin-top: 1rem; }
          .crash__button {
            min-height: 2.75rem;
            padding: 0 1.5rem;
            border: none;
            border-radius: 999rem;
            background: var(--ink, #1a1712);
            color: var(--ink-inverse, #faf7f2);
            font: inherit;
            font-weight: 600;
            cursor: pointer;
          }
        `}</style>
      </div>
    )
  }
}
