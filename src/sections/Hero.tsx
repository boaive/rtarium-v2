import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { StageLabel, useOrbitDrag, useStageRegion } from '../three/Stage'
import { setShared, stage, useStageValue } from '../three/stageStore'
import { PHONE_POINTS, tourWash } from '../three/poses'
import { Lines } from '../components/Chapter'
import { Link } from '../lib/router'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { glideToY, scrollToY } from '../lib/scroll'

/** the screens of the opening tour: the piece, the mesh built out, the cavity, the light */
const SCREENS = 4
/**
 * On a phone the cavity has screens of its own after its line, one for each point named in it, while the camera
 * holds between the faces: the opening, the mesh built out, the line, three points, the light. Each screen is a
 * place on the tour (`at`, as on a wide screen: 1 built, 2 between the faces, 3 out of the light, 4 About).
 */
const PHONE_KEYS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 1.72],
  [3, 2],
  [4, 2],
  [5, 2],
  [6, 3],
  [7, 4],
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
      const at = Math.min(screens, Math.max(0, -r.top / vh))
      const target = phone ? phoneTour(at) : at
      p = p < 0 || prefersReducedMotion() ? target : damp(p, target, 10, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      const deep = phone ? phoneDive(at) : 0
      dive = dive < 0 || prefersReducedMotion() ? deep : damp(dive, deep, 10, dt)
      if (Math.abs(dive - deep) < 1e-4) dive = deep
      stage.tour = p
      stage.tourDive = dive
      stage.wash = tourWash(p)
      el.style.setProperty('--p', p.toFixed(4))
      root.style.setProperty('--wash', stage.wash.toFixed(4))
      // the header and the labels follow the ground: yellow, then the white of the light
      if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) setShared({ chapter: 'hero', step: 0, ground: stage.wash > 0.5 ? 'light' : 'yellow' })
      const i = Math.min(screens - 1, Math.max(0, Math.round(at)))
      // a phone's cavity: the points named so far, one more a screen, none once the light comes
      // (only with the page come to rest on that point's screen, never on the way to it)
      stage.tourPoints = phone && i >= FIRST_POINT && i < FIRST_POINT + 3 && Math.abs(at - i) < 0.04 && Math.abs(p - target) < 0.01 ? i - FIRST_POINT + 1 : 0
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
      root.style.removeProperty('--wash')
    }
  }, [section, phone])
}

/**
 * On a phone the page scrolls natively, but the tour goes a view at a time: each swipe, quick or slow, short or long,
 * glides it on (or back) one screen, from where the last was going, and nothing in between (the line, each of the
 * cavity's points, the light, About's first view). A swipe past its end, or up from below it, is the page's own again.
 * A page brought to rest between two views by the page's own scroll (a fling up into the tour) settles on the nearer.
 */
