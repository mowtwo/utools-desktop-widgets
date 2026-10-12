import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme } from './lib/theme'
import { syncOverlays, useStore } from './store'

applyTheme()

if (window.utools) {
  window.services?.onWidgetMoved((id, x, y) => useStore.getState().updateWidget(id, { x, y }))
  window.utools.onPluginEnter((action) => {
    applyTheme()
    if (action.code === 'toggle') {
      const { overlayEnabled, setOverlayEnabled } = useStore.getState()
      setOverlayEnabled(!overlayEnabled)
      window.utools?.hideMainWindow()
      return
    }
    syncOverlays()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
