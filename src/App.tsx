import { Suspense, lazy, useEffect } from 'react'
import { Router, useRoute } from './lib/router'
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

/** Façade & Cladding (overview and its three systems): its own chunk, loaded only on those pages */
const FacadeRoutes = lazy(() => import('./facade/FacadeRoutes'))
const isFacade = (path: string) => path === '/facade-cladding' || path.startsWith('/facade-cladding/')

function Home() {
  usePointerTracking()
  useEffect(() => {
    document.title = 'RTARIUM by HEMISPHERE ONE · Three-dimensional basalt reinforcement mesh'
    document.documentElement.classList.add('is-home')
    // arriving on /#chapter: land on it once the page has laid out
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
    return () => document.documentElement.classList.remove('is-home')
  }, [])
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
  useEffect(() => {
    if (path !== '/') setShared({ chapter: 'page', step: 0, ground: 'light' })
  }, [path])
  if (path === '/') {
    return (
      <>
        <Nav />
        <Home />
      </>
    )
  }
  if (isFacade(path)) {
    return (
      <>
        <Nav />
        <main id="main">
          <Suspense fallback={<div className="page" aria-busy="true" />}>
            <FacadeRoutes path={path} />
          </Suspense>
        </main>
        <Footer screen />
      </>
    )
  }
  return (
    <>
      <Nav />
      <main id="main">{app ? <ApplicationPage id={app.id} /> : path === '/contact' ? <ContactPage /> : <NotFound />}</main>
      <Footer />
    </>
  )
}

export function App() {
  return (
    <Router>
      <Page />
    </Router>
  )
}
