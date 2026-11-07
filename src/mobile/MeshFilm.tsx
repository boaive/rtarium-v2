import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from '../lib/router'
import { THICKNESS_OPTIONS, type Thickness } from '../content/technical'
import { useReducedMotion } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { FilmCanvas, hasWebGL2 } from './three/FilmCanvas'
import { FILM_STEPS, createFilm, type FilmState } from './three/film'
import { Words } from './ui'

/**
 * The opening of the phone homepage: one pinned 3D stage and four steps that scroll over it. The
 * opening (the name, the line, Explore, the piece woven out below them); the two faces and the
 * fibres between them, at any of the four thicknesses; the third direction, against the flat mesh
 * it replaces; and the camera between the faces, in the open core. The mesh always sits in the band
 * of the screen its step leaves clear; each step's copy stands on its own yellow panel, so the two
 * never overlap at rest. A horizontal drag turns the mesh; vertical drags scroll the page.
 */

/** A label pinned to a point of the mesh; the scene places it and shows it on its own step. */
function Pin({ film, anchor, step, dx = 0, dy = 0, col, tip = false, children }: { film: FilmState; anchor: string; step: number; dx?: number; dy?: number; col?: number; tip?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    film.labels.set(anchor, el)
    return () => {
      film.labels.delete(anchor)
    }
  }, [film, anchor])
  // the scene keeps the name on screen, so it needs its width (again when the words change)
  useLayoutEffect(() => {
    const el = ref.current
    const tag = el?.querySelector<HTMLElement>('.m-pin__tag')
    if (!el || !tag) return
    const measure = () => void (el.dataset.w = String(tag.offsetWidth))
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
  }, [children])
  const left = col !== undefined ? col < 0.5 : dx < 0
  const style = {
    opacity: 0,
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    '--len': `${Math.hypot(dx, dy).toFixed(1)}px`,
    '--ang': `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}deg`,
  } as CSSProperties
  return (
    <span ref={ref} className={`m-pin ${tip ? 'm-pin--tip' : ''} ${left ? 'is-left' : ''}`} data-step={step} data-col={col} data-dx={dx} data-dy={dy} data-tip={tip ? '' : undefined} style={style} aria-hidden="true">
      <span className="m-pin__lead" />
      <span className="m-pin__tag">{children}</span>
    </span>
  )
}

/** what each step shows where its mesh would be, when there is no 3D */
const STILLS = ['/img/render-structure.webp', '/img/shoot/mesh-fibres.webp', '/img/shoot/mesh-profile.webp', '/img/shoot/mesh-macro.webp']

const STEPS = [
  { id: 'about', label: 'Structure', chapter: 'about' },
  { id: 'innovation', label: 'Depth', chapter: 'innovation' },
  { id: 'open-core', label: 'Open core', chapter: 'about' },
]

function StepHead({ n }: { n: number }) {
  return (
    <p className="m-stephead">
      <span className="m-stephead__n num">0{n}</span>
      <span className="m-stephead__bars" aria-hidden="true">
        {STEPS.map((s, k) => (
          <i key={s.id} className={k < n ? 'is-on' : ''} />
        ))}
      </span>
      <span className="m-stephead__label">{STEPS[n - 1].label}</span>
    </p>
  )
}

