import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { scrollToY } from '../../lib/scroll'
import { Stage3D, LabelProjector, Labels, type LabelSpec } from '../../facade/three/Stage3D'
import { createBus } from '../../facade/three/kit'
import { FollowScroll, smooth, useScrollProgress } from '../../facade/progress'
import { StepBar } from '../../facade/unitized/StepBar'
import type { BuildRoom } from '../data/three/BuildScene'
import { FRAME, FrameScene } from './three/FrameScene'

/**
 * Frame to floor: the Data & AI Centres section as it stands, one scene on the warm white page, pinned
 * for its run, the title over it and the bar along its foot. The floor the build ended on takes its
 * racks and its truck, grows into the aisles of a hall, and the fulfilment centre is drawn round it,
 * its last label on the floor.
 */

const PHASES = [
  { name: 'The floor', from: 0, to: FRAME.racks[1] },
  { name: 'The aisles', from: FRAME.grow[0], to: FRAME.aisles[1] },
  { name: 'The high bay', from: FRAME.frame[0], to: FRAME.frame[1] },
  { name: 'The fulfilment centre', from: FRAME.shell[0], to: FRAME.plant[1] },
]
const RUN = 6.5

const LABELS: LabelSpec[] = [
  { id: 'piece', anchor: 'fw-piece', text: 'RTARIUM armoured floor', dx: -60, dy: 80 },
  { id: 'floor', anchor: 'fw-floor', text: 'The RTARIUM floor', dx: 60, dy: 70 },
]

export function FloorFrame() {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const [progress] = useScrollProgress(section, 1, 'run')
  const bus = useMemo(createBus, [])
  const cells = useRef<(HTMLLIElement | null)[]>([])
  const [step, setStep] = useState(0)
  const [shown, setShown] = useState<string[]>([])
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
      if (p > FRAME.racks[1] - 0.02 && p < FRAME.grow[0]) on.push('piece')
      if (p > FRAME.plant[1] - 0.02) on.push('floor')
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
  const holds = [FRAME.racks[1] + 0.01, FRAME.aisles[1] + 0.01, FRAME.frame[1] + 0.005, FRAME.plant[1] + 0.04]

  return (
    <section ref={section} id="frame" className="fu-hang on-light" aria-labelledby="faw-frame-title" style={{ '--run': RUN } as CSSProperties}>
      <div ref={pin} className="fu-hang__pin">
        <h2 id="faw-frame-title" className="fu-hang__title">
          Frame to floor.
        </h2>
        <div className="fu-hang__stage" aria-hidden="true">
          <Stage3D fallback={<img className="fu-still" src="/img/flooring/aw-highbay.webp" alt="" />}>
            <FrameScene progress={progress} bus={bus} room={room} />
            <FollowScroll progress={progress} />
            <LabelProjector bus={bus} bottom={110} />
          </Stage3D>
          <Labels bus={bus} labels={LABELS} shown={shown} />
        </div>
        <StepBar label="From the floor to the building" names={PHASES.map((ph) => ph.name)} step={step} onGo={(i) => go(holds[i])} cellRef={(i, el) => void (cells.current[i] = el)} />
      </div>
    </section>
  )
}
