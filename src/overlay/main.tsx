import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './overlay.css'
import { applyTheme } from '@/lib/theme'
import Overlay from './Overlay'

applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
)
