import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { useLive } from '../../facade/unitized/live'
import { StepBar } from '../../facade/unitized/StepBar'
import type { BuildRoom } from '../data/three/BuildScene'
import { SolveScene } from './three/SolveScene'

/**
 * The solution, on yellow with black: the same stage and bar as the failure, the change of ground the
 * signal that the problem has been answered. The client's scenes 3 to 9, the last the failure's first
 * shot again, the same aisle running true on the new floor. The pour has the site's own footage under
 * its words, opening out of its corner as the Data & AI Centres build's does.
 */

interface Step {
  id: string
  name: string
  head: [string, string]
  line: string
  /** its labels, each with when in the step it is up */
  labels: [string, number, number][]
  clip?: { src: string; poster: string; label: string }
}

const STEPS: Step[] = [
  { id: 'prep', name: 'Prepare the base', head: ['Prepare', 'the base'], line: 'Shot-blast the surface to ICRI CSP-5, apply the primer and set the anchors at a consistent height.', labels: [['csp', 0.3, 0.6], ['button', 0.84, 0.97]] },
  { id: 'mesh', name: 'Install the RTARIUM mesh', head: ['Install the', 'RTARIUM mesh'], line: 'Snap the mesh onto the anchors, leaving 5 mm of cover below and 5 mm above.', labels: [['c2', 0.58, 0.8], ['m', 0.58, 0.8], ['c1', 0.58, 0.8]] },
  {
    id: 'pour',
    name: 'Pump the screed',
    head: ['Pump', 'the screed'],
    line: 'Pump self-levelling concrete over the mesh using the H1-561 mixer-pump.',
    labels: [['pump', 0.3, 0.76], ['flow', 0.55, 0.76]],
    clip: { src: '/video/aw-pour.mp4', poster: '/video/aw-pour.jpg', label: 'On site: self-levelling concrete pumped through a hose onto the mesh' },
  },
  { id: 'bays', name: 'Enable larger monolithic bays', head: ['Enable larger', 'monolithic bays'], line: 'Significantly fewer expansion joints than a standard floor.', labels: [['bay', 0.66, 0.8], ['joint', 0.66, 0.8]] },
  { id: 'trowel', name: 'Finish with a power trowel', head: ['Finish with a', 'power trowel'], line: 'Use a ride-on power trowel to bring the surface to a glass-smooth finish.', labels: [['trowel', 0.3, 0.8]] },
  { id: 'wear', name: 'Apply the surface coating', head: ['Apply the', 'surface coating'], line: 'Apply a polyurethane or polyaspartic coating over the ultra-flat floor.', labels: [['coat', 0.66, 0.87], ['mesh', 0.66, 0.87], ['slab', 0.66, 0.87]] },
  { id: 'loop', name: 'Run at full capacity', head: ['Run at', 'full capacity'], line: 'Support continuous 24/7 operations at maximum speed.', labels: [] },
]

const LABELS: LabelSpec[] = [
  { id: 'csp', anchor: 'sv-csp', text: 'ICRI CSP-5 profile', dx: 60, dy: -84 },
  { id: 'button', anchor: 'sv-button', text: 'Anchor buttons', dx: -40, dy: 96 },
  { id: 'c2', anchor: 'sv-c2', text: '5 mm cover', dx: 96, dy: -70 },
  { id: 'm', anchor: 'sv-m', text: 'RTARIUM, 10 mm', dx: 120, dy: 0 },
  { id: 'c1', anchor: 'sv-c1', text: '5 mm cover', dx: 96, dy: 70 },
  { id: 'pump', anchor: 'sv-pump', text: 'H1-561 mixer-pump', dx: -56, dy: -60 },
  { id: 'flow', anchor: 'sv-flow', text: '800 mm slump flow', dx: 60, dy: 90 },
  { id: 'bay', anchor: 'sv-bay', text: 'Monolithic bay', dx: 60, dy: -80 },
  { id: 'joint', anchor: 'sv-joint', text: 'Expansion joint', dx: 40, dy: 70 },
  { id: 'trowel', anchor: 'sv-trowel', text: 'Ride-on power trowel', dx: 50, dy: -70 },
  { id: 'coat', anchor: 'sv-coat', text: 'Polyurethane or polyaspartic', dx: 60, dy: -96 },
  { id: 'mesh', anchor: 'sv-mesh', text: 'RTARIUM', dx: -60, dy: 90 },
  { id: 'slab', anchor: 'sv-slab', text: 'PT or SFRC slab', dx: 56, dy: 70 },
]

const STRETCH = [2.4, 2.2, 1.9, 1.8, 1.7, 2.3, 1.8]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))
const N = STEPS.length

function stepAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}

function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.14, f)
  const out = k === N - 1 ? 0 : smooth(0.86, 0.97, f)
  return inn * (1 - out)
}

