import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { FollowScroll, smooth, useScrollProgress } from '../../facade/progress'
import { StepBar } from '../../facade/unitized/StepBar'
import type { BuildRoom } from '../data/three/BuildScene'
import { FRAME, FrameScene } from './three/FrameScene'

/**
 * Frame to floor, after the build, as on the Data & AI Centres page: one scene on the warm white page,
 * pinned for its run, the title over it and the bar along its foot. The floor the build ended on is
 * the first thing seen; a tool is drawn on it, it grows into the cleanroom, the waffle slab and the
 * subfab are drawn under it and the fab round it. The camera keeps the scene to the room between the
 * title and the bar, never edge to edge.
 */

const PHASES = [
  { name: 'The floor', from: 0, to: FRAME.tool[1] },
  { name: 'The cleanroom', from: FRAME.grow[0], to: FRAME.bay[1] },
  { name: 'Waffle slab and subfab', from: FRAME.under[0], to: FRAME.under[1] },
  { name: 'The fab', from: FRAME.fab[0], to: FRAME.fab[1] },
]
const RUN = 6.5

const LABELS: LabelSpec[] = [
  { id: 'piece', anchor: 'sf-piece', text: 'RTARIUM cleanroom floor', dx: -60, dy: 80 },
  { id: 'floor', anchor: 'sf-floor', text: 'The RTARIUM floor', dx: 60, dy: 70 },
]

export function FloorFrame() {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const bus = useMemo(createBus, [])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)
  const [shown, setShown] = useState<string[]>([])
  /** the room the scene keeps to: between the gutters, under the title, over the bar */
  const room = useRef<BuildRoom>({ x: 0.05, y: 0.2, w: 0.9, h: 0.62 })

  useEffect(() => {
    const measure = () => {
      const p = pin.current?.getBoundingClientRect()
      const title = pin.current?.querySelector('.fu-hang__title')?.getBoundingClientRect()
      const bar = pin.current?.querySelector('.fu-bar')?.getBoundingClientRect()
      if (!p || !title || !bar || !p.width || !p.height) return
      const y0 = title.bottom + 24
      const y1 = bar.top - 28
      room.current = { x: (bar.left - p.left) / p.width, y: (y0 - p.top) / p.height, w: bar.width / p.width, h: (y1 - y0) / p.height }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const paint = () => {
      const p = progress.value
      let now = 0
      PHASES.forEach((ph, i) => {
        if (p >= ph.from - 0.02) now = i
        const el = cells.current[i]
        if (!el) return
        el.style.setProperty('--f', smooth(ph.from, ph.to, p).toFixed(4))
        const next = PHASES[i + 1]
        el.style.setProperty('--c', (next ? smooth(next.from - 0.03, next.from + 0.005, p) : 0).toFixed(4))
      })
      setStep(now)
      const on: string[] = []
      if (p > FRAME.tool[1] - 0.02 && p < FRAME.grow[0]) on.push('piece')
      if (p > FRAME.fab[1] - 0.02) on.push('floor')
      setShown((s) => (s.join() === on.join() ? s : on))
    }
    paint()
    progress.listeners.add(paint)
    return () => void progress.listeners.delete(paint)
  }, [progress])

  const go = (p: number) => {
    const el = section.current
    if (!el) return
    scrollToY(el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - window.innerHeight) * p)
  }
  /** where each step of the bar takes you: once its part has been made */
  const holds = [FRAME.tool[1] + 0.01, FRAME.bay[1] + 0.01, FRAME.under[1] + 0.01, FRAME.fab[1] + 0.04]

  return (
    <section ref={section} id="frame" className="fu-hang on-light" aria-labelledby="fsc-frame-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-hang__pin">
        <h2 id="fsc-frame-title" className="fu-hang__title">
          Frame to floor.
        </h2>
        <div className="fu-hang__stage" aria-hidden="true">
          <Stage3D fallback={<img className="fu-still" src="/img/flooring/dc-site-gloss.webp" alt="" />}>
            <FrameScene progress={progress} bus={bus} room={room} />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>
        <StepBar label="From the floor to the fab" names={PHASES.map((ph) => ph.name)} step={step} onGo={(i) => go(holds[i])} cellRef={(i, el) => void (cells.current[i] = el)} />
      </div>
    </section>
  )
}
