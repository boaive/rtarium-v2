import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { StageLabel, useOrbitDrag, useStageRegion } from '../three/Stage'
import { setShared, stage, useStageValue } from '../three/stageStore'
import { PHONE_TRAVEL, tourWash } from '../three/poses'
import { Lines } from '../components/Chapter'
import { Link } from '../lib/router'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY, setAsideSmoothScroll } from '../lib/scroll'

/** the screens of the opening tour: the piece, the mesh built out, the cavity, the light */
const SCREENS = 4
/**
 * On a phone the tour names nothing in the cavity: after its line ("An open core", over the mesh seen from just above)
 * one swipe sends the camera down between the faces and on along the cavity, through the mesh, into the white, and
 * About comes out of it. Its screens: the opening, the mesh built out, the line, the flight, the white. Each is a place
 * on the tour (`at`, as on a wide screen: 1 built, 2 between the faces, 2.5 all white): the camera is down between the
 * faces half way into the flight's screen, holds there (in the yellow) while it flies on, and the white comes in over
 * the last of it. A phone's tour ends in the white: it does not come back out onto the mesh.
 */
const PHONE_KEYS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 1.72],
  [2.5, 2],
  [3.3, 2.03],
  // (all white by where the white hands over to About: HANDOFF.at)
  [3.85, 2.5],
  [5, 2.5],
]
const PHONE_SCREENS = 5
/** the screens a phone's swipe stops on in the tour (then About's top): the opening, the mesh built out, the line */
const PHONE_STOPS = [0, 1, 2]
/** on a phone, where the flight along the cavity sets off and where it has gone its whole way (screens) */
const FLIGHT: [number, number] = [2.5, 4]
function phoneTour(s: number) {
  for (let k = 1; k < PHONE_KEYS.length; k++) {
    const [s1, p1] = PHONE_KEYS[k]
    const [s0, p0] = PHONE_KEYS[k - 1]
    if (s <= s1) return p0 + ((s - s0) / (s1 - s0)) * (p1 - p0)
  }
  return PHONE_KEYS[PHONE_KEYS.length - 1][1]
}
/** the height of one of a phone's tour screens (all alike, the section their stack) */
const screenH = (el: HTMLElement) => el.offsetHeight / PHONE_SCREENS
/** on a phone, how far on along the cavity the camera has flown (m): evenly with the page, from the flight's start to its end */
const phoneDive = (s: number) => PHONE_TRAVEL * Math.min(1, Math.max(0, (s - FLIGHT[0]) / (FLIGHT[1] - FLIGHT[0])))

/**
 * The opening tour, the one vertical sequence on the page tied to the scroll. Four screens: the
 * headline beside a piece of mesh lying on the yellow ground; the mesh built out to the edges of
 * the screen while the headline dissolves into it; the camera between the two faces, on into white
 * light; out of the white, close on the mesh; and, as About comes up, drawing back from it as About's
 * first view, so the two meet without a cut. The scroll position
 * is damped into `stage.tour` (0..4) every frame and written to `--p` for the copy; how far the
 * tour has gone into the light is written to `--wash` for the ground.
 */
