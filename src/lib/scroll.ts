import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { prefersReducedMotion } from './motion'

/**
 * How the page scrolls, on every page. The wheel glides: Lenis eases the page towards where the wheel
 * has asked it to go, the browser's own step with a short, soft settle, quick to answer and fluid, as
 * Enerblock's site scrolls (its Lenis: the full wheel step, lerp 0.13). Touch keeps the device's own
 * momentum, and under reduced motion the browser's own scrolling is left alone. Every scroll the site starts
 * goes through `scrollToY`. A page, or a section of one, may instead move a screen at a time (`stepScreens`).
 */
let lenis: Lenis | null = null

/** how much of a wheel's step the page takes, and how much of the way there it eases each frame */
const WHEEL = 1
const LERP = 0.13

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

/** seconds the page takes to play on by itself from the end of a free run to the next screen */
const AUTO_TIME = 2.2
/** carries on from the glide without a jolt, gathers pace, and comes to rest softly */
const easeAuto = (t: number) => t * (0.6 + t * (1.8 - 1.4 * t))

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
    let kept = pass === undefined ? own : own.filter((y) => Math.abs(y - (top + Number(pass) * screen)) > screen * SAME_STOP)
    // past the end of a free run the page plays on through the rest of its section to the next screen: no stops there
    if (el.dataset.freeScroll !== undefined) {
      const foot = footOf(el, r)
      kept = kept.filter((y) => y < foot - screen * SAME_STOP)
    }
    raw.push(...kept)
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
 * Where the free run of a `data-free-scroll` section ends: at the screen its value names (from 0, and it may be part
 * of the way into one), or, with no value, where its foot reaches the top of the screen.
 */
function footOf(el: HTMLElement, r = el.getBoundingClientRect()) {
  const top = r.top + window.scrollY
  const at = el.dataset.freeScroll
  if (!at) return top + r.height
  const n = Math.max(1, Math.round(r.height / window.innerHeight))
  return top + Number(at) * (r.height / n)
}

/**
 * a section marked `data-flow` holds the screen (it fills at least half of it, or runs on past its top): the page is
 * never brought to a screen there, and the reading runs on continuously
 */
function inFlow() {
  const vh = window.innerHeight
  for (const el of document.querySelectorAll<HTMLElement>('[data-flow]')) {
    const r = el.getBoundingClientRect()
    if (r.top < vh * 0.5 && r.bottom > vh * 0.5) return true
  }
  return false
}

/**
 * The foot of the free run. A section marked `data-free-scroll` (the opening tour, whose scroll is the animation) is
 * scrolled through freely, from the top of the page to the end of its run (`footOf`): the wheel glides there as on
 * any page, and once it gets there the page plays on by itself to the next screen, where the steps begin. -Infinity
 * when the page has no free run.
 */
function freeFoot() {
  const el = document.querySelector<HTMLElement>('#main [data-free-scroll]')
  return el ? Math.round(footOf(el)) : -Infinity
}

/**
 * Moves the page one screen at a time, whatever moves it: a mouse wheel, a trackpad's swipe and its momentum, a hard
 * flick and the keys each take exactly one step, and nothing more until that step has all but landed. A turn the
 * other way takes effect at once, back to the screen it left. Whatever else moves the page (the scrollbar, a finger,
 * focus) is brought to the nearest screen when it rests, so the page never stops between two. Above the foot of a
 * free run (`freeFoot`) the wheel and touch scroll freely instead, and the keys still go a screen at a time.
 *
 * Given `own`, the stops of one section (in order), the page steps only between those: above the first and below the
 * last it scrolls freely, and a free scroll that runs into the section lands on its nearest end. The keys step only
 * inside it. Returns what puts the page back to free scrolling. Under reduced motion it does nothing.
 */
