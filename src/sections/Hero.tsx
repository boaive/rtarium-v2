import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { StageLabel, useOrbitDrag, useStageRegion } from '../three/Stage'
import { stage, useStageValue } from '../three/stageStore'
import { Lines, useScreen } from '../components/Chapter'
import { Link } from '../lib/router'
import { damp, prefersReducedMotion } from '../lib/motion'

/**
 * The opening tour, the one sequence on the page tied to the scroll. Three screens: the headline
 * beside a strip of mesh lying on the yellow ground; the mesh built out to the edges of the screen
 * while the headline dissolves into it; the camera between the two faces. The scroll position is
 * damped into `stage.tour` (0..3) every frame and written to `--p` for the copy.
 */
function useTour(section: RefObject<HTMLElement | null>, onScreen: (i: number) => void) {
  const screenCb = useRef(onScreen)
  screenCb.current = onScreen
  useEffect(() => {
    const el = section.current
    if (!el) return
    let raf = 0
    let last = performance.now()
    let p = -1
    let shown = -1
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const target = Math.min(3, Math.max(0, -el.getBoundingClientRect().top / window.innerHeight))
      p = p < 0 || prefersReducedMotion() ? target : damp(p, target, 6.5, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      stage.tour = p
      el.style.setProperty('--p', p.toFixed(4))
      const i = Math.min(2, Math.max(0, Math.round(target)))
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
    }
  }, [section])
}

export function Hero() {
  const section = useRef<HTMLElement>(null)
  const open = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const failed = useStageValue('failed')
  useStageRegion(section, () => 'hero')
  useScreen(section, 'hero', 'yellow')
  useOrbitDrag(open)
  useTour(section, setAt)

  // the round button starts the tour: one screen down
  const start = () => {
    const el = section.current
    if (!el) return
    window.scrollTo({ top: el.offsetTop + window.innerHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <>
      <section ref={section} className="hero" aria-labelledby="hero-title">
        <div ref={open} className={`hero__screen hero__screen--open scene ${at === 0 ? 'is-active' : 'is-seen'}`} data-screen="yellow">
          {failed && <img className="hero__still" src="/img/render-structure.webp" alt="" />}
          <div className="hero__copy">
            {/* on scroll the headline drifts into the mesh and dissolves (--p) */}
            <Lines as="h1" id="hero-title" className="hero__title" lines={['Meet', 'RTARIUM.']} />
            <div className="hero__sub">
              <p className="hero__lede rv" style={{ '--i': 2 } as CSSProperties}>
                A three-dimensional basalt mesh for advanced concrete applications.
              </p>
              <Link to="/#about" className="pill pill--ink hero__cta rv" style={{ '--i': 3 } as CSSProperties}>
                Explore
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </Link>
            </div>
          </div>
          <div className="hero__scroll">
            <div className="hero__scroll-in rv" style={{ '--i': 4 } as CSSProperties}>
              <button type="button" className="round" onClick={start} aria-label="Scroll to explore: start the tour of the mesh">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M12 4v15M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <span>Scroll to explore</span>
            </div>
          </div>
        </div>

        <div className={`hero__screen hero__screen--built scene ${at === 1 ? 'is-active' : at > 1 ? 'is-seen' : ''}`} data-screen="yellow">
          <div className="hero__say hero__say--br">
            <Lines slab lines={['Two basalt faces,', 'woven as one.']} />
          </div>
        </div>

        <div className={`hero__screen hero__screen--inside scene ${at === 2 ? 'is-active' : ''}`} data-screen="yellow">
          <div className="hero__say hero__say--tr">
            <Lines slab lines={['Between them, a cavity', 'for concrete to fill.']} />
          </div>
        </div>
      </section>
      <StageLabel anchor="hero-structure" callout={[-46, -150]}>
        3D spacer structure
      </StageLabel>
      <StageLabel anchor="hero-yarn" callout={[-160, 72]} wideOnly>
        Basalt yarn
      </StageLabel>
      <StageLabel anchor="hero-thickness" callout={[74, 74]} wideOnly>
        Mesh thickness
      </StageLabel>
      <StageLabel anchor="tour-face-a">Basalt face</StageLabel>
      <StageLabel anchor="tour-fibres">Connecting fibres</StageLabel>
      <StageLabel anchor="tour-face-b" side="left">
        Basalt face
      </StageLabel>
    </>
  )
}