function useTour(section: RefObject<HTMLElement | null>, onScreen: (i: number) => void, phone: boolean) {
  const screenCb = useRef(onScreen)
  screenCb.current = onScreen
  useEffect(() => {
    const el = section.current
    if (!el) return
    const root = document.documentElement
    // a phone: --wash goes only on the two things that read it (the ground's wash, the tour's words), never on the
    // page's root, where each change would make the browser restyle the whole page, every frame of the tour
    const washOn = phone ? ([document.querySelector<HTMLElement>('.ground'), el].filter(Boolean) as HTMLElement[]) : [root]
    let washText = ''
    let pText = ''
    let raf = 0
    let last = performance.now()
    let p = -1
    let dive = -1
    let shown = -1
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      // one screen more than it has: leaving the light, the tour carries on into About's first view
      const screens = phone ? PHONE_SCREENS : SCREENS
      // (a phone's tour is measured by its own screens, as tall as the screen with its address bar showing: measured by
      // the window, which grows as the bar slides away, the page at rest on a screen would read as part way to it)
      const at = Math.min(screens, Math.max(0, -r.top / (phone ? screenH(el) : vh)))
      const target = phone ? phoneTour(at) : at
      // (a phone scrolls natively, the finger's own pace: the tour keeps up with it, a hair behind to smooth the steps)
      p = p < 0 || prefersReducedMotion() ? target : damp(p, target, phone ? 30 : 10, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      const deep = phone ? phoneDive(at) : 0
      dive = dive < 0 || prefersReducedMotion() ? deep : damp(dive, deep, phone ? 30 : 10, dt)
      if (Math.abs(dive - deep) < 1e-4) dive = deep
      stage.tour = p
      stage.tourDive = dive
      stage.wash = tourWash(p)
      // (written only when they change: an unchanged write still costs the browser a restyle)
      const pNext = p.toFixed(phone ? 3 : 4)
      if (pNext !== pText) el.style.setProperty('--p', (pText = pNext))
      // (a phone's tour ends in the white and About rises out of it on the same warm white: the wash holds whole until the
      // tour's last screen has left, then goes, so the screens after it keep their own grounds)
      const washNext = (phone && r.bottom <= 1 ? 0 : stage.wash).toFixed(phone ? 3 : 4)
      if (washNext !== washText) for (const w of washOn) w.style.setProperty('--wash', (washText = washNext))
      // the header and the labels follow the ground: yellow, then the white of the light
      if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) setShared({ chapter: 'hero', step: 0, ground: stage.wash > 0.5 ? 'light' : 'yellow' })
      const i = Math.min(screens - 1, Math.max(0, Math.round(at)))
      if (i !== shown) {
        shown = i
        screenCb.current(i)
      }
      if (p !== target || dive !== deep) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
      cancelAnimationFrame(raf)
      for (const w of washOn) w.style.removeProperty('--wash')
    }
  }, [section, phone])
}

/** the points named in the cavity (a wide screen's: a phone names nothing there) */
const POINTS = [
  { anchor: 'tour-face-a', name: 'Upper basalt face' },
  { anchor: 'tour-fibres', name: 'Connecting fibres' },
  { anchor: 'tour-face-b', name: 'Lower basalt face' },
]

/**
 * A phone's hand-over from the white to About: how far into its white screen it starts (screens); how long the page is
 * held on About under the curtain at least, how long a fling must have been quiet before it is let go, and the most it
 * is held (ms); how long About takes to come out of the white (ms); and the same hold and quiet in frames too, so a
 * slow frame never ends the hold early
 */
// (it starts as the glide is all but into the white, 91% of it, the curtain the same white: sooner, all but unseen)
const HANDOFF = { at: PHONE_SCREENS - 1 - 0.15, hold: 25, quiet: 25, most: 2400, fade: 220, frames: 2, quietFrames: 1 }

/**
 * A phone's tour ends in the white, and About does not scroll up into it: once the page goes on down into the white past
 * its top (the flight through the cavity: useSwipePager; however fast), a warm-white curtain holds the screen and the page is set on About's first view. A fling still
 * running is held there under the curtain (put back each frame it pushes the page on) until it has died out, so even a
 * hard flick lands on About's first view, never past it; then the curtain clears and About comes out of the white.
 * From there the page scrolls as any page does; going back up, it scrolls back through the white into the cavity.
 */
/** the way back from About into the tour, the hand-off's own (useWhiteHandoff), for the swipe pager to take */
type Back = { current: ((to: number) => void) | null }

