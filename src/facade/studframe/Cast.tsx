import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D } from '../three/Stage3D'
import { ScrubRig } from '../three/ScrubRig'
import { FollowScroll, smooth, type Progress } from '../progress'
import { CastScene, castShot, type RoomAxis } from '../three/stud/CastScene'
import { REVIEW } from '../content'
import { ReviewNote } from '../../components/Media'
import { StepBar } from '../unitized/StepBar'

/**
 * Cast in five steps, on yellow, in the stage of the rainscreen's "RTARIUM bridges the gap" (the
 * Unitized answers' stage, `fu-ans`): one pinned screen, the words always in one place on the left, the
 * casting in the room right of them and on their line, the bar along the foot. A step's words come in
 * where the last ones were (a fade and a short settle), and the scene plays the step out. In the
 * spray-up, a photograph from the shoot opens out of its corner under the words for a moment, and closes.
 */

interface Step {
  id: string
  name: string
  head: [string, string]
  line: string
  photo?: { src: string; alt: string; pos: string }
  review?: string
}
const STEPS: Step[] = [
  { id: 'mould', name: 'Mould', head: ['The', 'mould'], line: 'CNC-routed timber, the cornice’s face as its cavity.' },
  {
    id: 'spray',
    name: 'Spray-up',
    head: ['Sprayed,', 'stitched'],
    line: 'Concrete sprayed in. RTARIUM cut, stitched and laid in.',
    photo: { src: '/img/facade/stud-spray.webp', alt: 'A hopper gun spraying the face coat into a timber mould', pos: '50% 54%' },
    review: REVIEW.skin,
  },
  { id: 'frame', name: 'Stud frame', head: ['Stud', 'frame'], line: 'Galvanized tubes, drilled at the ferrules’ intervals.' },
  { id: 'join', name: 'Frame onto skin', head: ['Frame', 'onto skin'], line: 'Set on the ferrule inserts and locked.' },
  { id: 'cure', name: 'Cured', head: ['Cured,', 'demoulded'], line: 'A controlled cure, then out of the mould.' },
]
const N = STEPS.length

/** screens of scroll for each step: the spray-up has the most to show */
const STRETCH = [1.3, 2.4, 1.3, 1.3, 1.6]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))

/** the run, in screens scrolled into the pin, as steps: step k over k..k+1 */
function stepAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}
/** how far step k's words are in (0..1), at `t` */
function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.14, f)
  const out = k === N - 1 ? 0 : smooth(0.86, 0.98, f)
  return inn * (1 - out)
}
/** scrolls to where step k has played out, its words still in place */
function goToStep(k: number) {
  const el = document.getElementById('casting')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.97 : 0.8)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

export function Cast() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const shots = useRef<(HTMLElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  /** the run, 0..1 (a fifth for each step), told to the scene */
  const progress = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const live = useRef(false)
  const [step, setStep] = useState(0)
  /** where the scene stands, from the layout: the middle of the room right of the words, on their line */
  const axis = useRef<RoomAxis>({ x: 0.64, y: 0.5 })
  const shotAt = useMemo(() => (p: number) => castShot(p, compact, axis.current), [compact])

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !p.width || !p.height) return
      axis.current = compact ? { x: 0.5, y: 0.36 } : { x: ((w.right + bar.right) / 2 - p.left) / p.width, y: (w.top + w.height / 2 - p.top) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    const el = stage.current
    const io = el ? new IntersectionObserver(([e]) => void (live.current = e.isIntersecting)) : null
    if (el) io?.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      io?.disconnect()
    }
  }, [compact])

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      STEPS.forEach((_, k) => {
        const f = p - k
        const w = words.current[k]
        if (w) {
          const vis = wordsAt(k, p)
          w.style.opacity = vis.toFixed(3)
          w.style.visibility = vis > 0.004 ? '' : 'hidden'
          w.toggleAttribute('inert', vis < 0.5)
          if (!reduced) {
            const y = f < 0.5 ? (1 - vis) * 14 : -(1 - vis) * 10
            w.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
            w.style.filter = vis > 0.995 ? '' : `blur(${((1 - vis) * 5).toFixed(2)}px)`
          }
        }
        // the photograph: open out of its corner for a moment as the concrete first goes in, and closed again
        const ph = shots.current[k]
        if (ph) {
          const g = Math.max(0, smooth(0.06, 0.16, f) - smooth(0.36, 0.46, f))
          ph.style.setProperty('--g', g.toFixed(4))
          ph.style.visibility = g > 0.003 ? '' : 'hidden'
        }
        // the bar: the current cell fills as its step plays; a passed one closes to its number
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / 0.94)).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.9, 1, f) : 0).toFixed(4))
        }
      })
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = stepAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      const v = p / N
      if (progress.value !== v) {
        progress.value = v
        progress.listeners.forEach((f) => f())
      }
      place()
      setStep(Math.min(N - 1, Math.max(0, Math.floor(p))))
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
  }, [progress])

  return (
    <section ref={section} id="casting" className="fu-ans on-yellow" aria-labelledby="fs-cast-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div ref={stage} className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/mesh-on-face-coat.webp" alt="" />}>
            <ScrubRig progress={progress} shotAt={shotAt} sway={0.6} live={live} aspect={compact ? 0.75 : undefined} />
            <CastScene progress={progress} live={live} />
            <FollowScroll progress={progress} />
          </Stage3D>
        </div>

        <h2 id="fs-cast-title" className="fu-ans__title">
          Cast in five steps
        </h2>

        <div ref={room} className="fu-ans__words">
          {STEPS.map((s, k) => (
            <div key={s.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {s.head[0]} <br />
                {s.head[1]}
              </h3>
              <p className="fu-ans__line">{s.line}</p>
              {s.photo && (
                <figure ref={(el) => void (shots.current[k] = el)} className="fu-ans__shot" style={{ visibility: 'hidden' }}>
                  <span className="fu-ans__frame">
                    <img src={s.photo.src} alt={s.photo.alt} loading="lazy" decoding="async" width={267} height={479} style={{ objectPosition: s.photo.pos }} />
                  </span>
                </figure>
              )}
              {s.review && <ReviewNote>{s.review}</ReviewNote>}
            </div>
          ))}
        </div>

        <StepBar label="How a stud frame element is cast" names={STEPS.map((s) => s.name)} step={step} onGo={goToStep} cellRef={(k, el) => void (cells.current[k] = el)} />
      </div>
    </section>
  )
}
