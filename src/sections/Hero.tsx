import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { StageLabel, useOrbitDrag, useStageRegion } from '../three/Stage'
import { setShared, stage, useStageValue } from '../three/stageStore'
import { tourWash } from '../three/poses'
import { Lines } from '../components/Chapter'
import { Link } from '../lib/router'
import { damp, prefersReducedMotion } from '../lib/motion'
import { scrollToY } from '../lib/scroll'

/** the screens of the opening tour: the piece, the mesh built out, the cavity, the cast */
const SCREENS = 4

/**
 * The opening tour, the one vertical sequence on the page tied to the scroll. Four screens: the
 * headline beside a piece of mesh lying on the yellow ground; the mesh built out to the edges of
 * the screen while the headline dissolves into it; the camera between the two faces, on into white
 * light; out of the white, a tile of the mesh that concrete rises around; and, as About comes up,
 * into the mesh and out as About's first view, so the two meet without a cut. The scroll position
 * is damped into `stage.tour` (0..4) every frame and written to `--p` for the copy; how far the
 * tour has gone into the light is written to `--wash` for the ground.
 */
function useTour(section: RefObject<HTMLElement | null>, onScreen: (i: number) => void) {
  const screenCb = useRef(onScreen)
  screenCb.current = onScreen
  useEffect(() => {
    const el = section.current
    if (!el) return
    const root = document.documentElement
    let raf = 0
    let last = performance.now()
    let p = -1
    let shown = -1
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      // one screen more than it has: leaving the cast, the tour carries on into About's first view
      const target = Math.min(SCREENS, Math.max(0, -r.top / vh))
      p = p < 0 || prefersReducedMotion() ? target : damp(p, target, 10, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      stage.tour = p
      stage.wash = tourWash(p)
      el.style.setProperty('--p', p.toFixed(4))
      root.style.setProperty('--wash', stage.wash.toFixed(4))
      // the header and the labels follow the ground: yellow, then the white of the cast
      if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) setShared({ chapter: 'hero', step: 0, ground: stage.wash > 0.5 ? 'light' : 'yellow' })
      const i = Math.min(SCREENS - 1, Math.max(0, Math.round(target)))
      if (i !== shown) {
        shown = i
        screenCb.current(i)
      }
      if (p !== target) raf = requestAnimationFrame(tick)
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
  }, [section])
}

export function Hero() {
  const section = useRef<HTMLElement>(null)
  const open = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const failed = useStageValue('failed')
  useStageRegion(section, () => 'hero')
  useOrbitDrag(open)
  useTour(section, setAt)

  // the scroll cue starts the tour: one screen down
  const start = () => {
    const el = section.current
    if (!el) return
    scrollToY(el.offsetTop + window.innerHeight)
  }
  const state = (i: number) => (at === i ? 'is-active' : at > i ? 'is-seen' : '')

  return (
    <>
      <section ref={section} className="hero" aria-labelledby="hero-title">
        <div ref={open} className={`hero__screen hero__screen--open scene ${state(0)}`} data-screen="yellow">
          {failed && <img className="hero__still" src="/img/render-structure.webp" alt="" />}
          <div className="hero__copy">
            {/* on scroll the headline drifts into the mesh and dissolves (--p) */}
            <Lines as="h1" id="hero-title" className="hero__title" lines={['Meet', 'RTARIUM.']} />
            <div className="hero__sub">
              <p className="hero__lede rv" style={{ '--i': 2 } as CSSProperties}>
                A three-dimensional basalt mesh for advanced concrete applications.
              </p>
              <Link to="/#about" className="explore rv" style={{ '--i': 3 } as CSSProperties}>
                <span className="explore__label">Explore the mesh</span>
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
            <Lines slab lines={['Between them, a cavity', 'for concrete to fill.']} />
          </div>
        </div>

        {/* out of the white light: the mesh, and the concrete rising round it (the ground is washed white) */}
        <div className={`hero__screen hero__screen--cast scene on-light ${state(3)}`} data-screen="yellow">
          <div className="hero__cast">
            <Lines lines={['Concrete,', 'better than ever.']} />
            <p className="lead rv" style={{ '--i': 3 } as CSSProperties}>
              Mortar fills the cavity and locks round the mesh, in three dimensions.
            </p>
          </div>
        </div>
      </section>
      <StageLabel anchor="hero-structure" callout={[150, -84]}>
        3D spacer structure
      </StageLabel>
      <StageLabel anchor="hero-yarn" callout={[64, -150]} wideOnly>
        Basalt yarn
      </StageLabel>
      <StageLabel anchor="hero-thickness" callout={[-150, 30]} wideOnly>
        Two offset faces
      </StageLabel>
      <StageLabel anchor="tour-face-a" column={0.24}>
        Upper basalt face
      </StageLabel>
      <StageLabel anchor="tour-fibres" column={0.24}>
        Connecting fibres
      </StageLabel>
      <StageLabel anchor="tour-face-b" column={0.24}>
        Lower basalt face
      </StageLabel>
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