function useWhiteHandoff(section: RefObject<HTMLElement | null>, curtain: RefObject<HTMLDivElement | null>, phone: boolean, back: Back) {
  useEffect(() => {
    const el = section.current
    const veil = curtain.current
    if (!phone || !el || !veil) return
    let lastY = window.scrollY
    let lastAt = -el.getBoundingClientRect().top / screenH(el)
    /** handed over, until the page is back above the white */
    let done = false
    let clear = 0
    let pin = 0
    /** where the page is held while the curtain is up, and when a fling last pushed it off */
    const held = { target: 0, moved: 0 }
    /** a fling (or a finger) still pushing the page on: put back on About's first view, out of sight under the curtain */
    const putBack = () => {
      if (Math.abs(window.scrollY - held.target) <= 1) return
      window.scrollTo({ top: held.target, behavior: 'instant' as ScrollBehavior })
      held.moved = performance.now()
    }
    const land = (target: number) => {
      const start = performance.now()
      held.target = target
      held.moved = start
      let frames = 0
      let quiet = 0
      /** the push the last frame knew of */
      let seen = start
      const hold = () => {
        const now = performance.now()
        putBack()
        lastY = window.scrollY
        frames++
        // (a frame after a push, put back here or by a scroll event since the last frame, is not a quiet one)
        if (held.moved !== seen) {
          seen = held.moved
          quiet = 0
        } else quiet++
        const settled = now - start >= HANDOFF.hold && now - held.moved >= HANDOFF.quiet && frames >= HANDOFF.frames && quiet >= HANDOFF.quietFrames
        if (!settled && now - start < HANDOFF.most) {
          pin = requestAnimationFrame(hold)
          return
        }
        pin = 0
        // still now: the curtain clears, and About comes out of the white
        veil.classList.add('is-clearing')
        veil.classList.remove('is-on')
        window.clearTimeout(clear)
        clear = window.setTimeout(() => veil.classList.remove('is-clearing'), prefersReducedMotion() ? 0 : HANDOFF.fade)
      }
      pin = requestAnimationFrame(hold)
    }
    const onScroll = () => {
      // (held under the curtain: every push of a fling is put back at once)
      if (pin) return putBack()
      const y = window.scrollY
      const down = y > lastY
      lastY = y
      const at = -el.getBoundingClientRect().top / screenH(el)
      const from = lastAt
      lastAt = at
      // (back up on the white, or above it: the next swipe down from it hands over again)
      if (at <= PHONE_SCREENS - 0.5) done = false
      // crossing into the white going down, from the tour's last part (a hard flick may cross it, and even About's top,
      // in one go); a jump from elsewhere (a link in the menu, the page opened on a chapter) is never caught
      if (done || !down || from >= HANDOFF.at || at < HANDOFF.at) return
      if (from < HANDOFF.at - 3 || at > PHONE_SCREENS + 2) return
      done = true
      stage.heldAt = performance.now()
      // the curtain, at once: the screen is already the white it is
      veil.classList.remove('is-clearing')
      veil.classList.add('is-on')
      const target = el.offsetTop + el.offsetHeight
      window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
      lastY = window.scrollY
      lastAt = PHONE_SCREENS
      land(target)
    }
    /*
     * Back up from About, the way down in reverse: About fades to the white, the page is set in the white (the tour's
     * last screen, all white by then), the curtain lifts unseen, and the page glides out of the white to `to`
     */
    let away = 0
    back.current = (to: number) => {
      stage.heldAt = performance.now()
      veil.classList.add('is-clearing')
      requestAnimationFrame(() => veil.classList.add('is-on'))
      window.clearTimeout(away)
      away = window.setTimeout(() => {
        window.scrollTo({ top: el.offsetTop + (PHONE_SCREENS - 1) * screenH(el), behavior: 'instant' as ScrollBehavior })
        lastY = window.scrollY
        lastAt = PHONE_SCREENS - 1
        done = false
        // (two frames for the white to take the ground and the 3D under it, then the curtain goes and the glide sets off)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            veil.classList.remove('is-clearing', 'is-on')
            window.scrollTo({ top: to, behavior: 'smooth' })
          }),
        )
      }, prefersReducedMotion() ? 0 : HANDOFF.fade)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(clear)
      window.clearTimeout(away)
      cancelAnimationFrame(pin)
      back.current = null
    }
  }, [section, curtain, phone, back])
}

/**
 * A phone's swipe: how far the finger must go (share of the screen), or how fast (px/ms), to move on a stop; and how
 * long the page must have been still before a page left between two stops is brought to the nearer (ms)
 */
const SWIPE = { reach: 0.06, flick: 0.45, settle: 140 }
/** a glide's length (ms): a screen's, more for each screen past the first, and the most */
const GLIDE_MS = { screen: 640, more: 240, most: 1100 }
/**
 * the flight through the cavity, from the line into the white (ms): an even pace, neither slow nor fast, that sets off
 * the moment the finger lets go and eases a little at either end (About takes over in the white, ~88% of the way)
 */
const FLIGHT_MS = 2500
const flightEase = (t: number) => 0.5 * t + 0.25 * (1 - Math.cos(Math.PI * t))

