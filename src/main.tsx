import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyPrefs, loadPrefs } from './state/prefs'
import './styles/tokens.css'
import './styles/app.css'

// Apply the persisted theme before first paint so the app never flashes.
applyPrefs(loadPrefs())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