function useTourSwipes(section: RefObject<HTMLElement | null>, phone: boolean) {
  useEffect(() => {
    const el = section.current
    if (!phone || !el || prefersReducedMotion()) return
    const vh = () => window.innerHeight
    const top = () => el.offsetTop
    /**
     * The screens a swipe steps through: the tour's, on to About's first view. After it (and before it, at the top) the
     * page scrolls as any page does, at the finger's own pace.
     */
    const runs = () => [STOPS.map((k) => Math.round(top() + k * vh()))]
    /** the run the page stands inside, if any (on a stop within it, or between two) */
    const within = (y: number) => runs().find((r) => y > r[0] - 4 && y < r[r.length - 1] - 4)
    let aim: number | null = null
    let aimUntil = 0
    let touching = false
    let settle = 0
    const g = { y: 0, x: 0, taken: false, decided: false }
    const going = () => (aim !== null && performance.now() < aimUntil ? aim : window.scrollY)
    let guard = 0
    /** where the glide under way set out from */
    let from = 0
    /** stopped short on the glide's own way (between where it set out and where it was going), not taken off it */
    const short = () => aim !== null && Math.abs(window.scrollY - aim) > 2 && (window.scrollY - from) * (aim - window.scrollY) > 0
    const go = (y: number) => {
      from = window.scrollY
      aim = y
      // a screen in 0.72 s, quick to set off and settling without a long tail; a little longer the further it goes
      // (through the light to About, two screens, or on from a glide still under way)
      const far = Math.abs(y - window.scrollY) / vh()
      const ms = glideToY(y, Math.min(1.05, 0.72 + Math.max(0, far - 1) * 0.2)) * 1000
      aimUntil = performance.now() + ms + 60
      // a glide cut short (a touch that stopped it, say) never leaves the page between two views: it goes on to where
      // it was going
      clearTimeout(guard)
      guard = window.setTimeout(() => {
        if (aim === null || touching || !short()) return
        go(aim)
      }, ms + 150)
    }
    /** the views a swipe stops on: every screen of the tour but the light (out of the cavity it goes on, through the
     * white, straight to About's first view, and back the same way) */
    const STOPS = Array.from({ length: PHONE_SCREENS + 1 }, (_, k) => k).filter((k) => k !== PHONE_SCREENS - 1)
    /** the run a swipe that way, from where the page is going, is taken through (only from within it: from About on up, the page scrolls freely back to its first view, and steps from there) */
    const ours = (dir: number, at: number) =>
      runs().find((r) => (dir > 0 ? at >= r[0] - 4 && at < r[r.length - 1] - 4 : at > r[0] + 4 && at <= r[r.length - 1] + 4))
    const start = (e: TouchEvent) => {
      // (a finger set down while the page glides between two views does not stop it: the smooth scroll never hears it)
      if (aim !== null && performance.now() < aimUntil) e.stopPropagation()
      touching = true
      const t = e.touches[0]
      g.taken = false
      g.decided = e.touches.length !== 1
      if (t) {
        g.x = t.clientX
        g.y = t.clientY
      }
    }
    const move = (e: TouchEvent) => {
      if (g.taken) {
        if (e.cancelable) e.preventDefault()
        return
      }
      const t = e.touches[0]
      if (g.decided || !t) return
      const dy = g.y - t.clientY
      const dx = g.x - t.clientX
      // inside the tour the page never follows the finger, not even its first pixels
      const inside = !!within(window.scrollY)
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) {
        if (inside && e.cancelable) e.preventDefault()
        return
      }
      g.decided = true
      if (Math.abs(dx) > Math.abs(dy)) return
      const dir = Math.sign(dy)
      const at = going()
      const run = ours(dir, at)
      if (!run) return
      g.taken = true
      if (e.cancelable) e.preventDefault()
      next(dir, at, run)
    }
    /** on from `at` to the next view of the run that way */
    const next = (dir: number, at: number, all: number[]) => {
      const near = vh() * 0.1
      const to = dir > 0 ? all.find((y) => y > at + near) : [...all].reverse().find((y) => y < at - near)
      go(to ?? (dir > 0 ? all[all.length - 1] : all[0]))
    }
    /*
     * A wheel or a trackpad on a phone-sized window, the same: a scroll (a notch, or a whole swipe of the pad, however
     * hard, its momentum included) a view
     */
    let wheelAt = -Infinity
    let wheelDir = 0
    let wheelSize = 0
    let freshAt = -Infinity
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || !e.deltaY) return
      const dir = Math.sign(e.deltaY)
      const at = going()
      const run = ours(dir, at)
      if (!run) return
      e.preventDefault()
      e.stopPropagation()
      // a new scroll: after a pause, the other way, or (a trackpad's momentum still dying away) one that comes in markedly
      // stronger than the tail it lands on, never the tail itself
      const size = Math.abs(e.deltaY)
      const fresh = e.timeStamp - wheelAt > 160 || dir !== wheelDir || (size >= 30 && size > wheelSize * 2 && e.timeStamp - freshAt > 260)
      wheelAt = e.timeStamp
      wheelDir = dir
      wheelSize = size
      if (fresh) freshAt = e.timeStamp
      if (fresh) next(dir, at, run)
    }
    const end_ = () => {
      touching = false
      // (a touch that stopped a glide all the same, and was no swipe of its own: the glide goes on)
      if (!g.taken && aim !== null && performance.now() >= aimUntil - 80 && short()) go(aim)
      g.taken = false
    }
    const rest = () => {
      clearTimeout(settle)
      settle = window.setTimeout(() => {
        if (touching || performance.now() < aimUntil) return
        const y = window.scrollY
        const run = within(y)
        if (!run) return
        const near = run.reduce((a, n) => (Math.abs(n - y) < Math.abs(a - y) ? n : a), run[0])
        if (Math.abs(near - y) > 2) go(near)
      }, 160)
    }
    window.addEventListener('touchstart', start, { capture: true, passive: true })
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end_, { passive: true })
    window.addEventListener('touchcancel', end_, { passive: true })
    window.addEventListener('scroll', rest, { passive: true })
    window.addEventListener('wheel', wheel, { capture: true, passive: false })
    return () => {
      clearTimeout(settle)
      clearTimeout(guard)
      window.removeEventListener('wheel', wheel, { capture: true })
      window.removeEventListener('touchstart', start, { capture: true })
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end_)
      window.removeEventListener('touchcancel', end_)
      window.removeEventListener('scroll', rest)
    }
  }, [section, phone])
}

/** the points named in the cavity (on a phone, one at a time, each with its number) */
const POINTS = [
  { anchor: 'tour-face-a', name: 'Upper basalt face' },
  { anchor: 'tour-fibres', name: 'Connecting fibres' },
  { anchor: 'tour-face-b', name: 'Lower basalt face' },
]

export function Hero() {
  const section = useRef<HTMLElement>(null)
  const open = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const failed = useStageValue('failed')
  useStageRegion(section, () => 'hero')
  useOrbitDrag(open)
  const compact = useIsCompact()
  useTour(section, setAt, compact)
  useTourSwipes(section, compact)

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
          to About's first view; the page goes a screen at a time after that */}
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
