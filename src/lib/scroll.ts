import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { prefersReducedMotion } from './motion'

/**
 * How the page scrolls. The wheel glides (Lenis eases it towards where the wheel has asked to go);
 * touch keeps the device's own momentum. The story also holds: every screen and every step is a
 * holding point, and once the visitor stops, the page settles onto the next one in the direction
 * they were going, so each screen is seen whole and stays put while its sequence plays. It never
 * pulls back against them: only a nudge too small to mean anything returns to where it was, and it
 * waits while a mouse button is held (dragging the scrollbar, selecting text). Under reduced motion
 * the browser's own scrolling is left alone. Every scroll the site starts goes through `scrollToY`.
 */
let lenis: Lenis | null = null

/** how long the page must be still before it settles (ms), and below what a move counts as a nudge (fraction of the screen) */
const IDLE = 150
const NUDGE = 0.035
/** the screens and steps of the story, where the page holds */
const HOLDS = '.hero__screen, [data-step], #applications, .footer--screen'

let settling = false
let touching = false
/** a mouse button is down: the scrollbar, or a selection, is the visitor's until it is let go */
let holding = false
let lastY = 0
let heading: 1 | -1 = 1
let idle = 0
let release = 0

function holdPoints() {
  const y = window.scrollY
  const max = document.documentElement.scrollHeight - window.innerHeight
  const points = new Set<number>()
  document.querySelectorAll<HTMLElement>(HOLDS).forEach((el) => {
    const top = Math.round(el.getBoundingClientRect().top + y)
    if (top >= 0 && top <= max + 1) points.add(Math.min(top, Math.round(max)))
  })
  return [...points].sort((a, b) => a - b)
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

function settle() {
  idle = 0
  if (!lenis || settling || touching || holding || lenis.isStopped) return
  const root = document.documentElement
  if (!root.classList.contains('is-home') || root.classList.contains('menu-open') || document.querySelector('dialog[open]')) return
  const y = window.scrollY
  const vh = window.innerHeight
  const points = holdPoints()
  let before = -Infinity
  let after = Infinity
  for (const p of points) {
    if (p <= y + 1) before = Math.max(before, p)
    else after = Math.min(after, p)
  }
  if (Math.abs(y - before) <= 1) return
  // on in the direction of travel; a nudge too small to mean anything goes back where it was
  const from = heading > 0 ? before : after
  let target = heading > 0 ? after : before
  if (Number.isFinite(from) && Math.abs(y - from) < vh * NUDGE) target = from
  if (!Number.isFinite(target)) target = heading > 0 ? before : after
  // a long stretch with nothing to hold (none on this page today) is left alone
  if (!Number.isFinite(target) || Math.abs(target - y) > vh * 1.1) return
  const duration = 0.45 + 0.55 * Math.min(1, Math.abs(target - y) / vh)
  settling = true
  // if anything cuts the settling short, the page is the visitor's again shortly after
  window.clearTimeout(release)
  release = window.setTimeout(() => (settling = false), duration * 1000 + 250)
  lenis.scrollTo(target, {
    duration,
    easing: ease,
    onComplete: () => {
      settling = false
    },
  })
}

export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, smoothWheel: true, autoRaf: true })
  lastY = window.scrollY
  lenis.on('scroll', () => {
    const y = window.scrollY
    // which way the visitor is going (the page's own settling does not count)
    if (!settling && Math.abs(y - lastY) > 0.5) heading = y > lastY ? 1 : -1
    lastY = y
    window.clearTimeout(idle)
    idle = window.setTimeout(settle, IDLE)
  })
  // a wheel turned, a key pressed or a finger put down is the visitor's again (Lenis lets their input
  // override its own settling)
  const takeBack = () => {
    settling = false
  }
  window.addEventListener('wheel', takeBack, { passive: true })
  window.addEventListener('keydown', takeBack)
  window.addEventListener(
    'touchstart',
    () => {
      touching = true
      takeBack()
    },
    { passive: true },
  )
  const lift = () => {
    touching = false
    window.clearTimeout(idle)
    idle = window.setTimeout(settle, IDLE * 2)
  }
  window.addEventListener('touchend', lift, { passive: true })
  window.addEventListener('touchcancel', lift, { passive: true })
  // the browser does not always report the release of a scrollbar drag: the next move without a button counts
  const letGo = () => {
    if (!holding) return
    holding = false
    window.clearTimeout(idle)
    idle = window.setTimeout(settle, IDLE)
  }
  window.addEventListener('mousedown', () => {
    holding = true
    takeBack()
  })
  window.addEventListener('mouseup', letGo)
  window.addEventListener('mousemove', (e) => e.buttons === 0 && letGo(), { passive: true })
}

export function scrollToY(y: number, immediate = false) {
  if (lenis) lenis.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: 1.15, force: true })
  else window.scrollTo({ top: y, behavior: immediate || prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** while an overlay (the menu) is open, the page underneath does not scroll */
export function holdScroll(held: boolean) {
  if (!lenis) return
  if (held) lenis.stop()
  else lenis.start()
}
