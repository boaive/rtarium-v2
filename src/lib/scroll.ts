import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { prefersReducedMotion } from './motion'

/**
 * How the page scrolls, on every page. The wheel glides: Lenis eases the page towards where the wheel
 * has asked it to go, a shorter step than the browser's own and a long, soft tail, as a premium 3D site
 * scrolls. Touch keeps the device's own momentum, and under reduced motion the browser's own scrolling is
 * left alone. Every scroll the site starts goes through `scrollToY`. A page may instead move a screen at a
 * time (`stepScreens`).
 */
let lenis: Lenis | null = null

/** how much of a wheel's step the page takes, and how much of the way there it eases each frame */
const WHEEL = 0.7
const LERP = 0.07

export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return
  lenis = new Lenis({ lerp: LERP, wheelMultiplier: WHEEL, smoothWheel: true, autoRaf: true })
}

export function scrollToY(y: number, immediate = false) {
  if (lenis) {
    // a long way takes a little longer, so a jump never lurches
    const far = Math.abs(y - window.scrollY) / Math.max(1, window.innerHeight)
    lenis.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: Math.min(2.2, 1.15 + far * 0.08), force: true })
  } else window.scrollTo({ top: y, behavior: immediate || prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** seconds one step of `stepScreens` takes */
const STEP_TIME = 1
/** the share of a step after which the next may start: by then the page is all but there, and only easing in */
const STEP_HELD = 0.62
/** ms after turning back in which it may not turn again: what is left of the last swipe's momentum */
const TURN_HELD = 300
/** ms without a wheel event that end a gesture */
const GESTURE_GAP = 140
/** how far a slow trackpad drag has to go before it counts as a step */
const NUDGE = 24
/** ms the page has to rest before it is brought to the nearest screen */
const SETTLE = 250
/** stops closer than this share of a screen are one stop */
const SAME_STOP = 0.15

/** answers at once, and comes to rest softly: a swipe should move the page as the fingers move */
const easeStep = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * every place the page may rest: each screen of each section, the end of a section taller than its screens, and the
 * foot of the page. A section's `data-pass-screen` names a screen (from 0) with nothing to read, which the page runs through.
 */
function screenStops() {
  const vh = window.innerHeight
  const end = document.documentElement.scrollHeight - vh
  const raw: number[] = []
  document.querySelectorAll<HTMLElement>('#main section, footer').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.height < 1) return
    const top = r.top + window.scrollY
    // a section's own screen, not the window's: under display scaling the two differ by a fraction of a pixel, which adds up
    const n = Math.max(1, Math.round(r.height / vh))
    const screen = r.height / n
    const own: number[] = []
    for (let y = top; y < top + r.height - screen * (1 + SAME_STOP); y += screen) own.push(y)
    own.push(top + Math.max(0, r.height - vh))
    const pass = el.dataset.passScreen
    raw.push(...(pass === undefined ? own : own.filter((y) => Math.abs(y - (top + Number(pass) * screen)) > screen * SAME_STOP)))
  })
  raw.push(end)
  const stops: number[] = []
  for (const y of raw.map((v) => Math.min(end, Math.round(v))).sort((a, b) => a - b)) {
    if (stops.length && y - stops[stops.length - 1] < vh * SAME_STOP) stops[stops.length - 1] = y
    else stops.push(y)
  }
  return stops
}

/**
 * Moves the page one screen at a time, whatever moves it: a mouse wheel, a trackpad's swipe and its momentum, a hard
 * flick and the keys each take exactly one step, and nothing more until that step has all but landed. A turn the
 * other way takes effect at once, back to the screen it left. Whatever else moves the page (the scrollbar, a finger,
 * focus) is brought to the nearest screen when it rests, so the page never stops between two. Returns what puts the page back to free scrolling. Under reduced motion it does nothing.
 */
