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
import './styles/nav.css'
import './styles/minimal.css'
import './styles/consent.css'
import { App } from './App'
import { startSmoothScroll } from './lib/scroll'
import { startAnalytics } from './lib/analytics'
import { runOpener } from './opener'
import { startSettle } from './lib/settle'
import { startGlDebug } from './dev/gldebug'

// (`?gldebug`: a panel of what the device's 3D is doing; nothing without it)
startGlDebug()
startSmoothScroll()
startAnalytics()
// (a phone: a pinned section that reads best at rest on a stop is glided there slowly once the scroll stops)
startSettle()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// the opening: the emblem fills as the page loads, then opens onto it
runOpener()

// a scroll recorder for testing on a real phone, only with ?probe in the address (src/dev/probe.ts)
if (new URLSearchParams(window.location.search).has('probe')) void import('./dev/probe').then((m) => m.startProbe())