/**
 * A stretch of a phone's Home that goes a stop a swipe: its stops, top to bottom (px), and where a swipe on out of its
 * last stop goes (null: nowhere of its own, the page scrolls on freely)
 */
interface Zone {
  stops: number[]
  after: number | null
  /** the tour's: its last stop is About's top, reached from the tour, never a stop a swipe from it sets off from going down */
  tour?: boolean
}

/**
 * The stretches of a phone's Home that go a stop a swipe: the tour, its screens to the cavity's line and on (one swipe,
 * the flight through the cavity and the white) to About's top; and a section that names its own stops (`data-swipe-stops`,
 * shares of its run: What it replaces, a card a swipe), and one more on to the section after it. Everywhere else the page
 * scrolls freely.
 */
function pagedZones(tour: HTMLElement): Zone[] {
  const vh = window.innerHeight
  const sh = screenH(tour)
  const aboutTop = Math.round(tour.offsetTop + tour.offsetHeight)
  // (the flight and the white are no stops: from the line one swipe flies through them to About)
  const zones: Zone[] = [{ stops: [...PHONE_STOPS.map((k) => Math.round(tour.offsetTop + k * sh)), aboutTop], after: null, tour: true }]
  for (const p of document.querySelectorAll<HTMLElement>('[data-swipe-stops]')) {
    const top = p.getBoundingClientRect().top + window.scrollY
    // (its run: what its pinned panel, `data-swipe-pin`, stands still through)
    const pin = p.querySelector<HTMLElement>('[data-swipe-pin]')
    const run = Math.max(1, p.offsetHeight - (pin?.offsetHeight ?? vh))
    const stops = (p.dataset.swipeStops ?? '')
      .split(',')
      .map(Number)
      .filter(Number.isFinite)
      .map((f) => Math.round(top + f * run))
    if (stops.length) zones.push({ stops, after: Math.round(top + p.offsetHeight) })
  }
  return zones
}

/** the zone the page stands in at `y` going `dir` (0: either way), if any */
function zoneAt(zones: Zone[], y: number, dir: number) {
  return zones.find((z) => {
    const first = z.stops[0]
    const last = z.stops[z.stops.length - 1]
    // (the tour's last stop, About's top, belongs to it only going back up: down from there the page is free)
    if (z.tour && Math.abs(y - last) < 3) return dir < 0
    return y > first - 3 && y < last + 3
  })
}

const nearestOf = (stops: number[], y: number) => stops.reduce((a, s) => (Math.abs(s - y) < Math.abs(a - y) ? s : a), stops[0])

/**
 * A phone's Home goes a stop a swipe where a stop a swipe tells the story (pagedZones): the tour, a screen a swipe and
 * then one swipe that flies through the cavity and the white to About (a flight of its own pace, the finger's swipe only
 * setting it off); and the deck of What it replaces, a card a swipe and one on to Innovation. There,
 * while the finger is down the page is the browser's own and follows it exactly; once it lets go, the page goes on to
 * the next stop that way (never past it, however hard the flick), or back to the one it set off from if the swipe was a
 * small one, in the browser's own smooth scroll (run off the page's thread, so it keeps its pace while the 3D draws).
 * Everywhere else the page scrolls freely, with the finger and its fling; and a page that comes to rest inside a paged
 * stretch between two stops (a fling run on into it) is brought to the nearer. A touch that took a mesh in hand, or that
 * the white handed over to About, is left alone; back up from About's top the way is the white's (useWhiteHandoff).
 */
