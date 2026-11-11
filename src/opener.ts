import { DefaultLoadingManager } from 'three'
import { holdScroll } from './lib/scroll'
import { prefersReducedMotion } from './lib/motion'
import { builds } from './lib/builds'

/**
 * The opening (its markup and styles are in index.html, so it shows from the first paint): while the page, its fonts and
 * its 3D load, the RTARIUM emblem fills with yellow from its foot, as far as they have come; once all of it is in and has
 * been still a moment, the emblem becomes a window onto the page, and the black parts down its middle as two doors, left
 * and right, the window opening wide as they go, Enerblock's opening made RTARIUM's. The page does not scroll until it
 * has gone. It plays once, as the site opens, not between its pages. Under reduced motion the emblem fills, and the black
 * fades away.
 *
 * What the 3D needs is counted by three.js's own loading manager, which every model and texture the site loads goes
 * through (drei's useGLTF and useTexture, the footer's loaders).
 */

/** the least time the opening shows, the most it waits, and how long nothing may load before all is in (ms) */
const LEAST = 1300
const MOST = 9000
const STILL = 450
/** how long the window holds before the doors part, and how long they take (as in index.html) */
const HOLD = 380
const PART = 1250

export function runOpener() {
  const el = document.getElementById('opener')
  if (!el) return
  // once a visit (index.html hides it from the first paint when it has played)
  const root0 = document.documentElement
  if (root0.classList.contains('is-opened')) return el.remove()
  try {
    sessionStorage.setItem('rtarium:opened', '1')
  } catch {
    /* (private modes without storage: it plays each time) */
  }
  const reduced = prefersReducedMotion()
  const root = document.documentElement
  root.classList.add('is-opening')
  holdScroll(true)

  // what the 3D has asked for, and how much of it has come
  let total = 0
  let loaded = 0
  const before = { start: DefaultLoadingManager.onStart, progress: DefaultLoadingManager.onProgress, load: DefaultLoadingManager.onLoad }
  DefaultLoadingManager.onStart = (url, l, t) => {
    total = t
    loaded = l
    before.start?.(url, l, t)
  }
  DefaultLoadingManager.onProgress = (url, l, t) => {
    total = t
    loaded = l
    before.progress?.(url, l, t)
  }
  DefaultLoadingManager.onLoad = () => {
    loaded = total
    before.load?.()
  }

  let page = document.readyState === 'complete'
  if (!page) window.addEventListener('load', () => (page = true), { once: true })
  let fonts = false
  ;(document.fonts?.ready ?? Promise.resolve()).then(() => (fonts = true))

  const t0 = performance.now()
  let stillSince = t0
  let shown = 0
  let done = false

  const finish = () => {
    DefaultLoadingManager.onStart = before.start
    DefaultLoadingManager.onProgress = before.progress
    DefaultLoadingManager.onLoad = before.load
    el.remove()
    root.classList.remove('is-opening')
    holdScroll(false)
  }

  const open = () => {
    done = true
    el.style.setProperty('--p', '1')
    if (reduced) {
      el.classList.add('is-fade')
      window.setTimeout(finish, 480)
      return
    }
    // the emblem a window onto the page; then the doors part
    el.classList.add('is-cut')
    window.setTimeout(() => el.classList.add('is-open'), HOLD)
    window.setTimeout(finish, HOLD + PART + 60)
  }

  const frame = () => {
    if (done) return
    const now = performance.now()
    // (and the page's 3D scenes, built while it shows: none is left to be built as the visitor scrolls)
    const busy = total > loaded || builds.waiting > 0
    if (busy || !page || !fonts) stillSince = now
    const ready = (now - t0 > LEAST && now - stillSince > STILL) || now - t0 > MOST
    // how far it has come: the page and its fonts a share each, the 3D the rest; never quite full until all is in
    const part = (page ? 0.25 : 0) + (fonts ? 0.15 : 0) + (total ? (0.5 * loaded) / total : 0.5 * Math.min(1, (now - t0) / LEAST))
    const target = ready ? 1 : Math.min(0.9, Math.max(part, 0.08 + 0.55 * Math.min(1, (now - t0) / 4000)))
    shown += (target - shown) * (ready ? 0.2 : 0.07)
    el.style.setProperty('--p', shown.toFixed(4))
    if (ready && shown > 0.995) return open()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
