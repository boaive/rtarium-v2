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
 * The scroll is the clock; nothing is held.
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
  { id: 'web', name: '3D basalt web', head: ['3D basalt', 'web'], line: 'One continuous mineral grid. Beyond flat mesh and steel fibre.', labels: ['web'] },
  { id: 'crack', name: 'Total crack suppression', head: ['Total crack', 'suppression'], line: 'The slab deflects. The screed goes with it, uncracked.', labels: ['load', 'joint'] },
  { id: 'joint', name: 'Jointless floors', head: ['Jointless', 'floors'], line: 'No saw-cut joints. Larger open plates.', labels: ['plate'] },
  { id: 'still', name: 'Vibration dampening', head: ['Vibration', 'dampening'], line: 'Micro-vibrations absorbed, for robots and cleanrooms.', labels: ['robot'] },
  { id: 'rust', name: 'Zero rust', head: ['Zero rust', 'vulnerability'], line: 'Mineral through and through. No corrosion, no dusting.', labels: ['steel', 'mesh'] },
  { id: 'carbon', name: 'Low-carbon', head: ['Low-carbon', 'infrastructure'], line: 'Far less embodied carbon in the build.', labels: ['carbon'] },
]

const LABELS: LabelSpec[] = [
  { id: 'web', anchor: 'ff-web', text: 'Continuous 3D web', dx: 60, dy: -90 },
  { id: 'load', anchor: 'ff-load', text: 'Slab deflects', dx: 60, dy: -60 },
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

/** scrolls to where feature k has played out, its words still in place */
function goToFeature(k: number) {
  const el = document.getElementById('features')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.72)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
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
          c.style.setProperty('--f', Math.min(1, Math.max(0, f / 0.94)).toFixed(4))
          c.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
        }
      })
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = featureAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
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
  }, [t, sectionRef])

  const shown = FEATURES.find((a) => a.id === lit)?.labels ?? []

  return (
    <section ref={sectionRef} id="features" className="fu-ans on-yellow" aria-labelledby="ffo-features-title" style={{ '--run': RUN } as CSSProperties}>
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
          after={
            <button
              type="button"
              className="fu-bar__back"
              onClick={() => {
                const el = document.getElementById('layer')
                if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
              }}
            >
              Back to the layer
            </button>
          }
        />
      </div>
    </section>
  )
}
