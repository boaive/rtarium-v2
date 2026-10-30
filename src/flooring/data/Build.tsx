import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { StepBar } from '../../facade/unitized/StepBar'
import { BuildScene, type BuildRoom } from './three/BuildScene'

/**
 * Built up from the slab, on yellow, in the Unitized answers' stage (and the Rainscreen bridge's): one
 * pinned screen, the words always in one place on the left, the floor in the room right of them, a bar
 * along the foot. From the bare slab the floor is made in the client's order. A step's words come in
 * where the last ones were (a fade and a short settle), and only then does the floor play it out; the
 * camera moves only in the gap between steps, and every shot is fitted to the room, so the 3D never
 * leaves it. The pour and the trowelling have the site's own footage under their words, opening out
 * of its corner like the Unitized ferrules' photograph. The scroll is the clock; nothing is held.
 */

interface Step {
  id: string
  name: string
  head: [string, string]
  line: string
  labels: string[]
  clip?: { src: string; poster: string; label: string }
}

const STEPS: Step[] = [
  { id: 'slab', name: 'The bare slab', head: ['The bare', 'slab'], line: 'Prestressed hollow-core planks: butt joints and mild undulations.', labels: ['joint', 'wave'] },
  { id: 'anchor', name: 'Primer and anchors', head: ['Primer and', 'anchors'], line: 'A bonding primer, then 10 mm discs with T-stems to hold the mesh.', labels: ['primer', 'button'] },
  { id: 'mesh', name: 'RTARIUM mesh', head: ['10 mm', 'RTARIUM mesh'], line: 'Clipped onto the stems: 5 mm of cover below, 5 mm above.', labels: ['mesh', 'gap'] },
  {
    id: 'pour',
    name: 'The pour',
    head: ['Pumped', 'over the mesh'],
    line: 'Free-flow concrete from the H1-561 mixer-pump.',
    labels: ['pump', 'flow'],
    clip: { src: '/video/dc-pour.mp4', poster: '/video/dc-pour.jpg', label: 'On site: concrete pumped onto the floor through the hose' },
  },
  {
    id: 'trowel',
    name: 'Power trowelled',
    head: ['Power', 'trowelled'],
    line: 'Brought to a polished concrete finish.',
    labels: ['trowel'],
    clip: { src: '/video/dc-trowel.mp4', poster: '/video/dc-trowel.jpg', label: 'On site: a power trowel finishing a strip of the floor' },
  },
  { id: 'esd', name: 'ESD coating', head: ['ESD', 'coating'], line: 'A conductive primer, then self-levelling epoxy: a continuous path to ground.', labels: ['cond', 'epoxy'] },
]

const LABELS: LabelSpec[] = [
  { id: 'joint', anchor: 'bd-joint', text: 'Butt joint', dx: 50, dy: 96 },
  { id: 'wave', anchor: 'bd-wave', text: 'Mild undulations', dx: 50, dy: -96 },
  { id: 'primer', anchor: 'bd-primer', text: 'Bonding primer', dx: 60, dy: -100 },
  { id: 'button', anchor: 'bd-button', text: 'Anchor button', dx: 56, dy: 100 },
  { id: 'mesh', anchor: 'bd-mesh', text: 'RTARIUM, 10 mm', dx: 60, dy: -104 },
  { id: 'gap', anchor: 'bd-gap', text: '5 mm off the slab', dx: 60, dy: 96 },
  { id: 'pump', anchor: 'bd-pump', text: 'H1-561 mixer-pump', dx: -56, dy: -60 },
  { id: 'flow', anchor: 'bd-flow', text: 'Free-flow concrete', dx: 60, dy: 90 },
  { id: 'trowel', anchor: 'bd-trowel', text: 'Power trowel', dx: 50, dy: -70 },
  { id: 'cond', anchor: 'bd-cond', text: 'Conductive primer', dx: 60, dy: 90 },
  { id: 'epoxy', anchor: 'bd-epoxy', text: 'Self-levelling ESD epoxy', dx: 60, dy: -90 },
]

/** screens of scroll for each step: the pour and the trowel have their passes to make */
const STRETCH = [1.3, 1.4, 1.4, 1.7, 1.5, 1.6]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))
const N = STEPS.length

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
  const out = k === N - 1 ? 0 : smooth(0.8, 0.94, f)
  return inn * (1 - out)
}

/** scrolls to where step k has played out, its words still in place */
function goToStep(k: number) {
  const el = document.getElementById('build')
  if (!el) return
  const s = START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.76)
  scrollToY(el.getBoundingClientRect().top + window.scrollY + s * window.innerHeight)
}

export function Build() {
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
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  /** the room the scene keeps to, from the layout: right of the words to the bar's end, under the title to over the bar */
  const space = useRef<BuildRoom>({ x: 0.38, y: 0.2, w: 0.58, h: 0.62 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = room.current?.getBoundingClientRect()
      const title = pin.current?.querySelector('.fu-ans__title')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !w || !bar || !title || !p.width || !p.height) return
      const x0 = w.right + 32
      const y0 = title.bottom + 24
      const y1 = bar.top - 28
      space.current = { x: (x0 - p.left) / p.width, y: (y0 - p.top) / p.height, w: (bar.right - x0) / p.width, h: (y1 - y0) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

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
        // the footage opens out of its corner as the words come in, and plays only while it is open
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
          cell.style.setProperty('--f', Math.min(1, Math.max(0, f / 0.94)).toFixed(4))
          cell.style.setProperty('--c', (k < N - 1 ? smooth(0.86, 1, f) : 0).toFixed(4))
        }
      })
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const vh = window.innerHeight
      const target = stepAt(-el.getBoundingClientRect().top / vh)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      if (t.value !== p) {
        t.value = p
        t.listeners.forEach((f) => f())
      }
      place()
      const k = Math.min(N - 1, Math.max(0, Math.floor(p)))
      setStep(k)
      // a step's labels are up once it has played out, until its words go
      const f = p - k
      setLit(f > 0.55 && f < 0.8 + (k === N - 1 ? 1 : 0) ? STEPS[k].id : '')
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
  }, [t])

  const shown = STEPS.find((s) => s.id === lit)?.labels ?? []

  return (
    <section ref={section} id="build" className="fu-ans on-yellow fdc-build" aria-labelledby="fdc-build-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D shadows fallback={<img className="fu-still" src="/img/flooring/dc-site-strip.webp" alt="" />}>
            <BuildScene t={t} bus={bus} compact={compact} room={space} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>

        <h2 id="fdc-build-title" className="fu-ans__title">
          Built up from the slab
        </h2>

        {/* the words, all in one place, one step at a time, each name starting on the same line */}
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
                    <video
                      ref={(el) => void (videos.current[k] = el)}
                      muted
                      loop
                      playsInline
                      preload="none"
                      poster={s.clip.poster}
                      aria-label={s.clip.label}
                      width={640}
                      height={360}
                    />
                  </span>
                  <figcaption className="fdc-build__site">On site</figcaption>
                </figure>
              )}
            </div>
          ))}
        </div>

        <StepBar
          label="How the floor is built"
          names={STEPS.map((s) => s.name)}
          step={step}
          onGo={goToStep}
          cellRef={(k, el) => void (cells.current[k] = el)}
          after={
            <button
              type="button"
              className="fu-bar__back"
              onClick={() => {
                const el = document.getElementById('problems')
                if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
              }}
            >
              Back to the problems
            </button>
          }
        />
      </div>
    </section>
  )
}
