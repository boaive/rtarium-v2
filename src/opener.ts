import { DefaultLoadingManager } from 'three'
import { holdScroll } from './lib/scroll'
import { COMPACT_QUERY, prefersReducedMotion } from './lib/motion'
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
/** (a phone's Home makes every scene behind it, its card models and their openings too: it may take longer there) */
const MOST = typeof window !== 'undefined' && window.location.pathname === '/' && window.matchMedia('(max-width: 860px), (max-aspect-ratio: 4/5), (any-pointer: coarse) and (max-width: 1180px)').matches ? 18000 : 9000
const STILL = 450
/** how long the window holds before the doors part, and how long they take (as in index.html) */
const HOLD = 380
const PART = 1250

/** the opening as it first stands, kept to play again over a page opened later (a phone: `openOnPage`) */
let blank: HTMLElement | null = null

export function runOpener() {
  const el = document.getElementById('opener')
  if (!el) return
  blank = el.cloneNode(true) as HTMLElement
  // once a visit (index.html hides it from the first paint when it has played)
  const root0 = document.documentElement
  if (root0.classList.contains('is-opened')) return el.remove()
  try {
    sessionStorage.setItem('rtarium:opened', '1')
  } catch {
    /* (private modes without storage: it plays each time) */
  }
  play(el, LEAST, MOST)
}

/**
 * A phone, going to another page of the site: the opening plays again over it, so every scene of the new page is built
 * (and its openings played) behind it, never as the page scrolls to it. Nothing on a wide screen, or under one already
 * playing.
 */
export function openOnPage() {
  if (!blank || !window.matchMedia(COMPACT_QUERY).matches) return
  const root = document.documentElement
  if (root.classList.contains('is-opening')) return
  root.classList.remove('is-opened')
  const el = blank.cloneNode(true) as HTMLElement
  document.body.appendChild(el)
  play(el, 900, 9000)
}

/**
 * What the opening says under the emblem while the page comes together: a few short lines about the page being made,
 * one after another, round again until it opens. By the page's path (the longest that fits); the site's, by default.
 */
const LINES: [string, string[]][] = [
  ['/facade-cladding/unitized-thin-concrete-facade', ['Assembling six layers', 'Glazing the window', 'Lifting the unit into place', 'Sealing slab to slab']],
  ['/facade-cladding/rainscreen-cladding', ['Fixing the brackets', 'Hanging the rails', 'Venting the cavity', 'Shedding the rain']],
  ['/facade-cladding/stud-frame-cladding', ['Framing the studs', 'Spraying the skin', 'Setting the flex anchors', 'Breathing with the heat']],
  ['/facade-cladding', ['Casting thin concrete skins', 'Weaving the basalt mesh', 'Hanging the panels', 'Sealing every joint']],
  ['/advanced-flooring/data-ai-centres', ['Racking the servers', 'Grounding the floor', 'Damping the vibration', 'Keeping it dust-free']],
  ['/advanced-flooring/automated-warehouse', ['Clearing the aisles', 'Guiding the robots', 'Hardening the surface', 'Running jointless']],
  ['/advanced-flooring/semiconductor-plant', ['Sealing the cleanroom', 'Holding the line still', 'Calming the tremors', 'Guarding the yield']],
  ['/advanced-flooring', ['Laying the 3D mesh', 'Pouring the screed', 'Levelling the floor', 'Closing the joints']],
  ['/wall-panels', ['Casting 30 mm panels', 'Setting the SIP core', 'Tying the leaves together', 'Raising the walls']],
  ['/', ['Weaving the basalt mesh', 'Tensioning the fibres', 'Setting the concrete', 'Building in 3D']],
]
const linesFor = (path: string) => (LINES.find(([p]) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`))) ?? LINES[LINES.length - 1])[1]

/** the lines under the emblem, round and round, each in and out (index.html, `.opener__words`); returns the stop */
function sayLines(el: HTMLElement, reduced: boolean) {
  const lines = linesFor(window.location.pathname.replace(/\/+$/, '') || '/')
  const words = document.createElement('p')
  words.className = 'opener__words'
  words.textContent = `${lines[0]}…`
  el.appendChild(words)
  if (reduced) return () => {}
  let i = 0
  let swap = 0
  const timer = window.setInterval(() => {
    words.classList.add('is-out')
    swap = window.setTimeout(() => {
      i = (i + 1) % lines.length
      words.textContent = `${lines[i]}…`
      words.classList.remove('is-out')
    }, 260)
  }, 1500)
  return () => {
    window.clearInterval(timer)
    window.clearTimeout(swap)
  }
}

function play(el: HTMLElement, least: number, most: number) {
  const reduced = prefersReducedMotion()
  const root = document.documentElement
  root.classList.add('is-opening')
  holdScroll(true)
  const quiet = sayLines(el, reduced)

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
    quiet()
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
    const busy = total > loaded || builds.waiting > 0 || builds.stage > 0 || builds.tail > 0
    if (busy || !page || !fonts) stillSince = now
    const ready = (now - t0 > least && now - stillSince > STILL) || now - t0 > most
    // how far it has come: the page and its fonts a share each, the 3D the rest; never quite full until all is in
    const part = (page ? 0.25 : 0) + (fonts ? 0.15 : 0) + (total ? (0.5 * loaded) / total : 0.5 * Math.min(1, (now - t0) / least))
    const target = ready ? 1 : Math.min(0.9, Math.max(part, 0.08 + 0.55 * Math.min(1, (now - t0) / 4000)))
    shown += (target - shown) * (ready ? 0.2 : 0.07)
    el.style.setProperty('--p', shown.toFixed(4))
    if (ready && shown > 0.995) return open()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
