import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../lib/motion'
import { scrollToY } from '../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus } from '../facade/three/kit'
import { smooth, type Progress } from '../facade/progress'
import { StepBar } from '../facade/unitized/StepBar'
import { FeatureScene, N_FEATURES, type FeatureAxis } from './three/FeatureScene'

/**
 * The core features, on yellow, in the Rainscreen bridge's stage (and the Unitized answers'): one
 * pinned screen, the words always in one place on the left, the floor in the room right of them and on
 * their line, a bar along the foot. A feature's words come in where the last ones were (a fade and a
 * short settle), and only then does the floor play it out; the camera moves only between features.
 * The scroll is the clock, and it moves a feature at a time: one scroll glides on to where the next has
 * played out, so each plays by itself.
 */

interface Feature {
  id: string
  name: string
  /** the name as it is set, in two lines */
  head: [string, string]
  line: string
  labels: string[]
}

const FEATURES: Feature[] = [
  { id: 'web', name: 'A 3D basalt mesh', head: ['A 3D basalt', 'mesh'], line: 'One continuous mineral grid. Beyond flat mesh and steel fibre.', labels: ['web'] },
  { id: 'crack', name: 'Crack Resistant', head: ['Crack', 'Resistant'], line: 'When the slab deflects, the mesh holds the screed together.', labels: ['load', 'joint'] },
  { id: 'joint', name: 'Jointless floors', head: ['Jointless', 'floors'], line: 'Larger, uninterrupted slabs, and smoother runs for wheels and robots.', labels: ['plate'] },
  { id: 'still', name: 'Vibration dampening', head: ['Vibration', 'dampening'], line: 'Micro-vibrations absorbed, for robots and cleanrooms.', labels: ['robot'] },
  { id: 'rust', name: 'Non-corrosive', head: ['Non-corrosive', '\u00a0'], line: 'Mineral through and through. No corrosion, no dusting.', labels: ['steel', 'mesh'] },
  { id: 'carbon', name: 'Low-carbon', head: ['Low-carbon', 'infrastructure'], line: 'Less concrete usage means less embodied carbon in the build.', labels: ['carbon'] },
]

const LABELS: LabelSpec[] = [
  { id: 'web', anchor: 'ff-web', text: 'Continuous 3D web', dx: 60, dy: -90 },
  { id: 'load', anchor: 'ff-load', text: 'Heavy load', dx: 60, dy: -60 },
  { id: 'joint', anchor: 'ff-joint', text: 'Screed stays whole', dx: -60, dy: 80 },
  { id: 'plate', anchor: 'ff-plate', text: 'One open plate', dx: 60, dy: 70 },
  { id: 'robot', anchor: 'ff-robot', text: 'Vibration absorbed', dx: 50, dy: -80 },
  { id: 'steel', anchor: 'ff-steel', text: 'Steel rusts', dx: -50, dy: 80 },
  { id: 'mesh', anchor: 'ff-mesh', text: 'Basalt cannot', dx: 50, dy: 80 },
  { id: 'carbon', anchor: 'ff-carbon', text: 'Embodied carbon', dx: 60, dy: -60 },
]

/** screens of scroll for each feature */
const STRETCH = [1.5, 1.6, 1.5, 1.5, 1.4, 1.4]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))
const N = FEATURES.length

/** the run, in screens scrolled into the pin, as features: feature k over k..k+1 */
function featureAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}

/** how far feature k's words are in (0..1), at `t` */
function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.14, f)
  const out = k === N - 1 ? 0 : smooth(0.8, 0.94, f)
  return inn * (1 - out)
}