function goToStep(k: number) {
  const el = document.getElementById('solution')
  if (!el) return
  scrollToY(el.getBoundingClientRect().top + window.scrollY + (START[k] + STRETCH[k] * (k === N - 1 ? 0.8 : 0.8)) * window.innerHeight)
}

export function Solution() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const clips = useRef<(HTMLElement | null)[]>([])
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const live = useLive(section)
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  const space = useRef<BuildRoom>({ x: 0.38, y: 0.2, w: 0.58, h: 0.62 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const head = pin.current?.querySelector('.fu-ans__title')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !head || !p.width || !p.height) return
      const x0 = w.right + 32
      const y0 = head.bottom + 24
      const y1 = bar.top - 28
      space.current = { x: (x0 - p.left) / p.width, y: (y0 - p.top) / p.height, w: (bar.right - x0) / p.width, h: (y1 - y0) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // left as the slab to slab's build is, by the page's stepper (usePageSteps): plays with the scroll going down, never
  // back, its bar playing it to a step; done where its last step has played out
  const done = (START[N - 1] + STRETCH[N - 1] * 0.8) / RUN

  useEffect(() => {
    const el = section.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let p = -1
    const place = () => {
      STEPS.forEach((s, k) => {
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
        const c = clips.current[k]
        if (c && s.clip) {
          const g = Math.max(0, smooth(0.06, 0.3, f) - smooth(0.74, 0.9, f))
          c.style.setProperty('--g', g.toFixed(4))
          c.style.visibility = g > 0.003 ? '' : 'hidden'
          const v = videos.current[k]
          if (v) {
            if (g > 0.5 && !reduced) {
              if (!v.src) v.src = s.clip.src
              if (v.paused) v.play().catch(() => {})
            } else if (!v.paused) v.pause()
          }
        }
        const cell = cells.current[k]
        if (cell) {
          cell.style.setProperty('--f', Math.min(1, Math.max(0, f / (k === N - 1 ? 0.8 : 0.8))).toFixed(4))
          cell.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
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
      if (t.value !== p) {
        t.value = p
        t.listeners.forEach((f) => f())
      }
      place()
      const k = Math.min(N - 1, Math.max(0, Math.floor(p)))
      setStep(k)
      const f = p - k
      const on = STEPS[k].labels
        .filter(([, a, b]) => f > a && f < b)
        .map(([id]) => id)
        .join()
      setLit(on)
    }
    // a step of the bar (`run:show`, from the page's stepper): the run played to that step, back or on, smoothly and in a time
    // of its own, as the slab to slab's bar plays to its step; `move`: the page goes straight there first
    let seeking = false
    let seekRaf = 0
    const seek = (to: number, at?: number) => {
      cancelAnimationFrame(seekRaf)
      // (a step of the bar plays in full, from its own start: `at`)
      const from = at ?? (p < 0 ? to : p)
      if (reduced || Math.abs(to - from) < 1e-4) {
        p = to
        apply()
        return
      }
      const time = Math.min(4.2, 1.6 + 1.4 * Math.abs(to - from)) * 1000
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
      const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.8 : 0.8)
      if (move) scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight, true)
      seek(stepAt(s), k)
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
  }, [t])

  // the labels change with the step, after the frame that moved the scene there: the scene, which draws only when asked,
  // is asked for one more, so the labels it places are the new step's, never the last one's left where they stood
  useEffect(() => {
    t.listeners.forEach((f) => f())
  }, [lit, t])

  const shown = lit ? lit.split(',') : []

  return (
    <section data-done={done} ref={section} id="solution" className="fu-ans on-yellow fdc-build" aria-labelledby="faw-solve-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows keyLight={false} fallback={<img className="fu-still" src="/img/flooring/aw-site-pour.webp" alt="" />}>
            <SolveScene t={t} bus={bus} compact={compact} room={space} live={live} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>

        <h2 id="faw-solve-title" className="fu-ans__title">
          How RTARIUM holds
        </h2>

        <div ref={room} className="fu-ans__words">
          {STEPS.map((s, k) => (
            <div key={s.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {s.head[0]} <br />
                {s.head[1]}
              </h3>
              <p className="fu-ans__line">{s.line}</p>
              {s.clip && (
                <figure ref={(el) => void (clips.current[k] = el)} className="fu-ans__shot fdc-build__clip" style={{ visibility: 'hidden' }}>
                  <span className="fu-ans__frame">
                    <video ref={(el) => void (videos.current[k] = el)} muted loop playsInline preload="none" poster={s.clip.poster} aria-label={s.clip.label} width={640} height={360} />
                  </span>
                  <figcaption className="fdc-build__site">On site</figcaption>
                </figure>
              )}
            </div>
          ))}
        </div>

        <StepBar label="How the floor is built" names={STEPS.map((s) => s.name)} step={step} onGo={goToStep} cellRef={(k, el) => void (cells.current[k] = el)} hints="run" />
      </div>
    </section>
  )
}
