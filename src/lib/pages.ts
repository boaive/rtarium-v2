import { lazy, type ComponentType } from 'react'
import { opening } from './builds'

/**
 * The site's three families of pages, each its own chunk (Façade & Cladding, Advanced Flooring, Wall Panels), and how
 * they are fetched ahead from Home.
 */
const load = {
  facade: () => import('../facade/FacadeRoutes'),
  flooring: () => import('../flooring/FlooringRoutes'),
  walls: () => import('../walls/WallPanels'),
}

/**
 * A page's chunk, as React's `lazy`, but a chunk that cannot be fetched (a page left open across a new build of the
 * site: its old chunk is gone) reloads the page once, which brings the new one, rather than leave the page blank on its
 * ground for good. Once a visit per page, so a page that truly cannot load shows the error instead of reloading on.
 */
function page<P>(get: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(() => {
    const key = `rtarium:reload:${window.location.pathname}`
    return get().then(
      (m) => {
        // (loaded: a later failure on this page, after another new build, may reload it again)
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* (no storage) */
        }
        return m
      },
      (err) => {
        let again = false
        try {
          again = sessionStorage.getItem(key) === null
          sessionStorage.setItem(key, '1')
        } catch {
          /* (no storage: no reload, so it never loops) */
        }
        if (!again) throw err
        window.location.reload()
        return new Promise<never>(() => {})
      },
    )
  })
}

export const FacadeRoutes = page(load.facade)
export const FlooringRoutes = page(load.flooring)
export const WallPanels = page(load.walls)

/** the phone clips the Unitized page plays in its solution's card: the heaviest of what the other pages fetch, so fetched ahead too */
const CLIPS = [1, 2, 3, 4, 5].map((i) => `/img/facade/unitized/answer-step-${i}.webp`)

/**
 * From Home, every other page made ready ahead: their code fetched while Home's opening shows (nothing scrolls then, so
 * its work is never felt), and, once the opening has gone, the Unitized clips fetched quietly in the background, into the
 * browser's cache. A page opened from Home then has its code at once. Each page's 3D is still made on its own page, as it
 * comes near (a scene cannot be carried from one page to the next). Not on a connection that asks to save data, or a slow one.
 */
export function fetchAhead() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (c?.saveData || (c?.effectiveType && c.effectiveType !== '4g')) return
  // (the code and its styles fetched into the cache, never run or applied here: run, they put three pages' code and
  // their stylesheets into Home itself. The list is the build's, ahead.json)
  const code = () =>
    fetch('/ahead.json')
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((files) =>
        files.forEach((href) => {
          const l = document.createElement('link')
          l.rel = 'prefetch'
          l.href = href
          if (href.endsWith('.js')) l.as = 'script'
          else if (href.endsWith('.css')) l.as = 'style'
          document.head.appendChild(l)
        }),
      )
      .catch(() => {})
  const next = () => {
    if (import.meta.env.DEV) return clips()
    code().finally(clips)
  }
  const idle = (f: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(f, { timeout: 2000 }) : window.setTimeout(f, 300))
  const clips = () => {
    // (the clips once the opening has gone, and the browser is idle, one at a time)
    if (opening()) return void window.setTimeout(clips, 800)
    const list = [...CLIPS]
    const one = () => {
      const url = list.shift()
      if (!url) return
      idle(() =>
        fetch(url, { priority: 'low' } as RequestInit)
          .then((r) => r.blob())
          .catch(() => null)
          .then(one),
      )
    }
    one()
  }
  next()
}