export function MeshFilm() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const blocks = useRef<(HTMLDivElement | null)[]>([])
  const film = useMemo(createFilm, [])
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [live, setLive] = useState(true)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(() => !hasWebGL2())
  const [thickness, setThickness] = useState<Thickness>(10)
  const [flat, setFlat] = useState(false)
  const [turned, setTurned] = useState(false)
  const [zones, setZones] = useState(film.zones)
  const autoplay = useRef(0)

  // where each step leaves clear ground for the mesh, measured from its own block
  useLayoutEffect(() => {
    const el = section.current
    if (!el) return
    film.section = el
    const measure = () => {
      const bar = document.querySelector('.nav__bar')
      const navH = bar ? bar.getBoundingClientRect().height : 64
      const first = blocks.current[0]
      const vh = first?.offsetHeight || window.innerHeight
      const vw = first?.offsetWidth || window.innerWidth
      film.stepH = vh
      // upright, the copy is above or below the mesh; on its side, the copy takes the right
      film.zones = blocks.current.map((b, i) => {
        if (!b) return { top: navH, bottom: vh * 0.5, left: 0, right: vw }
        if (i === 0) {
          const copy = b.querySelector<HTMLElement>('.m-hero__copy')
          const foot = b.querySelector<HTMLElement>('.m-hero__foot')
          if (copy && copy.offsetWidth < vw * 0.7) return { top: navH + 10, bottom: vh - 12, left: copy.offsetLeft + copy.offsetWidth, right: vw - 8 }
          return { top: copy ? copy.offsetTop + copy.offsetHeight + 8 : vh * 0.5, bottom: foot && foot.offsetHeight ? foot.offsetTop - 4 : vh - 40, left: 0, right: vw }
        }
        const panel = b.querySelector<HTMLElement>('.m-step__panel')
        if (panel && panel.offsetLeft > 10) return { top: navH + 10, bottom: vh - 12, left: 8, right: panel.offsetLeft - 10 }
        return { top: navH + 10, bottom: panel ? panel.offsetTop - 10 : vh * 0.55, left: 0, right: vw }
      })
      setZones(film.zones)
    }
    measure()
    const ro = new ResizeObserver(measure)
    blocks.current.forEach((b) => {
      if (!b) return
      ro.observe(b)
      b.querySelectorAll('.m-step__panel, .m-hero__copy').forEach((p) => ro.observe(p))
    })
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [film])

  // which step holds the screen, and whether the film is on screen at all (it only draws then)
  useEffect(() => {
    const el = section.current
    if (!el) return
    let raf = 0
    const read = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const h = film.stepH || window.innerHeight
      setStep(Math.min(FILM_STEPS - 1, Math.max(0, Math.round(-r.top / h))))
      setLive(r.bottom > -40 && r.top < window.innerHeight + 40)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [film])

  // a horizontal drag turns the mesh (touch-action lets the page keep vertical drags)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    let id = -1
    let x = 0
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      id = e.pointerId
      x = e.clientX
      film.dragging = true
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const dx = e.clientX - x
      x = e.clientX
      film.yaw = Math.max(-1.6, Math.min(1.6, film.yaw + dx * 0.007))
      if (Math.abs(film.yaw) > 0.15) setTurned(true)
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = -1
      film.dragging = false
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [film])

  // reaching the Depth step plays the comparison once: the flat mesh, then RTARIUM grows across it
  useEffect(() => {
    window.clearTimeout(autoplay.current)
    if (step !== 2 || reduced || failed) return
    setFlat(true)
    autoplay.current = window.setTimeout(() => setFlat(false), 1900)
    return () => window.clearTimeout(autoplay.current)
  }, [step, reduced, failed])
  useEffect(() => {
    film.flat = flat
  }, [film, flat])
  const chooseFlat = (f: boolean) => {
    window.clearTimeout(autoplay.current)
    setFlat(f)
  }

  const chooseThickness = (t: Thickness) => startTransition(() => setThickness(t))

  const still = failed ? zones[step] : undefined

  return (
    <section ref={section} className={`m-film ${ready ? 'is-ready' : ''} ${failed ? 'is-still' : ''}`} aria-label="RTARIUM, the mesh" data-m-ground="yellow" style={{ '--steps': FILM_STEPS } as CSSProperties}>
      <div ref={stage} className="m-film__stage" aria-hidden="true">
        {failed ? (
          still && <img className="m-film__still" src={STILLS[step]} alt="" style={{ top: still.top, left: still.left + 18, width: Math.max(80, still.right - still.left - 36), height: Math.max(80, still.bottom - still.top) }} />
        ) : (
          <FilmCanvas film={film} thickness={thickness} reduced={reduced} live={live} onReady={() => setReady(true)} onFail={() => setFailed(true)} />
        )}
        {!failed && (
          <div className="m-film__pins">
            <Pin film={film} anchor="hero-structure" step={0} dx={-22} dy={-46}>
              3D spacer structure
            </Pin>
            <Pin film={film} anchor="upper-face" step={1} dx={-24} dy={-54}>
              Upper face
            </Pin>
            <Pin film={film} anchor="fibres" step={1} dx={40} dy={38}>
              Connecting fibres
            </Pin>
            <Pin film={film} anchor="lower-face" step={1} dx={34} dy={66}>
              Lower face
            </Pin>
            <Pin film={film} anchor="dimension" step={1} dx={12} dy={0} tip>
              {thickness} mm
            </Pin>
            <Pin film={film} anchor="axis-x" step={2} dx={10} dy={0} tip>
              X
            </Pin>
            <Pin film={film} anchor="axis-y" step={2} dx={10} dy={0} tip>
              Y
            </Pin>
            <Pin film={film} anchor="axis-z" step={2} dx={10} dy={0} tip>
              Z, through the depth
            </Pin>
            <Pin film={film} anchor="core-a" step={3} col={0.64}>
              Upper basalt face
            </Pin>
            <Pin film={film} anchor="core-fibres" step={3} col={0.64}>
              Connecting fibres
            </Pin>
            <Pin film={film} anchor="core-b" step={3} col={0.64}>
              Lower basalt face
            </Pin>
          </div>
        )}
      </div>

      <div className="m-film__steps">
        <div ref={(n) => void (blocks.current[0] = n)} className="m-step m-step--hero" data-m-chapter="hero">
          <div className="m-hero__copy">
            <h1 className="m-hero__title" id="hero-title">
              <span className="m-hero__intro">Introducing</span> <span className="m-hero__name">RTARIUM.</span>
            </h1>
            <p className="m-hero__lede">A three-dimensional basalt mesh for advanced concrete applications.</p>
            <Link to="/#about" className="m-explore">
              <span className="m-explore__label">Explore the mesh</span>
              <span className="m-explore__cell" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="18" height="18">
                  <path d="M10 3v13M5 11l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                </svg>
              </span>
            </Link>
          </div>
          <div className="m-hero__foot" aria-hidden="true">
            <span className={`m-hero__hint ${turned || failed ? 'is-gone' : ''}`}>
              <svg viewBox="0 0 28 12" width="28" height="12">
                <path d="M1 6h26M5 2 1 6l4 4M23 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Drag to turn
            </span>
            <span className="m-hero__scroll">
              <i />
              Scroll
            </span>
          </div>
        </div>

        <div ref={(n) => void (blocks.current[1] = n)} id="about" className="m-step" data-m-chapter="about">
          <div className="m-step__panel" data-reveal="">
            <StepHead n={1} />
            <Words lines={['Two basalt faces,', 'woven as one.']} className="m-step__title" />
            <p className="m-step__lead">Two basalt mesh faces, connected by vertical fibres to form a 3D structure.</p>
            <div className="m-thick">
              <span className="m-thick__label" id="thick-label">
                Thickness options
              </span>
              {failed ? (
                <p className="m-thick__static" aria-labelledby="thick-label">
                  <span className="num">{THICKNESS_OPTIONS.join(' / ')}</span> mm
                </p>
              ) : (
                <div className="m-thick__chips" role="group" aria-labelledby="thick-label">
                  {THICKNESS_OPTIONS.map((t) => (
                    <button key={t} type="button" aria-pressed={thickness === t} tabIndex={step === 1 ? 0 : -1} onClick={() => chooseThickness(t)}>
                      <span className="num">{t}</span> mm
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div ref={(n) => void (blocks.current[2] = n)} id="innovation" className="m-step" data-m-chapter="innovation">
          <div className="m-step__panel" data-reveal="">
            <StepHead n={2} />
            <Words lines={['Strength across', 'all three axes.']} className="m-step__title" />
            <p className="m-step__lead">A flat mesh reinforces only along the sheet. RTARIUM’s connecting fibres add the third direction, so load is carried in X, Y and Z.</p>
            {!failed && (
              <div className="m-toggle" role="group" aria-label="Compare with a flat mesh">
                <button type="button" aria-pressed={flat} tabIndex={step === 2 ? 0 : -1} onClick={() => chooseFlat(true)}>
                  Flat mesh
                </button>
                <button type="button" aria-pressed={!flat} tabIndex={step === 2 ? 0 : -1} onClick={() => chooseFlat(false)}>
                  RTARIUM
                </button>
              </div>
            )}
          </div>
        </div>

        <div ref={(n) => void (blocks.current[3] = n)} id="open-core" className="m-step" data-m-chapter="about">
          <div className="m-step__panel" data-reveal="">
            <StepHead n={3} />
            <Words lines={['An open core', 'for concrete.']} className="m-step__title" />
            <p className="m-step__lead">The cavity between the two faces stays open, so mortar flows right through it.</p>
            <a
              href="#in-concrete"
              className="m-textlink"
              tabIndex={step === 3 ? 0 : -1}
              onClick={(e) => {
                e.preventDefault()
                const el = document.getElementById('in-concrete')
                if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
              }}
            >
              See it cast
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
