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

/** the page's jumps (`scrollToY` at once), counted: a step's goal from before one is no longer where the page is going */
let jumps = 0

export function scrollToY(y: number, immediate = false) {
  if (immediate) jumps++
  if (lenis) {
    // a long way takes a little longer, so a jump never lurches
    const far = Math.abs(y - window.scrollY) / Math.max(1, window.innerHeight)
    lenis.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: Math.min(2.2, 1.15 + far * 0.08), force: true })
  } else window.scrollTo({ top: y, behavior: immediate || prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** seconds one step of `stepScreens` takes */
const STEP_TIME = 1.1
/** the share of a step after which the next may start: by then the page is all but there, and only easing in */
const STEP_HELD = 0.62
/** the same for a step that plays something out: its last stretch only settles, and the next may take over from it */
const PLAY_HELD = 0.82
/** the share of a step after which a new scroll the same way is kept, and taken the moment the step lets go */
const QUEUE_FROM = 0.2
/** ms after turning back in which it may not turn again: what is left of the last swipe's momentum */
const TURN_HELD = 300
/** ms without a wheel event that end a gesture */
const GESTURE_GAP = 140
/** how far a slow trackpad drag has to go before it counts as a step */
const NUDGE = 24
/** how much scroll the other way, as a fresh gesture, turns a step round: a real notch or swipe back, never the flick
 * of a swipe's end or a wheel settling (px) */
const TURN_NUDGE = 80
/** ms the page has to rest before it is brought to the nearest screen */
const SETTLE = 250
/** stops closer than this share of a screen are one stop */
const SAME_STOP = 0.15
/** how near the end of a free stretch a scroll may come to rest before the page takes it the rest of the way (screens) */
const NEAR_END = 0.4
/** how far one scroll goes through Home's tour, a notch or a swipe however hard (screens), and in what time (s) */
const TOUR_STEP = 0.6
const TOUR_TIME = 1.05
/** how far before the end of Home's tour its white begins (screens): a scroll into it carries on to the next screen */
const TOUR_WHITE = 1.75


/** seconds the page takes to play on by itself from the end of a free run to the next screen */
const AUTO_TIME = 2.2
/** carries on from the glide without a jolt, gathers pace, and comes to rest softly */
const easeAuto = (t: number) => t * (0.6 + t * (1.8 - 1.4 * t))
/** a step that plays something out: moves the moment the wheel turns, never a pause before it, and settles softly */
const easePlay = (t: number) => t * (2 - t)

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
export function stepScreens(
  own?: () => number[],
  opts: {
    time?: number | ((screens: number, to: number) => number)
    /** where a step back (up) may land, if not every stop: a section that steps through its own parts is left whole going up */
    back?: () => number[]
    /**
     * Stretches scrolled freely, from a stop to a stop (a section whose run plays with the scroll itself): the wheel glides
     * through either way, and the page lands on the stretch's end it reaches. Asked by the way the page is going (0: at
     * rest), so a stretch may be free one way and stepped over the other
     */
    free?: (dir: number) => [number, number][]
    /**
     * Where a step from `from` to `to` may start instead, the page leaping there at once (a pinned section's run, which
     * looks the same all the way through): the glide is only the rest of the way. None: it starts where the page is
     */
    leap?: (from: number, to: number) => number | null
  } = {},
) {
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

  /** the jumps there had been when `goal` was set */
  let goalJumps = 0
  /** where a scroll through Home's tour is gliding to, while it does */
  let tourAim: number | null = null
  /** when the step under way began and how long it takes (ms), and a new scroll kept for when it lets go (its way, or 0) */
  let stepAt = 0
  let stepMs = 0
  let queued = 0
  /** where the page is going: the step's goal while it glides there, unless the page has been jumped since (a section
   * taking it straight on to where it was left), else where it is */
  const going = () => (glide.isScrolling && goal !== null && goalJumps === jumps ? goal : window.scrollY)

  const moveTo = (y: number, auto = false) => {
    const from = going()
    origin = from
    goal = y
    goalJumps = jumps
    goingDir = Math.sign(y - from)
    turn = 0
    moving = true
    const leap = opts.leap?.(from, y)
    if (leap !== null && leap !== undefined && Math.abs(leap - window.scrollY) > 1) glide.scrollTo(leap, { immediate: true, force: true })
    // a step that runs through a screen takes a little longer, so it never lurches
    // (a section whose steps each play something out takes its own, longer time, and glides rather than snaps; it
    // may give the time by the length of the step, in screens)
    const screens = Math.abs(y - window.scrollY) / window.innerHeight
    const given = typeof opts.time === 'function' ? opts.time(screens, y) : opts.time
    const played = auto || given !== undefined
    const time = auto ? AUTO_TIME : (given ?? (screens > 1.3 ? STEP_TIME * 1.45 : STEP_TIME))
    glide.scrollTo(y, { duration: time, easing: auto ? easeAuto : easePlay, force: true })
    clearTimeout(timer)
    stepAt = performance.now()
    stepMs = time * 1000
    queued = 0
    // a step that plays something out is played all but to its end before the next may start; a new scroll that came in
    // on the way (the same way) is taken the moment it lets go, so a page never sits waiting for the scroll to be repeated
    timer = window.setTimeout(
      () => {
        moving = false
        const q = queued
        queued = 0
        if (q) {
          spent = true
          sum = 0
          // (landed in a free stretch: on through it the same way as any scroll there, never across it whole)
          // (where the step is landing, not where the glide is this moment, a pixel or two short of it)
          const at = going()
          const run = freeRun(q, at)
          if (run) {
            tourAim = null
            freeStep(q, run, at)
          } else step(q)
        }
      },
      time * 1000 * (auto ? 1 : played ? PLAY_HELD : STEP_HELD),
    )
  }
  const step = (dir: number) => {
    const stops = dir < 0 && opts.back ? opts.back() : stopsOf()
    const y = going()
    const to = dir > 0 ? stops.find((s) => s > y + 4) : [...stops].reverse().find((s) => s < y - 4)
    if (to !== undefined) moveTo(to)
  }

  /** the free stretch (a section that plays with the scroll) the page is in, going that way, if any */
  const freeRun = (dir: number, at: number) =>
    opts.free?.(dir).find(([a, b]) => (dir > 0 ? at >= a - 4 && at < b - 4 : at > a + 4 && at <= b + 4))
  /** one scroll through a free stretch: the same way on whatever the scroll (a slow notch or a hard swipe alike, never
   * flown through by one swipe), gliding there, from where the last was going; near its end, onto its end */
  const freeStep = (dir: number, run: [number, number], at: number) => {
    const end = dir > 0 ? run[1] : run[0]
    const to = (tourAim ?? at) + dir * window.innerHeight * TOUR_STEP
    if (dir > 0 ? to >= end - window.innerHeight * 0.15 : to <= end + window.innerHeight * 0.15) {
      tourAim = null
      spent = true
      landed = true
      sum = 0
      moveTo(end)
      return
    }
    tourAim = to
    glide.scrollTo(to, { duration: TOUR_TIME, easing: easePlay, force: true })
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
    // section whose steps play out, a new notch once the step has landed is a new scroll (the tail of a swipe only ever
    // dies away, so it never is)
    const again = strong && !landed && (opts.time === undefined || !moving)
    // Home's tour (the page's free run, not a section's steps): every scroll goes the same way on, a slow notch or a hard
    // swipe alike, gliding there; the next notch or swipe goes on from where the last was going, and one that would
    // reach the end of the tour lands on the screen after it
    if (!own && !moving) {
      const { lo } = zone()
      if (!glide.isScrolling) tourAim = null
      // gliding on through the white to the screen after the tour: the rest of this scroll is spent on the way, and a
      // new one goes on from that screen, as from any
      if (tourAim !== null && tourAim >= lo - 4 && dir > 0 && lo > 0 && lo < Infinity) {
        e.preventDefault()
        e.stopPropagation()
        if (fresh) {
          const n = stopsOf().find((s) => s > lo + 4)
          tourAim = null
          spent = true
          landed = true
          sum = 0
          if (n !== undefined) moveTo(n)
        }
        return
      }
      const at = tourAim ?? window.scrollY
      if (lo > 0 && lo < Infinity && (dir > 0 ? at < lo - 4 : at <= lo + 4 && at > 4)) {
        e.preventDefault()
        e.stopPropagation()
        if (!fresh) return
        // a screen of the tour a scroll: on to the next of its views (its words, the labels inside the mesh), never left
        // between two
        const vh = window.innerHeight
        const to = (dir > 0 ? Math.floor(at / vh + 0.1) + 1 : Math.ceil(at / vh - 0.1) - 1) * vh
        // (into the white at the tour's end: from there the page plays on by itself to the screen after it)
        // (the same glide as the way back up through it, mirrored)
        if (dir > 0 && to >= lo - window.innerHeight * TOUR_WHITE) {
          const next = stopsOf().find((s) => s >= lo - 4)
          if (next === undefined) return
          tourAim = next
          glide.scrollTo(next, { duration: AUTO_TIME * 0.75, easing: easeAuto, force: true })
          return
        }
        // (back up out of the white, or from the screen after it: through it to the tour's last words, the same way)
        const white = lo - window.innerHeight * TOUR_WHITE
        const back = dir < 0 && at > white + 4
        tourAim = back ? Math.min(to, lo - window.innerHeight * 2) : Math.max(0, to)
        glide.scrollTo(tourAim, { duration: back ? AUTO_TIME * 0.75 : TOUR_TIME, easing: back ? easeAuto : easePlay, force: true })
        return
      }
    }
    if (!moving) {
      const { lo, hi, auto } = zone()
      const at = going()
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
        // (a free run that ends on a screen of its own lands on it: Home's tour, at About)
        const next = auto ? stopsOf().find((s) => s >= lo - 4) : lo
        if (next !== undefined) moveTo(next, auto && next > lo + 4)
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
      // through a free stretch: every scroll the same way on through it (a new notch or swipe, never the tail of one)
      const run = freeRun(dir, at)
      if (run) {
        goal = null
        e.preventDefault()
        e.stopPropagation()
        if (!glide.isScrolling) tourAim = null
        if (fresh || strong) freeStep(dir, run, at)
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
      if (dir === goingDir) {
        turn = 0
        // a new scroll the same way, well on into the step (a fresh notch or swipe, never the tail of this one): kept, and
        // taken as soon as the step lets go
        if ((fresh || strong) && performance.now() - stepAt >= stepMs * QUEUE_FROM) queued = dir
      } else if (e.timeStamp - turnedAt > TURN_HELD && Math.abs((turn = (fresh ? 0 : turn) + d)) >= TURN_NUDGE) {
        queued = 0
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
      const y = going()
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
      // and so it does in a free stretch: its run is the scroll itself, and stops where it is let go; save just short of
      // its end, where it is taken the rest of the way (else the next scroll would go only that far, and stop)
      const run = opts.free?.(0).find(([a, b]) => y > a + 4 && y < b - 4)
      if (run) {
        if (run[1] - y < window.innerHeight * NEAR_END) moveTo(run[1])
        return
      }
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