function useSwipePager(section: RefObject<HTMLElement | null>, phone: boolean, back: Back) {
  useEffect(() => {
    const el = section.current
    if (!phone || !el || prefersReducedMotion()) return
    // (the smooth scroll set aside: written a frame behind the page, it would pull at the page's own glides)
    const bringBack = setAsideSmoothScroll()
    const touch = { y: 0, x: 0, t: 0, at: 0, from: 0, down: false, multi: false }
    /** where the last glide was going, and until when it runs (ms) */
    let aim: number | null = null
    let aimUntil = 0
    /** the flight through the cavity under way: the page is the flight's until the white hands it to About */
    let flying = false
    /*
     * The glide to a stop: away at once and settling softly (an expo ease-out, as a smooth-scroll's), stepped frame by
     * frame with the 3D, so the mesh and the page move as one. (The browser's own smooth scroll set off slowly and ran on
     * a track of its own: on a phone, drawing the 3D at fewer frames than the page scrolled, the mesh trailed the page.)
     * A finger on the screen stops it where it is; the white handing over to About takes it from there.
     * The flight through the cavity (`flight`) goes at its own even pace instead, and a finger does not stop it: it is
     * one short move from the line to About, which the white hands over to as it comes in.
     */
    let anim = 0
    const glide = (to: number, flight = false) => {
      cancelAnimationFrame(anim)
      flying = false
      const from = window.scrollY
      const far = to - from
      aim = to
      if (Math.abs(far) < 1) return
      const ms = flight ? FLIGHT_MS : Math.min(GLIDE_MS.most, GLIDE_MS.screen + Math.max(0, Math.abs(far) / window.innerHeight - 1) * GLIDE_MS.more)
      const t0 = performance.now()
      aimUntil = t0 + ms + 100
      flying = flight
      const frame = (now: number) => {
        if ((touch.down && !flight) || stage.heldAt > t0) return void (flying = false)
        const t = Math.min(1, (now - t0) / ms)
        const eased = t >= 1 ? 1 : flight ? flightEase(t) : 1 - Math.pow(2, -10 * t)
        window.scrollTo({ top: from + far * eased, behavior: 'instant' as ScrollBehavior })
        if (t < 1) anim = requestAnimationFrame(frame)
        else flying = false
      }
      anim = requestAnimationFrame(frame)
    }
    const gliding = () => flying || (aim !== null && performance.now() < aimUntil && Math.abs(window.scrollY - aim) > 2)
    /** (a finger dragging during the flight would pull the page against it: the page is the flight's) */
    const hold = (e: TouchEvent) => {
      if (flying && e.cancelable) e.preventDefault()
    }
    const start = (e: TouchEvent) => {
      touch.multi = e.touches.length !== 1
      const t = e.touches[0]
      if (!t) return
      touch.down = true
      touch.y = t.clientY
      touch.x = t.clientX
      touch.t = e.timeStamp
      touch.at = performance.now()
      // (a swipe during a glide sets off from where that glide was going)
      touch.from = gliding() && aim !== null ? aim : window.scrollY
    }
    const end = (e: TouchEvent) => {
      touch.down = false
      const t = e.changedTouches[0]
      if (touch.multi || !t || flying) return
      // a mesh taken in hand, or the white handing over to About, during this touch: not a swipe of the page
      if (stage.heldAt >= touch.at) return
      const dy = touch.y - t.clientY
      const dx = touch.x - t.clientX
      if (Math.abs(dx) > Math.abs(dy)) return
      const vh = window.innerHeight
      const speed = Math.abs(dy) / Math.max(1, e.timeStamp - touch.t)
      const dir = Math.abs(dy) > vh * SWIPE.reach || (speed > SWIPE.flick && Math.abs(dy) > 12) ? Math.sign(dy) : 0
      const zones = pagedZones(el)
      const zone = zoneAt(zones, touch.from, dir)
      if (!zone) {
        // a swipe from where the page scrolls freely that has drawn it on into a paged stretch (the deck): to that
        // stretch's first stop going down, its last going up, never through it
        const into = zones.find((z) => !z.tour && zoneAt([z], window.scrollY, 0))
        if (into) glide(dir < 0 ? into.stops[into.stops.length - 1] : into.stops[0])
        // (otherwise the browser's own)
        return
      }
      step(zone, touch.from, dir)
    }
    /** a swipe (or a wheel's turn) `dir` from `from` in a paged stretch: on to the stop that way, or back to the one it left */
    const step = (zone: Zone, from: number, dir: number) => {
      const { stops } = zone
      const y = window.scrollY
      const i = stops.indexOf(nearestOf(stops, from))
      if (dir === 0) return glide(nearestOf(stops, y))
      if (dir > 0) {
        // the next stop on from where the swipe set off; past it already (a long drag), the next past where the page is;
        // on from the last, where the stretch hands the page on (or nowhere: the page goes on freely)
        if (i === stops.length - 1) return zone.after !== null ? glide(zone.after) : undefined
        // on from the tour's line: the flight through the cavity into the white, where About takes over
        if (zone.tour && i === stops.length - 2) return glide(Math.round(el.offsetTop + (PHONE_SCREENS - 1) * screenH(el)), true)
        const next = stops[i + 1]
        return glide(y > next + 4 ? (stops.find((s) => s > y + 4) ?? stops[stops.length - 1]) : next)
      }
      // back up from About's top into the tour: the way down, in reverse (About fades to the white, out of it into the cavity)
      if (zone.tour && i === stops.length - 1 && back.current) return back.current(stops[i - 1])
      // (back out of the first stop: the page goes on freely)
      if (i === 0) return
      const prev = stops[i - 1]
      return glide(y < prev - 4 ? ([...stops].reverse().find((s) => s < y - 4) ?? stops[0]) : prev)
    }
    /*
     * A wheel or a trackpad on a phone-sized window (a desktop's phone view, a tablet with a trackpad), the same as a
     * swipe in a paged stretch: a turn of it (a notch, or a whole swipe of the pad, its momentum included) a stop. Left
     * to scroll freely there, it stopped wherever it ran out, in the white as often as not, a blank screen.
     */
    const wheelSeen = { at: -Infinity, dir: 0, size: 0, freshAt: -Infinity }
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || !e.deltaY) return
      // (the flight is under way: a wheel's turn neither stops it nor pulls the page against it)
      if (flying) return e.preventDefault()
      const dir = Math.sign(e.deltaY)
      const from = gliding() && aim !== null ? aim : window.scrollY
      const zone = zoneAt(pagedZones(el), from, dir)
      if (!zone) return
      e.preventDefault()
      // a new turn: after a pause, the other way, or (a trackpad's momentum still dying away) one markedly stronger than
      // the tail it lands on, never the tail itself
      const size = Math.abs(e.deltaY)
      const fresh = e.timeStamp - wheelSeen.at > 160 || dir !== wheelSeen.dir || (size >= 30 && size > wheelSeen.size * 2 && e.timeStamp - wheelSeen.freshAt > 260)
      wheelSeen.at = e.timeStamp
      wheelSeen.dir = dir
      wheelSeen.size = size
      if (!fresh || performance.now() - stage.heldAt < 400) return
      wheelSeen.freshAt = e.timeStamp
      step(zone, from, dir)
    }
    /** a page come to rest inside a paged stretch between two of its stops (a fling run on into it): to the nearer */
    let quiet = 0
    const settle = () => {
      if (touch.down || gliding() || performance.now() - stage.heldAt < 1500) return
      const y = window.scrollY
      const zone = zoneAt(pagedZones(el), y, 0)
      if (!zone) return
      const near = nearestOf(zone.stops, y)
      if (Math.abs(near - y) > 3) glide(near)
    }
    /*
     * A page carried by its own momentum (a fling, a wheel or a trackpad from where it scrolls freely) into a paged stretch
     * (the deck) is caught at the stretch's first stop going down, its last going up, and held there a moment while the
     * momentum dies: it ran on through every card before, the whole deck stacked in one swipe
     */
    let lastY = window.scrollY
    const caught = { y: 0, until: 0 }
    const scrolled = () => {
      window.clearTimeout(quiet)
      quiet = window.setTimeout(settle, SWIPE.settle)
      const y = window.scrollY
      const was = lastY
      lastY = y
      if (performance.now() < caught.until) {
        if (Math.abs(y - caught.y) > 1) window.scrollTo({ top: caught.y, behavior: 'instant' as ScrollBehavior })
        lastY = caught.y
        return
      }
      if (touch.down || gliding()) return
      for (const z of pagedZones(el)) {
        if (z.tour) continue
        const first = z.stops[0]
        const last = z.stops[z.stops.length - 1]
        const at = was < first - 2 && y > first + 2 ? first : was > last + 2 && y < last - 2 ? last : null
        if (at === null) continue
        caught.y = at
        caught.until = performance.now() + 320
        window.scrollTo({ top: at, behavior: 'instant' as ScrollBehavior })
        lastY = at
        return
      }
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', hold, { passive: false })
    window.addEventListener('touchend', end, { passive: true })
    const cancel = () => void (touch.down = false)
    window.addEventListener('touchcancel', cancel, { passive: true })
    window.addEventListener('scroll', scrolled, { passive: true })
    window.addEventListener('wheel', wheel, { passive: false })
    return () => {
      window.clearTimeout(quiet)
      window.removeEventListener('wheel', wheel)
      cancelAnimationFrame(anim)
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', hold)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
      window.removeEventListener('scroll', scrolled)
      bringBack()
    }
  }, [section, phone, back])
}