/** where feature k has played out, its words still in place: the scroll it rests at */
function playedAt(el: HTMLElement, k: number) {
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.72)
  return Math.round(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

/** scrolls to where feature k has played out */
function goToFeature(k: number) {
  const el = document.getElementById('features')
  if (el) scrollToY(playedAt(el, k))
}


export function Features({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const compact = useIsCompact()
  const words = useRef<(HTMLDivElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  /** where the scene stands, from the layout: the middle of the room right of the words, on their line */
  const axis = useRef<FeatureAxis>({ x: 0.6, y: 0.5 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !p.width || !p.height) return
      axis.current = { x: ((w.right + bar.right) / 2 - p.left) / p.width, y: (w.top + w.height / 2 - p.top) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // left as the slab to slab's build is, by the page's stepper (usePageSteps): plays with the scroll going down, never
  // back, its bar playing it to a step; done where its last step has played out
  const done = (START[N - 1] + STRETCH[N - 1] * 0.9) / RUN

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      FEATURES.forEach((_, k) => {
        const f = p - k
        // the words: in with a fade and a short settle, out with a fade and a short lift
        const w = words.current[k]
        if (w) {
          const vis = wordsAt(k, p)
          const rising = f < 0.5
          w.style.opacity = vis.toFixed(3)
          w.style.visibility = vis > 0.004 ? '' : 'hidden'
          w.toggleAttribute('inert', vis < 0.5)
          if (!reduced) {
            const y = rising ? (1 - vis) * 14 : -(1 - vis) * 10
            w.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
            w.style.filter = vis > 0.995 ? '' : `blur(${((1 - vis) * 5).toFixed(2)}px)`
          }
        }
        // the bar: the current cell fills as its feature plays; a passed one closes to its number
        const c = cells.current[k]
        if (c) {
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / (k === N - 1 ? 0.9 : 0.72))).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
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
      const target = featureAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      apply()
      if (p !== target) raf = requestAnimationFrame(tick)
    }
    /** everything that follows where the run stands, `p` */
    const apply = () => {
      if (t.value !== p) {
        t.value = Math.min(N_FEATURES - 1e-4, p)
        t.listeners.forEach((f) => f())
      }
      place()
      const k = Math.min(N - 1, Math.max(0, Math.floor(p)))
      setStep(k)
      // a feature's labels are up once it has played out, until its words go
      const f = p - k
      setLit(f > 0.5 && f < 0.8 + (k === N - 1 ? 1 : 0) ? FEATURES[k].id : '')
    }
    // a step of the bar (`run:show`, from the page's stepper): the run played to that step, back or on, smoothly and in a time
    // of its own, as the slab to slab's bar plays to its step; `move`: the page goes straight there first
    let seeking = false
    let seekRaf = 0
    const seek = (to: number) => {
      cancelAnimationFrame(seekRaf)
      const from = p < 0 ? to : p
      if (reduced || Math.abs(to - from) < 1e-4) {
        p = to
        apply()
        return
      }
      const time = Math.min(1.6, 0.55 + 0.28 * Math.abs(to - from)) * 1000
      const start = performance.now()
      seeking = true
      const frame = (at: number) => {
        const u = Math.min(1, Math.max(0, (at - start) / time))
        p = from + (to - from) * (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
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
      const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.72)
      if (move) scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight, true)
      seek(featureAt(s))
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
  }, [t, sectionRef])

  // the labels change with the step, after the frame that moved the scene there: the scene, which draws only when asked,
  // is asked for one more, so the labels it places are the new step's, never the last one's left where they stood
  useEffect(() => {
    t.listeners.forEach((f) => f())
  }, [lit, t])

  const shown = FEATURES.find((a) => a.id === lit)?.labels ?? []

  return (
    <section data-done={done} ref={sectionRef} id="features" className="fu-ans on-yellow" aria-labelledby="ffo-features-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows fallback={<img className="fu-still" src="/img/site-strip.webp" alt="" />}>
            <FeatureScene t={t} bus={bus} compact={compact} axis={axis} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>

        <h2 id="ffo-features-title" className="fu-ans__title">
          Core features
        </h2>

        {/* the words, all in one place, one feature at a time, each name starting on the same line */}
        <div ref={room} className="fu-ans__words">
          {FEATURES.map((a, k) => (
            <div key={a.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {a.head[0]} <br />
                {a.head[1]}
              </h3>
              <p className="fu-ans__line">{a.line}</p>
            </div>
          ))}
        </div>

        <StepBar
          label="RTARIUM's core features in a floor"
          names={FEATURES.map((a) => a.name)}
          step={step}
          onGo={goToFeature}
          cellRef={(k, el) => void (cells.current[k] = el)}
          hints="run"
        />
      </div>
    </section>
  )
}
