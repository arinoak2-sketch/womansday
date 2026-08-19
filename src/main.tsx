import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Optical-size axis for the display serif, weight axis for the UI sans. Both
// are self-hosted, so the app has no runtime font dependency on a third party.
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/manrope/wght.css'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing from the page.')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
