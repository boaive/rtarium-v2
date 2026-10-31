import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { damp, prefersReducedMotion, useIsCompact } from '../../lib/motion'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { smooth, type Progress } from '../../facade/progress'
import { useLive } from '../../facade/unitized/live'
import { StepBar } from '../../facade/unitized/StepBar'
import type { BuildRoom } from '../data/three/BuildScene'
import { FailScene } from './three/FailScene'

/**
 * Where a traditional floor fails, on black: the build's pinned stage and its bar, the words on the
 * left, the scene in the room right of them. The page's one use of red is here, in the bar and the
 * stress and cracks in the scene, to mark failure: the shift to yellow and black at the next section
 * is the signal that the problem has been answered. The client's two scenes, the fast floor
 * and its failure, as five beats. The scroll is the clock.
 */

interface Beat {
  id: string
  name: string
  head: [string, string]
  line: string
  labels: string[]
}

const BEATS: Beat[] = [
  { id: 'race', name: 'At full speed', head: ['At full', 'speed'], line: 'AGVs and picking cranes, down narrow aisles.', labels: [] },
  { id: 'stress', name: 'Into the slab', head: ['Into', 'the slab'], line: 'Every wheel load runs down through the screed.', labels: ['stress'] },
  { id: 'joint', name: 'The joint', head: ['Rolling', 'shear'], line: 'Heavy wheels cross the saw-cut joint, again and again.', labels: ['joint'] },
  { id: 'spall', name: 'Spall and crack', head: ['Spalled,', 'pitted, cracked'], line: 'The edges break up. Micro-cracks run out.', labels: ['crack'] },
  { id: 'stop', name: 'System stop', head: ['System', 'stop'], line: 'A wheel catches. The laser loses alignment.', labels: ['laser'] },
]

const LABELS: LabelSpec[] = [
  { id: 'stress', anchor: 'fl-stress', text: 'Stress paths', dx: 70, dy: 80 },
  { id: 'joint', anchor: 'fl-joint', text: 'Saw-cut joint', dx: 70, dy: 90 },
  { id: 'crack', anchor: 'fl-crack', text: 'Micro-cracks', dx: 70, dy: 90 },
  { id: 'laser', anchor: 'fl-laser', text: 'Laser sensor', dx: 60, dy: -90 },
]

const STRETCH = [1.5, 1.6, 1.4, 1.6, 1.7]
const RUN = STRETCH.reduce((a, b) => a + b, 0)
const START = STRETCH.map((_, k) => STRETCH.slice(0, k).reduce((a, b) => a + b, 0))
const N = BEATS.length

function beatAt(s: number) {
  if (s <= 0) return 0
  for (let k = 0; k < N; k++) if (s < START[k] + STRETCH[k]) return k + (s - START[k]) / STRETCH[k]
  return N - 1e-4
}

function wordsAt(k: number, t: number) {
  const f = t - k
  if (f < 0) return 0
  const inn = k === 0 ? 1 : smooth(0, 0.14, f)
  const out = k === N - 1 ? 0 : smooth(0.8, 0.94, f)
  return inn * (1 - out)
}

function goToBeat(k: number) {
  const el = document.getElementById('failure')
  if (!el) return
  scrollToY(el.getBoundingClientRect().top + window.scrollY + (START[k] + STRETCH[k] * (k === N - 1 ? 0.9 : 0.72)) * window.innerHeight)
}

export function Failure() {
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLDivElement | null)[]>([])
  const cells = useRef<(HTMLLIElement | null)[]>([])
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
      BEATS.forEach((_, k) => {
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
      const target = beatAt(-el.getBoundingClientRect().top / window.innerHeight)
      p = p < 0 || reduced ? target : damp(p, target, 12, dt)
      if (Math.abs(p - target) < 1e-4) p = target
      if (t.value !== p) {
        t.value = p
        t.listeners.forEach((f) => f())
      }
      place()
      const k = Math.min(N - 1, Math.max(0, Math.floor(p)))
      setStep(k)
      const f = p - k
      setLit(f > 0.5 && f < 0.82 + (k === N - 1 ? 1 : 0) ? BEATS[k].id : '')
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

  const shown = BEATS.find((b) => b.id === lit)?.labels ?? []

  return (
    <section ref={section} id="failure" className="fu-ans on-black faw-fail" data-ground="black" aria-labelledby="faw-fail-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-ans__pin">
        <div className="fu-ans__stage" aria-hidden="true">
          <Stage3D fallback={<img className="fu-still" src="/img/flooring/aw-agv-aisle.webp" alt="" />}>
            <FailScene t={t} bus={bus} compact={compact} room={space} live={live} />
            <LabelProjector bus={bus} bottom={compact ? 300 : 110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>

        <h2 id="faw-fail-title" className="fu-ans__title">
          Where the screed fails
        </h2>

        <div ref={room} className="fu-ans__words">
          {BEATS.map((b, k) => (
            <div key={b.id} ref={(el) => void (words.current[k] = el)} className="fu-ans__text" style={k ? { opacity: 0, visibility: 'hidden' } : undefined}>
              <h3 className="fu-ans__name">
                {b.head[0]} <br />
                {b.head[1]}
              </h3>
              <p className="fu-ans__line">{b.line}</p>
            </div>
          ))}
        </div>

        <StepBar label="How a traditional floor fails" names={BEATS.map((b) => b.name)} step={step} onGo={goToBeat} cellRef={(k, el) => void (cells.current[k] = el)} />
      </div>
    </section>
  )
}