export function stepScreens(own?: () => number[], opts: { time?: number | ((screens: number) => number) } = {}) {
  const glide = lenis
  if (!glide) return () => {}

  const stopsOf = own ?? screenStops
  /**
   * Where the steps run, from `lo` to `hi`. On the whole page (no `own`) from the foot of the free run to the end,
   * and a free run that reaches its foot plays on by itself to the next stop (`auto`); in a section, its first stop
   * to its last, and the page lands on whichever it runs into.
   */
  const zone = () => {
    if (!own) return { lo: freeFoot(), hi: Infinity, auto: true }
    const s = own()
    return s.length ? { lo: s[0], hi: s[s.length - 1], auto: false } : { lo: Infinity, hi: -Infinity, auto: false }
  }

  let moving = false
  let timer = 0
  let settle = 0
  let touching = false
  let last = -Infinity
  let lastSize = 0
  let lastDir = 0
  let sum = 0
  let spent = false
  /** the free run has landed at its foot during this gesture */
  let landed = false
  /** where the page is going, where it came from, which way, and how far a turn back has got */
  let goal: number | null = null
  let origin = 0
  let goingDir = 0
  let turn = 0
  let turnedAt = -Infinity

  const moveTo = (y: number, auto = false) => {
    const from = glide.isScrolling && goal !== null ? goal : window.scrollY
    origin = from
    goal = y
    goingDir = Math.sign(y - from)
    turn = 0
    moving = true
    // a step that runs through a screen takes a little longer, so it never lurches
    // (a section whose steps each play something out takes its own, longer time, and glides rather than snaps; it
    // may give the time by the length of the step, in screens)
    const screens = Math.abs(y - window.scrollY) / window.innerHeight
    const given = typeof opts.time === 'function' ? opts.time(screens) : opts.time
    const played = auto || given !== undefined
    const time = auto ? AUTO_TIME : (given ?? (screens > 1.3 ? STEP_TIME * 1.45 : STEP_TIME))
    glide.scrollTo(y, { duration: time, easing: played ? easeAuto : easeStep, force: true })
    clearTimeout(timer)
    // a step that plays something out is played to its end before the next may start: nothing cuts it short
    timer = window.setTimeout(() => (moving = false), time * 1000 * (played ? 1 : STEP_HELD))
  }
  const step = (dir: number) => {
    const stops = stopsOf()
    const y = glide.isScrolling && goal !== null ? goal : window.scrollY
    const to = dir > 0 ? stops.find((s) => s > y + 4) : [...stops].reverse().find((s) => s < y - 4)
    if (to !== undefined) moveTo(to)
  }

  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey || glide.isStopped || (e.target as Element | null)?.closest?.('[data-lenis-prevent]')) return
    const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1)
    if (!d) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const size = Math.abs(d)
    const dir = Math.sign(d)
    // momentum only ever dies away; a new notch or swipe comes in as strong as the last, or stronger
    const fresh = e.timeStamp - last > GESTURE_GAP || (dir !== lastDir && size >= 8)
    const gap = e.timeStamp - last
    const strong = (size >= 60 && size >= lastSize && gap > 24) || (size >= 30 && size > lastSize * 2)
    last = e.timeStamp
    lastSize = size
    lastDir = dir
    if (fresh) {
      spent = false
      sum = 0
      landed = false
    }
    // a wheel still spinning when the free run plays on by itself is the same spin, however hard: it ends there. In a
    // section whose steps play out, the next step takes a new scroll after a pause, never the tail of the last one
    const again = strong && !landed && opts.time === undefined
    if (!moving) {
      const { lo, hi, auto } = zone()
      const at = glide.isScrolling && goal !== null ? goal : window.scrollY
      // above the steps, going down: the wheel glides as on any page (Lenis takes the event) until it reaches them
      if (dir > 0 && at < lo - 4) {
        goal = null
        if (glide.targetScroll + d * WHEEL < lo) return
        e.preventDefault()
        e.stopPropagation()
        // there the page lands on the first stop, or plays on by itself to the next (Home), and the rest of this
        // swipe is spent on the way
        spent = true
        landed = true
        sum = 0
        const next = auto ? stopsOf().find((s) => s > lo + 4) : lo
        if (next !== undefined) moveTo(next, auto)
        return
      }
      // below the steps, going up: the same, the other way, onto the last stop
      if (dir < 0 && at > hi + 4) {
        goal = null
        if (glide.targetScroll + d * WHEEL > hi) return
        e.preventDefault()
        e.stopPropagation()
        spent = true
        landed = true
        sum = 0
        moveTo(hi)
        return
      }
      // going up at or above the first stop, or down at or below the last (a new swipe, not the tail of the step
      // that landed there): free. A section's steps never touch a scroll well outside it, going away from it (a
      // page may step in more than one section)
      if (dir < 0 && ((own && at < lo - 4) || (at <= lo + 4 && (!spent || again)))) {
        goal = null
        spent = false
        sum = 0
        return
      }
      if (dir > 0 && (at > hi + 4 || (at >= hi - 4 && (!spent || again)))) {
        goal = null
        spent = false
        sum = 0
        return
      }
    }
    e.preventDefault()
    e.stopPropagation()
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
    // stepping in one section: outside it the keys scroll the page as they always do, and Home and End go to its ends
    if (own) {
      const { lo, hi } = zone()
      const y = glide.isScrolling && goal !== null ? goal : window.scrollY
      if (!dir || y < lo - 4 || y > hi + 4 || (dir < 0 && y <= lo + 4) || (dir > 0 && y >= hi - 4)) return
    }
    e.preventDefault()
    if (moving) return
    if (dir) return step(dir)
    const stops = stopsOf()
    moveTo(e.key === 'Home' ? stops[0] : stops[stops.length - 1])
  }

  const rest = () => {
    clearTimeout(settle)
    settle = window.setTimeout(() => {
      if (touching || glide.isStopped) return
      // still running on: look again once it has come to rest
      if (moving || glide.isScrolling) return rest()
      const y = window.scrollY
      // outside the steps the page rests wherever it is let go
      const { lo, hi } = zone()
      if (y < lo - 4 || y > hi + 4) return
      // and so it does in a section that is read at its own pace (`data-flow`: on a phone, the table of what RTARIUM
      // replaces, the applications and the long footer), once it holds the middle of the screen
      if (inFlow()) return
      const stops = stopsOf()
      if (!stops.length) return
      const near = stops.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a))
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
