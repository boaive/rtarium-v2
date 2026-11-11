import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { StageLabel, useOrbitDrag, useStageRegion } from '../three/Stage'
import { setShared, stage, useStageValue } from '../three/stageStore'
import { PHONE_POINTS, tourWash } from '../three/poses'
import { Lines } from '../components/Chapter'
import { Link } from '../lib/router'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY, setAsideSmoothScroll } from '../lib/scroll'

/** the screens of the opening tour: the piece, the mesh built out, the cavity, the light */
const SCREENS = 4
/**
 * On a phone the cavity has screens of its own after its line, one for each point named in it, while the camera
 * holds between the faces: the opening, the mesh built out, the line, three points, the light. Each screen is a
 * place on the tour (`at`, as on a wide screen: 1 built, 2 between the faces, 2.5 all white). A phone's tour ends in
 * the white: it does not come back out onto the mesh, and About, on the same warm white, rises out of it.
 */
const PHONE_KEYS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 1.72],
  [3, 2],
  [4, 2],
  [5, 2],
  [6, 2.5],
  [7, 2.5],
]
const PHONE_SCREENS = PHONE_KEYS.length - 1
/** the screen of the cavity's first point, on a phone */
const FIRST_POINT = 3
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
/** on a phone, how far on along the cavity the camera has gone, a step for each point after the first (0..2) */
const phoneDive = (s: number) => Math.min(2, Math.max(0, s - FIRST_POINT))

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
      // a phone's cavity: each point named while its screen holds most of the view, none once the light comes
      stage.tourPoints = phone && i >= FIRST_POINT && i < FIRST_POINT + 3 && Math.abs(at - i) < 0.3 ? i - FIRST_POINT + 1 : 0
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

