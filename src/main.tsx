import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/anybody/wdth.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/stepbar.css'
import './styles/story.css'
import './styles/pages.css'
import './styles/mobile.css'
import { App } from './App'
import { startSmoothScroll } from './lib/scroll'
import { runOpener } from './opener'

startSmoothScroll()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// the opening: the emblem fills as the page loads, then opens onto it
runOpener()
