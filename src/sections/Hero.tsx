import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { StageLabel, useOrbitDrag, useStageRegion } from '../three/Stage'
import { setShared, stage, useStageValue } from '../three/stageStore'
import { PHONE_POINTS, tourWash } from '../three/poses'
import { Lines } from '../components/Chapter'
import { Link } from '../lib/router'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'

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
      const at = Math.min(screens, Math.max(0, -r.top / vh))
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

export function Hero() {
  const section = useRef<HTMLElement>(null)
  const open = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const failed = useStageValue('failed')
  useStageRegion(section, () => 'hero')
  useOrbitDrag(open)
  const compact = useIsCompact()
  useTour(section, setAt, compact)

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
