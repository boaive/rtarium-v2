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
 * where the last ones were (a fade and a short settle), and the scene plays the step out; in the spray-up
 * a wireframe gun runs along the mould.
 */

interface Step {
  id: string
  name: string
  head: [string, string]
  line: string
  review?: string
}
const STEPS: Step[] = [
  { id: 'mould', name: 'Mould', head: ['The', 'mould'], line: 'A CNC-routed timber mould, shaped to the exact cornice profile.' },
  {
    id: 'spray',
    name: 'Spray-up',
    head: ['Sprayed,', 'stitched'],
    line: 'Concrete is sprayed into the mould. RTARIUM is cut, stitched and positioned within the layer.',
    review: REVIEW.skin,
  },
  { id: 'frame', name: 'Stud frame', head: ['Stud', 'frame'], line: 'Galvanized steel tubes are drilled at intervals matching the ferrule positions.' },
  { id: 'join', name: 'Frame, secured.', head: ['Frame,', 'secured.'], line: 'The frame is positioned over the ferrule inserts and secured in place.' },
  { id: 'cure', name: 'Cured', head: ['Cured,', 'demoulded'], line: 'The concrete is cured under controlled conditions and then removed from the mould.' },
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

  // left as the slab to slab's build is, by the page's stepper (usePageSteps): plays with the scroll going down, never
  // back, its bar playing it to a step; done where its last step has played out
  const done = (START[N - 1] + STRETCH[N - 1] * 0.97) / RUN

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
        // the bar: the current cell fills as its step plays; a passed one closes to its number
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / (k === N - 1 ? 0.97 : 0.8))).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.9, 1, f) : 0).toFixed(4))
        }
      })
    }
    const tick = (now: number) => {
      raf = 0
      // held by its controller (`data-held`, the page's stepper): it stays where it stands; and while a step of the bar plays
      // it there, that play has it
      if (seeking || el.hasAttribute('data-held')) return
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = stepAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      apply()
      if (p !== target) raf = requestAnimationFrame(tick)
    }
    /** everything that follows where the run stands, `p` */
    const apply = () => {
      const v = p / N
      if (progress.value !== v) {
        progress.value = v
        progress.listeners.forEach((f) => f())
      }
      place()
      setStep(Math.min(N - 1, Math.max(0, Math.floor(p))))
    }
    // a step of the bar (`run:show`, from the page's stepper): the run played to that step, back or on, smoothly and in a time
    // of its own, as the slab to slab's bar plays to its step; `move`: the page goes straight there first
    let seeking = false
    let seekRaf = 0
    const seek = (to: number, at?: number, quick = false) => {
      cancelAnimationFrame(seekRaf)
      // (a step of the bar plays in full, from its own start: `at`)
      const from = at ?? (p < 0 ? to : p)
      if (reduced || Math.abs(to - from) < 1e-4) {
        p = to
        apply()
        return
      }
      // (quick: the last of a step the scroll has all but played, finished in about the time a scroll settles)
      const time = (quick ? Math.min(0.6, 0.25 + 1.5 * Math.abs(to - from)) : Math.min(4.2, 1.6 + 1.4 * Math.abs(to - from))) * 1000
      const start = performance.now()
      seeking = true
      const frame = (at: number) => {
        const u = Math.min(1, Math.max(0, (at - start) / time))
        p = from + (to - from) * (quick ? 1 - Math.pow(1 - u, 3) : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
        apply()
        if (u < 1) seekRaf = requestAnimationFrame(frame)
        else {
          seeking = false
          kick()
        }
      }
      seekRaf = requestAnimationFrame(frame)
    }
    const show = (e: Event) => {
      const { k, move } = (e as CustomEvent<{ k: number; move?: boolean }>).detail
      const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.97 : 0.8)
      if (move) scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight, true)
      // (without `move`, the stepper is saying the scroll has played it to its end: it is eased on from where it stands,
      // never played again from its start)
      seek(stepAt(s), move === undefined ? undefined : k, move === undefined)
    }
    const kick = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    // let go by its controller (`run:release`): straight to where the scroll is, never easing there from where it was held
    const release = () => {
      cancelAnimationFrame(seekRaf)
      seeking = false
      p = -1
      kick()
    }
    el.addEventListener('run:show', show)
    el.addEventListener('run:release', release)
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      el.removeEventListener('run:show', show)
      el.removeEventListener('run:release', release)
      cancelAnimationFrame(seekRaf)
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
      cancelAnimationFrame(raf)
    }
  }, [progress])

  return (
    <section ref={section} id="casting" className="fu-ans on-yellow" data-done={done} aria-labelledby="fs-cast-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div ref={stage} className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/facade/mesh-on-face-coat.webp" alt="" />}>
            <ScrubRig progress={progress} shotAt={shotAt} sway={0.6} live={live} aspect={compact ? 0.75 : undefined} />
            <CastScene progress={progress} live={live} />
            <FollowScroll progress={progress} />
          </Stage3D>
        </div>

        <h2 id="fs-cast-title" className="fu-ans__title">
          Cast in 5 steps. Every step happens under factory control.
        </h2>

        <div ref={room} className="fu-ans__words">
          {STEPS.map((s, k) => (
            <div key={s.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {s.head[0]} <br />
                {s.head[1]}
              </h3>
              <p className="fu-ans__line">{s.line}</p>
              {s.review && <ReviewNote>{s.review}</ReviewNote>}
            </div>
          ))}
        </div>

        <StepBar label="How a stud frame element is cast" names={STEPS.map((s) => s.name)} step={step} onGo={goToStep} cellRef={(k, el) => void (cells.current[k] = el)} hints="run" />
      </div>
    </section>
  )
}
