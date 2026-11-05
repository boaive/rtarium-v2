import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion, useIsCompact } from '../lib/motion'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../facade/three/Stage3D'
import { createBus, type LabelBus } from '../facade/three/kit'
import { usePlay, type Progress } from '../facade/progress'
import { useLive } from '../facade/unitized/live'
import { Wake } from '../facade/three/rain/lines'
import type { BuildRoom } from './data/three/BuildScene'
import { cutFade } from './semi/three/camera'

/**
 * Where the conventional floor fails, on black, on one screen: every reason in one list on the left,
 * read at a glance, and on the right the scene playing them through once, on its own clock, as the
 * section comes in; the reason it is showing lights in the list, and any of them can be clicked to see
 * it. The page is never held: this is a screen on the way to RTARIUM, the focus of the page. Where a
 * step's scale is too far from the next one's (`cuts`), the scene dissolves rather than travels.
 */

export interface Reason {
  id: string
  name: string
  line: string
  labels: string[]
}

export type FailSceneOf = (t: Progress, bus: LabelBus, compact: boolean, room: { current: BuildRoom }, live: { current: boolean }) => ReactNode

const NO_CUTS: number[] = []
/** seconds for each reason */
const PER = 3.6

export function FailStage({ id, title, label, reasons, labels, scene, fallback, cuts = NO_CUTS }: { id: string; title: string; label: string; reasons: Reason[]; labels: LabelSpec[]; scene: FailSceneOf; fallback: ReactNode; cuts?: number[] }) {
  const N = reasons.length
  const compact = useIsCompact()
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const live = useLive(section)
  const [play, seek] = usePlay(section, N * PER)
  /** the play as reasons (reason k over k..k+1), told to the scene */
  const t = useMemo<Progress>(() => ({ value: 0, listeners: new Set() }), [])
  const bus = useMemo(createBus, [])
  const [step, setStep] = useState(0)
  const [lit, setLit] = useState('')
  /** the room the scene keeps to, from the layout: right of the list, under the header, over the foot */
  const space = useRef<BuildRoom>({ x: 0.44, y: 0.16, w: 0.52, h: 0.72 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const w = copy.current?.getBoundingClientRect()
      if (!p || !w || !p.width || !p.height) return
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0
      if (compact) {
        space.current = { x: 0.04, y: (navH + 8) / p.height, w: 0.92, h: Math.max(0.2, (w.top - p.top - navH - 16) / p.height) }
        return
      }
      const x0 = w.right + 40
      const y0 = navH + 16
      const y1 = p.height - 28
      space.current = { x: (x0 - p.left) / p.width, y: y0 / p.height, w: (p.right - x0 - 24) / p.width, h: (y1 - y0) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [compact])

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const paint = () => {
      const v = Math.min(N - 1e-4, play.value * N)
      if (t.value !== v) {
        t.value = v
        t.listeners.forEach((f) => f())
      }
      if (stage.current) stage.current.style.opacity = reduced ? '' : cutFade(v, cuts).toFixed(3)
      const k = Math.min(N - 1, Math.floor(v))
      setStep(k)
      // a reason's labels are up once it has played out
      const f = v - k
      setLit(f > 0.5 && f < 0.92 + (k === N - 1 ? 1 : 0) ? reasons[k].id : '')
    }
    paint()
    play.listeners.add(paint)
    return () => void play.listeners.delete(paint)
  }, [play, t, N, reasons, cuts])

  const shown = reasons.find((r) => r.id === lit)?.labels ?? []

  return (
    <section ref={section} id={id} className="fu-flaws on-black" data-ground="black" aria-labelledby={`${id}-title`}>
      <div ref={pin} className="fu-flaws__pin">
        <div ref={stage} className="fu-flaws__stage fu-flaws__stage--full" aria-hidden="true">
          <Stage3D shadows fallback={fallback}>
            <Wake live={live} />
            {scene(t, bus, compact, space, live)}
            <LabelProjector bus={bus} bottom={compact ? 300 : 40} />
          </Stage3D>
          <Labels bus={bus} labels={labels} shown={shown} />
        </div>

        <div ref={copy} className="fu-flaws__copy">
          <h2 id={`${id}-title`} className="fu-flaws__title">
            {title}
          </h2>
          <ol className="fu-flaw-list" aria-label={label}>
            {reasons.map((r, k) => (
              <li key={r.id} className="fu-flaw" data-now={k === step || undefined}>
                <button type="button" className="fu-flaw__btn" aria-current={k === step ? 'step' : undefined} onClick={() => seek((k + 0.72) / N)}>
                  <span className="fu-flaw__num num">0{k + 1}</span>
                  <span className="fu-flaw__name">{r.name}</span>
                  <span className="fu-flaw__line">{r.line}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
