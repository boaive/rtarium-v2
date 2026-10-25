import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/anybody/wdth.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/story.css'
import './styles/pages.css'
import { App } from './App'
import { startSmoothScroll } from './lib/scroll'

startSmoothScroll()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
