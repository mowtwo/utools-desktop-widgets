import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { handlePluginEnter } from './lib/enter'
import { applyTheme } from './lib/theme'

applyTheme()

if (window.utools) {
  window.utools.onPluginEnter((action) => {
    applyTheme()
    void handlePluginEnter(action)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