export function Hero() {
  const section = useRef<HTMLElement>(null)
  const open = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const failed = useStageValue('failed')
  useStageRegion(section, () => 'hero')
  useOrbitDrag(open)
  const compact = useIsCompact()
  useTour(section, setAt, compact)
  const curtain = useRef<HTMLDivElement>(null)
  const back = useRef<((to: number) => void) | null>(null)
  useWhiteHandoff(section, curtain, compact, back)
  useSwipePager(section, compact, back)

  // the scroll cue starts the tour: one screen down
  const start = () => {
    const el = section.current
    if (!el) return
    scrollToY(el.offsetTop + window.innerHeight)
  }
  const state = (i: number) => (at === i ? 'is-active' : at > i ? 'is-seen' : '')

  return (
    <>
      {/* the tour scrolls freely, both ways (the scroll is the animation), down into the cavity and on through the white
          to About's first view; on a phone the finger moves it natively, the mesh in step with it */}
      <section ref={section} className="hero" aria-labelledby="hero-title" data-pass-screen={(compact ? PHONE_SCREENS : SCREENS) - 1} data-free-scroll="">
        <div ref={open} className={`hero__screen hero__screen--open scene ${state(0)}`} data-screen="yellow">
          {failed && <img className="hero__still" src="/img/render-structure.webp" alt="" />}
          <div className="hero__copy">
            {/* on scroll the headline drifts into the mesh and dissolves (--p) */}
            <Lines as="h1" id="hero-title" className="hero__title" lines={['Introducing', 'RTARIUM.']} />
            <div className="hero__sub">
              <p className="hero__lede rv" style={{ '--i': 2 } as CSSProperties}>
                A three-dimensional basalt mesh for advanced concrete applications.
              </p>
              <Link to="/contact" className="explore rv" style={{ '--i': 3 } as CSSProperties}>
                <span className="explore__label">Talk to our team</span>
                <span className="explore__cell" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </span>
              </Link>
            </div>
          </div>
          <div className="hero__scroll">
            <button type="button" className="cue rv" style={{ '--i': 4 } as CSSProperties} onClick={start} aria-label="Scroll to explore: start the tour of the mesh">
              <span className="cue__track" aria-hidden="true">
                <i />
              </span>
              <span className="cue__text">Scroll to explore</span>
            </button>
          </div>
        </div>

        <div className={`hero__screen hero__screen--built scene ${state(1)}`} data-screen="yellow">
          <div className="hero__say hero__say--br">
            <Lines slab lines={['Two basalt faces,', 'woven as one.']} />
          </div>
        </div>

        <div className={`hero__screen hero__screen--inside scene ${state(2)}`} data-screen="yellow">
          <div className="hero__say hero__say--tr">
            <Lines slab lines={['An open core', 'for concrete.']} />
          </div>
        </div>

        {/* a phone: the flight on along the cavity, through the mesh, the words gone and nothing named */}
        {compact && <div className={`hero__screen hero__screen--flight scene ${state(3)}`} data-screen="yellow" />}

        {/* on through the cavity into white light, and out of it onto the mesh: the 3D alone, no words */}
        <div className={`hero__screen scene ${state(compact ? 4 : 3)}`} data-screen="yellow" />
      </section>
      {/* the cavity's points, named on a wide screen only */}
      {!compact &&
        POINTS.map((t, i) => (
          <StageLabel key={t.anchor} anchor={t.anchor} column={0.24} className="pin--point">
            <span className="pin__n num">0{i + 1}</span>
            <span className="pin__name">{t.name}</span>
          </StageLabel>
        ))}
      <CavityDimension />
      {/* a phone's hand-over from the white to About (useWhiteHandoff) */}
      {compact && <div ref={curtain} className="hero__curtain" aria-hidden="true" />}
    </>
  )
}

function CavityDimension() {
  const t = useStageValue('thickness')
  return (
    <StageLabel anchor="tour-gap" span="tour-gap-b" wideOnly>
      {t} mm
    </StageLabel>
  )
}