/** the points named in the cavity (on a phone, one at a time, each with its number) */
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
 * its top (a swipe from the cavity's last point: useSwipePager; however fast), a warm-white curtain holds the screen and the page is set on About's first view. A fling still
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

/** what a phone's page stops on, a swipe at a time, after the tour's screens: About and each part after it, each section */
const STOP_PARTS = '#main > section, #main .eb-row, footer'
/**
 * A phone's swipe: how far the finger must go (share of the screen), or how fast (px/ms), to move on a stop; stops
 * nearer each other than `near` (share of a screen) are one; a stretch longer than `long` between two stops gets stops
 * `step` apart in it, so every swipe goes about as far
 */
const SWIPE = { reach: 0.06, flick: 0.45, near: 0.4, long: 1.25, step: 0.9 }

/** where a phone's Home stops, top to bottom (px): the tour's screens up to the white, then About and the parts after */
function swipeStops(tour: HTMLElement) {
  const vh = window.innerHeight
  const sh = screenH(tour)
  // (the white, the tour's last screen, is no stop: from the cavity's last point one swipe goes through it to About)
  const ys = Array.from({ length: PHONE_SCREENS - 1 }, (_, k) => Math.round(tour.offsetTop + k * sh))
  for (const p of document.querySelectorAll<HTMLElement>(STOP_PARTS)) {
    if (p === tour || tour.contains(p)) continue
    // (a part keeps its own room for the header at its top: it comes to rest at its own top)
    ys.push(Math.round(p.getBoundingClientRect().top + window.scrollY))
  }
  ys.sort((a, b) => a - b)
  const max = document.documentElement.scrollHeight - vh
  const kept: number[] = []
  for (const y of ys) if (!kept.length || y - kept[kept.length - 1] >= vh * SWIPE.near) kept.push(y)
  const all: number[] = []
  // (a long stretch below the tour gets stops through it; the tour's own last stretch, through the white, none)
  const tourEnd = tour.offsetTop + tour.offsetHeight
  kept.forEach((y, i) => {
    all.push(y)
    const next = kept[i + 1] ?? max
    if (y < tourEnd - 2) return
    for (let at = y + vh * SWIPE.step; next - y > vh * SWIPE.long && next - at > vh * SWIPE.near; at += vh * SWIPE.step) all.push(Math.round(at))
  })
  if (max - all[all.length - 1] > vh * SWIPE.near) all.push(max)
  return all.map((y) => Math.min(max, y)).filter((y, i, a) => i === 0 || y > a[i - 1])
}

/**
 * A phone's Home goes a stop a swipe, everywhere alike: while the finger is down the page is the browser's own and
 * follows it exactly; once it lets go, the page goes on to the next stop that way (never past it, however hard the
 * flick), or back to the stop it set off from if the swipe was a small one, in the browser's own smooth scroll (run off
 * the page's thread, so it keeps its pace while the 3D draws). The stops: the tour's screens to the cavity's last point
 * (from it one swipe goes on through the white, and About comes out of it: useWhiteHandoff), then About and each of its
 * parts, and so on down. A touch
 * that took a mesh in hand, or that the white handed over to About, is left alone.
 */
function useSwipePager(section: RefObject<HTMLElement | null>, phone: boolean, back: Back) {
  useEffect(() => {
    const el = section.current
    if (!phone || !el || prefersReducedMotion()) return
    // (the smooth scroll set aside: written a frame behind the page, it would pull at the page's own glides)
    const bringBack = setAsideSmoothScroll()
    const touch = { y: 0, x: 0, t: 0, at: 0, base: 0, multi: false }
    let stops: number[] = []
    /** where the last glide was going, and when it set off */
    let aim: number | null = null
    let aimAt = 0
    const nearest = (y: number) => stops.reduce((a, s) => (Math.abs(s - y) < Math.abs(a - y) ? s : a), stops[0] ?? 0)
    const start = (e: TouchEvent) => {
      touch.multi = e.touches.length !== 1
      const t = e.touches[0]
      if (!t) return
      touch.y = t.clientY
      touch.x = t.clientX
      touch.t = e.timeStamp
      touch.at = performance.now()
      stops = swipeStops(el)
      // (a swipe during a glide sets off from where that glide was going)
      touch.base = aim !== null && performance.now() - aimAt < 900 ? aim : nearest(window.scrollY)
    }
    const end = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (touch.multi || !t || !stops.length) return
      // a mesh taken in hand, or the white handing over to About, during this touch: not a swipe of the page
      if (stage.heldAt >= touch.at) return
      const dy = touch.y - t.clientY
      const dx = touch.x - t.clientX
      if (Math.abs(dx) > Math.abs(dy)) return
      const vh = window.innerHeight
      const speed = Math.abs(dy) / Math.max(1, e.timeStamp - touch.t)
      const dir = Math.abs(dy) > vh * SWIPE.reach || (speed > SWIPE.flick && Math.abs(dy) > 12) ? Math.sign(dy) : 0
      const y = window.scrollY
      const i = stops.indexOf(touch.base)
      let to = nearest(y)
      if (dir > 0) {
        // the next stop on from where the swipe set off; past it already (a long drag), the next past where the page is
        const next = stops[Math.min(stops.length - 1, i + 1)]
        to = y > next + 4 ? (stops.find((s) => s > y + 4) ?? stops[stops.length - 1]) : next
      } else if (dir < 0) {
        const prev = stops[Math.max(0, i - 1)]
        to = y < prev - 4 ? ([...stops].reverse().find((s) => s < y - 4) ?? stops[0]) : prev
      }
      aim = to
      aimAt = performance.now()
      // back up from About into the tour: the way down, in reverse (About fades to the white, out of it into the cavity)
      const aboutTop = el.offsetTop + el.offsetHeight
      if (dir < 0 && Math.abs(touch.base - aboutTop) < 3 && to < aboutTop - 2 && back.current) return back.current(to)
      window.scrollTo({ top: to, behavior: 'smooth' })
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchend', end)
      bringBack()
    }
  }, [section, phone])
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

        {/* a phone: a screen for each point named in the cavity, one after another, the words gone */}
        {compact &&
          [0, 1, 2].map((k) => <div key={k} className={`hero__screen hero__screen--point scene ${state(FIRST_POINT + k)}`} data-screen="yellow" />)}

        {/* on through the cavity into white light, and out of it onto the mesh: the 3D alone, no words */}
        <div className={`hero__screen scene ${state(compact ? FIRST_POINT + 3 : 3)}`} data-screen="yellow" />
      </section>
      {/* (a phone's: each a step further along the cavity, where the camera stands for it) */}
      {POINTS.map((t, i) => (
        <StageLabel key={`${t.anchor}-${compact}`} anchor={compact ? PHONE_POINTS[i] : t.anchor} column={0.24} className="pin--point">
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
