import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react'
import { FacadeRoutes, FlooringRoutes, WallPanels, fetchAhead } from './lib/pages'
import { Router, useRoute } from './lib/router'
import { openOnPage } from './opener'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Progress } from './components/Progress'
import { Ground, Stage, usePointerTracking } from './three/Stage'
import { Hero } from './sections/Hero'
import { About } from './sections/About'
import { Why } from './sections/Why'
import { Innovation } from './sections/Innovation'
import { TechSpace } from './sections/TechSpace'
import { Applications } from './sections/Applications'
import { ApplicationPage, ContactPage, NotFound } from './pages/Planned'
import { APPLICATIONS } from './content/site'
import { setShared } from './three/stageStore'
import { startSmoothScroll, stepScreens } from './lib/scroll'
import { COMPACT_QUERY, useIsCompact } from './lib/motion'
import { ScrollLine } from './components/ScrollLine'
import { Consent } from './components/Consent'
import { PrivacyPage } from './pages/Privacy'
import { startSectionTimer, trackPage, useConsent } from './lib/analytics'
import { startStepTimer } from './lib/stepTimer'

/** Façade & Cladding (overview and its three systems): its own chunk (src/lib/pages.ts) */
const isFacade = (path: string) => path === '/facade-cladding' || path.startsWith('/facade-cladding/')
/** Advanced Flooring (overview and its three applications): the same, its own chunk */
const isFlooring = (path: string) => path === '/advanced-flooring' || path.startsWith('/advanced-flooring/')
/** Wall Panels: one page, its own chunk */
/** development only (never in a build): the Unitized page's scenes rendered a frame at a time, for its phone clips */
const FilmUnitized = import.meta.env.DEV ? lazy(() => import('./dev/FilmUnitized')) : null
/** development only: a phone's Home card model rendered a frame at a time, for its film (scripts/film-record.mjs) */
const FilmCard = import.meta.env.DEV ? lazy(() => import('./dev/FilmCard')) : null
const isWalls = (path: string) => path === '/wall-panels' || path.startsWith('/wall-panels/')

function Home() {
  usePointerTracking()
  const compact = useIsCompact()
  useEffect(() => {
    document.title = 'RTARIUM by HEMISPHERE ONE · 3D Basalt Reinforcement Mesh'
    // arriving on /#chapter: land on it once the page has laid out
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
    // every other page's code fetched ahead, while the opening shows (src/lib/pages.ts)
    fetchAhead()
  }, [])
  // a phone reads Home as EnduroSat's reads: one free, native scroll over the fixed 3D, nothing snapping to a screen.
  // A wide screen steps a screen a scroll, decided again whenever the window changes between the two: a page that
  // opened narrow (a window still sizing, a docked inspector) and then widened would otherwise scroll freely for good.
  useEffect(() => {
    if (compact || window.matchMedia(COMPACT_QUERY).matches) return
    // (the phone's pager sets the smooth scroll aside and brings it back as it lets go: make sure it is running)
    startSmoothScroll()
    return stepScreens()
  }, [compact])
  return (
    <>
      <Ground />
      <Stage />
      <main id="main" className="story">
        <Hero />
        <About />
        <Why />
        <Innovation />
        <TechSpace />
        <Applications />
      </main>
      <Footer screen />
      <Progress />
    </>
  )
}

function Page() {
  const { path } = useRoute()
  const app = APPLICATIONS.find((a) => a.path === path)
  // (a phone, on to another page: the opening plays over it while its scenes are built; a layout effect, so it is up
  // before any scene of the new page asks whether it is: src/opener.ts `openOnPage`)
  const first = useRef(true)
  useLayoutEffect(() => {
    if (first.current) return void (first.current = false)
    openOnPage()
  }, [path])
  useEffect(() => {
    if (path !== '/') setShared({ chapter: 'page', step: 0, ground: 'light' })
  }, [path])
  // (development only: a scene rendered a frame at a time, for the Unitized page's phone clips)
  if (FilmCard && path === '/__film-card') {
    return (
      <Suspense fallback={null}>
        <FilmCard />
      </Suspense>
    )
  }
  if (FilmUnitized && path === '/__film') {
    return (
      <Suspense fallback={null}>
        <FilmUnitized />
      </Suspense>
    )
  }
  if (path === '/') {
    return (
      <>
        <Nav />
        <Home />
      </>
    )
  }
  if (isFacade(path) || isFlooring(path) || isWalls(path)) {
    return (
      <>
        <Nav />
        <main id="main">
          <Suspense fallback={<div className="page" aria-busy="true" />}>
            {isFacade(path) ? <FacadeRoutes path={path} /> : isFlooring(path) ? <FlooringRoutes path={path} /> : <WallPanels />}
          </Suspense>
        </main>
        <Footer screen />
      </>
    )
  }
  return (
    <>
      <Nav />
      <main id="main">
        {app ? <ApplicationPage id={app.id} /> : path === '/contact' ? <ContactPage /> : path === '/privacy' ? <PrivacyPage /> : <NotFound />}
      </main>
      <Footer />
    </>
  )
}

/** on a phone, the hairline down the right edge in place of the step bars (ScrollLine) */
function PhoneLine() {
  return useIsCompact() ? <ScrollLine /> : null
}

/**
 * One page view per route, once the visitor has accepted analytics. It waits a moment so the page has set its own
 * title (the lazy pages set it as they load), and the first one goes out the moment consent is given.
 */
function PageViews() {
  const { path } = useRoute()
  const { choice } = useConsent()
  useEffect(() => {
    if (choice !== 'granted') return
    const t = window.setTimeout(() => trackPage(path), 700)
    return () => window.clearTimeout(t)
  }, [path, choice])
  // time on each section of the page, once it has laid out
  useEffect(() => {
    if (choice !== 'granted') return
    let stop = () => {}
    const t = window.setTimeout(() => (stop = startSectionTimer(path)), 900)
    return () => {
      window.clearTimeout(t)
      stop()
    }
  }, [path, choice])
  // time on each step of the stepped sections
  useEffect(() => {
    if (choice !== 'granted') return
    let stop = () => {}
    const t = window.setTimeout(() => (stop = startStepTimer(path)), 900)
    return () => {
      window.clearTimeout(t)
      stop()
    }
  }, [path, choice])
  return null
}

export function App() {
  return (
    <Router>
      <Page />
      <PhoneLine />
      <PageViews />
      <Consent />
    </Router>
  )
}