export function stepScreens() {
  const glide = lenis
  if (!glide) return () => {}

  let moving = false
  let timer = 0
  let settle = 0
  let touching = false
  let last = -Infinity
  let lastSize = 0
  let lastDir = 0
  let sum = 0
  let spent = false
  /** where the page is going, where it came from, which way, and how far a turn back has got */
  let goal: number | null = null
  let origin = 0
  let goingDir = 0
  let turn = 0
  let turnedAt = -Infinity

  const moveTo = (y: number) => {
    const from = glide.isScrolling && goal !== null ? goal : window.scrollY
    origin = from
    goal = y
    goingDir = Math.sign(y - from)
    turn = 0
    moving = true
    // a step that runs through a screen takes a little longer, so it never lurches
    const time = Math.abs(y - window.scrollY) > window.innerHeight * 1.3 ? STEP_TIME * 1.45 : STEP_TIME
    glide.scrollTo(y, { duration: time, easing: easeStep, force: true })
    clearTimeout(timer)
    timer = window.setTimeout(() => (moving = false), time * 1000 * STEP_HELD)
  }
  const step = (dir: number) => {
    const stops = screenStops()
    const y = glide.isScrolling && goal !== null ? goal : window.scrollY
    const to = dir > 0 ? stops.find((s) => s > y + 4) : [...stops].reverse().find((s) => s < y - 4)
    if (to !== undefined) moveTo(to)
  }

  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey || glide.isStopped || (e.target as Element | null)?.closest?.('[data-lenis-prevent]')) return
    e.preventDefault()
    e.stopPropagation()
    const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1)
    if (!d) return
    const size = Math.abs(d)
    const dir = Math.sign(d)
    // momentum only ever dies away; a new notch or swipe comes in as strong as the last, or stronger
    const fresh = e.timeStamp - last > GESTURE_GAP || (dir !== lastDir && size >= 8)
    const gap = e.timeStamp - last
    const again = (size >= 60 && size >= lastSize && gap > 24) || (size >= 30 && size > lastSize * 2)
    last = e.timeStamp
    lastSize = size
    lastDir = dir
    if (fresh) {
      spent = false
      sum = 0
    }
    if (moving) {
      // turned round on the way: straight back to the screen it left
      if (dir === goingDir) turn = 0
      else if (e.timeStamp - turnedAt > TURN_HELD && Math.abs((turn += d)) >= NUDGE) {
        const back = origin
        const away = goal ?? back
        turnedAt = e.timeStamp
        spent = true
        sum = 0
        moveTo(back)
        origin = away
      }
      return
    }
    if (spent) {
      if (!again) return
      spent = false
      sum = 0
    }
    sum += d
    if (Math.abs(sum) < NUDGE) return
    spent = true
    sum = 0
    step(dir)
  }

  const keys = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || glide.isStopped) return
    const el = e.target as HTMLElement | null
    if (el?.closest?.('input, textarea, select, dialog, [contenteditable="true"]')) return
    if (e.key === ' ' && el?.closest?.('a, button, summary')) return
    const dir = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === ' ' ? -1 : 0
    if (!dir && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    if (moving) return
    if (dir) return step(dir)
    const stops = screenStops()
    moveTo(e.key === 'Home' ? stops[0] : stops[stops.length - 1])
  }

  const rest = () => {
    clearTimeout(settle)
    settle = window.setTimeout(() => {
      if (touching || glide.isStopped) return
      // still running on: look again once it has come to rest
      if (moving || glide.isScrolling) return rest()
      const y = window.scrollY
      const near = screenStops().reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a))
      if (Math.abs(near - y) > 1) moveTo(near)
    }, SETTLE)
  }
  const touchOn = () => {
    touching = true
  }
  const touchOff = () => {
    touching = false
    rest()
  }

  window.addEventListener('wheel', wheel, { capture: true, passive: false })
  window.addEventListener('keydown', keys)
  window.addEventListener('scroll', rest, { passive: true })
  window.addEventListener('touchstart', touchOn, { passive: true })
  window.addEventListener('touchend', touchOff, { passive: true })
  window.addEventListener('touchcancel', touchOff, { passive: true })
  rest()
  return () => {
    clearTimeout(timer)
    clearTimeout(settle)
    window.removeEventListener('wheel', wheel, { capture: true })
    window.removeEventListener('keydown', keys)
    window.removeEventListener('scroll', rest)
    window.removeEventListener('touchstart', touchOn)
    window.removeEventListener('touchend', touchOff)
    window.removeEventListener('touchcancel', touchOff)
  }
}

/** while an overlay (the menu) is open, the page underneath does not scroll */
export function holdScroll(held: boolean) {
  if (!lenis) return
  if (held) lenis.stop()
  else lenis.start()
}
